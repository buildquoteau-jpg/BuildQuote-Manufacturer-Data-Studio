// POST /api/knowledge/ask — the AI Knowledge Gap & Feedback Loop's entry
// point (design doc addendum §A5). Public, no auth — matches the "fully
// open, protectable later via resolveKnowledgeAccess" decision already made
// for every other knowledge-layer route (lib/knowledge/access.ts).
//
// { manufacturerSlug, systemSlug, question, anonSessionId? }
//
// Retrieval order (§11 of the master spec — "don't create a gap too early"):
//   1. Query-term match (vocabulary.ts, existing synonym dictionary)
//   2. Structured assertion scan (buildFactsForCanonicalSystem, existing)
//   3. Semantic search over published card content (searchCardSources, existing RPC)
//   4. Answer composition — an LLM constrained to ONLY the facts/excerpts
//      retrieval found, instructed to emit NO_VERIFIED_ANSWER when they
//      don't support a definitive answer.
//
// The no-hallucination guarantee is structural, not just prompted: if stage
// 2+3 together produce no answerable evidence, the LLM is never called at
// all — there is nothing it could be tempted to guess from. This is the
// same enforcement style as SUPPRESSED_FROM_READING_SURFACE (vocabulary.ts):
// a generator/route invariant, not an editorial instruction to a model that
// might ignore it.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import { buildFactsForCanonicalSystem, SYSTEM_FIELD_DESCRIPTORS } from '@/lib/knowledge/buildSystemKnowledge'
import { findMatchingQueryTerms, resolveAnswerPolicy, type AnswerPolicy } from '@/lib/knowledge/vocabulary'
import { searchCardSources, type CardSourceMatch } from '@/lib/knowledge/searchCardSources'
import {
  normaliseQuestion,
  isNearDuplicateQuestion,
  classifyFailureType,
  buildRecoveryPayload,
  explanationForFailureType,
  type NormalisedQuestion,
} from '@/lib/knowledge/askPipeline'
import type { Assertion } from '@/lib/knowledge/types'

export const runtime = 'nodejs'

const ANSWERABLE_POLICIES: ReadonlySet<AnswerPolicy> = new Set<AnswerPolicy>([
  'answer_directly', 'answer_with_conditions', 'answer_with_source', 'answer_with_warning',
])

const DESCRIPTORS_BY_PREDICATE = new Map(SYSTEM_FIELD_DESCRIPTORS.map((d) => [d.predicate, d]))

function isMissingSchemaError(message: string | undefined): boolean {
  return /ai_knowledge_gaps|does not exist|42P01|42703/i.test(message ?? '')
}

// ── Coarse per-instance rate limiter ────────────────────────────────────────
// Not durable (resets on redeploy/restart, not shared across instances) —
// a real limiter (Upstash/Redis) is Phase 2 per the plan's own scoping
// ("beyond a basic per-anon-id throttle"). This is the basic one: caps a
// single anon session to 20 questions/hour so one open tab can't hammer the
// LLM/embedding providers.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 20
const rateLimitLog = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (rateLimitLog.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  recent.push(now)
  rateLimitLog.set(key, recent)
  return recent.length > RATE_LIMIT_MAX
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    manufacturerSlug?: string
    systemSlug?: string
    question?: string
    anonSessionId?: string
  } | null

  const manufacturerSlug = body?.manufacturerSlug?.trim()
  const systemSlug = body?.systemSlug?.trim()
  const question = body?.question?.trim()
  const anonSessionId = body?.anonSessionId?.trim() || null

  if (!manufacturerSlug || !systemSlug || !question) {
    return NextResponse.json({ error: 'manufacturerSlug, systemSlug and question are required.' }, { status: 400 })
  }
  if (question.length > 500) {
    return NextResponse.json({ error: 'Question is too long.' }, { status: 400 })
  }

  const rateLimitKey = anonSessionId || req.headers.get('x-forwarded-for') || 'unknown'
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: 'Too many questions — please try again shortly.' }, { status: 429 })
  }

  const bundle = await fetchCanonicalSystemBundle(manufacturerSlug, systemSlug)
  const normalised = normaliseQuestion(question)

  // ── Stage 1 + 2: query-term match + structured assertion scan ───────────
  const matchedTerms = findMatchingQueryTerms(question)
  const matchedPredicates = new Set(matchedTerms.map((t) => t.predicate))

  let compactAssertions: Assertion[] = []
  if (bundle) {
    compactAssertions = buildFactsForCanonicalSystem(bundle).compactAssertions
  }

  function isCandidate(a: Assertion): boolean {
    if (matchedPredicates.has(a['bq:predicate'])) return true
    const d = DESCRIPTORS_BY_PREDICATE.get(a['bq:predicate'])
    if (!d) return false
    const labelWords = d.label.toLowerCase().split(/\s+/)
    return normalised.keywords.some((k) => labelWords.some((w) => w.includes(k) || k.includes(w)))
  }

  const candidateAssertions = compactAssertions.filter(isCandidate)
  const answerableAssertions = candidateAssertions.filter((a) => {
    const d = DESCRIPTORS_BY_PREDICATE.get(a['bq:predicate'])
    if (!d) return false
    return ANSWERABLE_POLICIES.has(resolveAnswerPolicy(a['bq:epistemicStatus'], d.claimType))
  })

  // ── Stage 3: semantic search over published card content ────────────────
  let semanticMatches: CardSourceMatch[] = []
  const semanticResult = await searchCardSources(question, { manufacturerId: bundle?.manufacturer.id ?? null, matchCount: 5 })
  if (semanticResult.ok && semanticResult.configured) {
    semanticMatches = semanticResult.matches
  }
  // A failed/unconfigured semantic stage is not a request error — it's one
  // fewer source of evidence, handled the same as "found nothing" below.

  // ── Stage 4: answer composition, only when there's something to answer from ─
  let llmProducedAnswer = false
  let answerText: string | null = null
  const hasEvidence = answerableAssertions.length > 0 || semanticMatches.length > 0

  if (hasEvidence && bundle && process.env.ANTHROPIC_API_KEY) {
    const factLines = answerableAssertions.map((a) => {
      const d = DESCRIPTORS_BY_PREDICATE.get(a['bq:predicate'])!
      return `- ${d.label}: ${JSON.stringify(a['bq:objectValue'])} [${a['bq:epistemicStatus']}]`
    })
    const semanticLines = semanticMatches.map((m) =>
      `- (${m.source_role ?? 'document'}${m.page_start ? `, page ${m.page_start}` : ''}): "${m.content.slice(0, 600)}"`,
    )

    const systemPrompt = `You are BuildQuote's product-question answering assistant. You answer ONLY from the verified facts and document excerpts below — you have no other knowledge of this product and must not use general construction knowledge, industry convention, or information about similar products.

Rules:
- If the facts and excerpts below do not contain a clear, definitive answer to the exact question asked, respond with EXACTLY this and nothing else: NO_VERIFIED_ANSWER
- Do not guess, estimate, or infer a value that is not explicitly stated below.
- Never state a performance value, compliance conclusion, certification, or compatibility claim unless it is explicitly present below.
- If you can answer, be concise (2-4 sentences) and make clear which fact supports the answer.

PRODUCT: ${bundle.system.name} (${bundle.manufacturer.name})

VERIFIED FACTS:
${factLines.length ? factLines.join('\n') : '(none matched)'}

DOCUMENT EXCERPTS:
${semanticLines.length ? semanticLines.join('\n') : '(none matched)'}`

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      })
      const text = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''
      if (text && !text.toUpperCase().startsWith('NO_VERIFIED_ANSWER')) {
        llmProducedAnswer = true
        answerText = text
      }
    } catch {
      // Model call failed — treat exactly like "no answer", never surface a
      // 500 to the builder over an LLM outage; the gap-logging path below
      // still runs.
    }
  }

  if (llmProducedAnswer && answerText) {
    return NextResponse.json({
      status: 'ANSWERED',
      answer: {
        text: answerText,
        citedFacts: answerableAssertions.map((a) => DESCRIPTORS_BY_PREDICATE.get(a['bq:predicate'])?.label).filter(Boolean),
      },
      message: null,
    })
  }

  // ── No verified answer — classify, log the gap, return recovery options ──
  const failureType = classifyFailureType({
    systemIdentified: !!bundle,
    meaningfulKeywordCount: normalised.keywords.length,
    candidateAssertionCount: candidateAssertions.length,
    answerableAssertionCount: answerableAssertions.length,
    semanticMatchCount: semanticMatches.length,
    llmProducedAnswer,
  })

  const recovery = buildRecoveryPayload({
    manufacturerSlug,
    systemSlug: bundle ? systemSlug : null,
    installGuideUrl: bundle?.system.install_guide_urls?.[0]?.url,
    techDataUrl: bundle?.system.tech_data_url,
    manufacturerName: bundle?.manufacturer.name,
    manufacturerWebsiteUrl: bundle?.manufacturer.website_url,
  })

  const gapResult = await logKnowledgeGap({
    question, normalised, failureType, bundle, anonSessionId,
    candidateAssertionIds: candidateAssertions.map((a) => a['@id']),
    missingInformation: explanationForFailureType(failureType),
  })

  return NextResponse.json({
    status: 'NO_VERIFIED_ANSWER',
    answer: null,
    message: 'I can’t give you a definitive answer to that from the verified information currently available for this product.',
    recovery,
    gapId: gapResult.displayId,
    gapLoggedMessage: gapResult.logged
      ? 'We’ve logged this question as a knowledge gap. This helps identify information that may need to be added or clarified in the product data.'
      : null,
  })
}

async function logKnowledgeGap(input: {
  question: string
  normalised: NormalisedQuestion
  failureType: ReturnType<typeof classifyFailureType>
  bundle: Awaited<ReturnType<typeof fetchCanonicalSystemBundle>>
  anonSessionId: string | null
  candidateAssertionIds: string[]
  missingInformation: string
}): Promise<{ logged: boolean; displayId: string | null }> {
  const supabase = createStudioServiceClient()

  // Fold into an existing open gap for the same system if the question is a
  // near-duplicate — "basic frequency counting" (§A2), not full clustering.
  if (input.bundle) {
    const { data: openGaps, error: findErr } = await supabase
      .from('ai_knowledge_gaps')
      .select('id, normalised_question, repeat_count')
      .eq('staged_system_id', input.bundle.system.id)
      .not('status', 'in', '(RESOLVED,PUBLISHED,DUPLICATE,OUT_OF_SCOPE,NO_ACTION_REQUIRED)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (findErr && !isMissingSchemaError(findErr.message)) {
      return { logged: false, displayId: null }
    }
    if (!findErr) {
      type OpenGapRow = { id: string; normalised_question: NormalisedQuestion | null; repeat_count: number }
      const match = ((openGaps ?? []) as OpenGapRow[]).find(
        (g) => g.normalised_question && isNearDuplicateQuestion(input.normalised, g.normalised_question),
      )
      if (match) {
        await supabase
          .from('ai_knowledge_gaps')
          .update({ repeat_count: match.repeat_count + 1, updated_at: new Date().toISOString() })
          .eq('id', match.id)
        return { logged: true, displayId: displayIdFor(match.id) }
      }
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('ai_knowledge_gaps')
    .insert({
      status: 'NEW',
      failure_type: input.failureType,
      user_question: input.question,
      normalised_question: input.normalised,
      staged_system_id: input.bundle?.system.id ?? null,
      manufacturer_id: input.bundle?.manufacturer.id ?? null,
      anon_session_id: input.anonSessionId,
      ai_response_status: 'NO_VERIFIED_ANSWER',
      matched_assertion_ids: input.candidateAssertionIds,
      missing_information: input.missingInformation,
    })
    .select('id')
    .single()

  if (insertErr || !created) {
    // Migration 066 not applied yet in this environment, or some other
    // write failure — degrade to "not logged" rather than failing the
    // whole request; the builder still gets their recovery options.
    return { logged: false, displayId: null }
  }

  // Notify via the existing Inbox unread badge (migration 036/066) — only on
  // first creation, not on every repeat, so the inbox doesn't fill with
  // duplicates of a question that's already queued.
  if (input.bundle) {
    await supabase.from('manufacturer_messages').insert({
      manufacturer_id: input.bundle.manufacturer.id,
      sender_type: 'buildquote',
      message_type: 'ai_question',
      body: `A builder asked a question about ${input.bundle.system.name} that couldn't be answered from your verified product information: “${input.question}”`,
    }).then(() => {}, () => {}) // best-effort — a notification failure must never fail the gap log
  }

  return { logged: true, displayId: displayIdFor(created.id) }
}

function displayIdFor(uuid: string): string {
  return `KG-${uuid.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}
