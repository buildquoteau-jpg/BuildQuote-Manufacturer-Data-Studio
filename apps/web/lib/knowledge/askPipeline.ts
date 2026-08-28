// Pure logic for the AI Knowledge Gap & Feedback Loop's ask pipeline (design
// doc addendum §A5). No Supabase, no fetch, no LLM client — everything here
// is a deterministic function of its inputs so it can be unit-tested without
// live credentials, same convention as buildSystemKnowledge.ts.
//
// Deliberately simple, not NLU: the master spec's clustering (§13) and
// terminology-mapping (§24) machinery is Phase 2, explicitly deferred (plan
// addendum §A2). What's here is basic keyword overlap — honest about what it
// is, good enough to avoid re-logging the same question as a fresh gap every
// time it's asked.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'can', 'could', 'i', 'you', 'it', 'this', 'that',
  'to', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'be', 'use', 'used', 'using',
  'do', 'does', 'will', 'would', 'my', 'your', 'what', 'how', 'if',
])

export type QuestionType = 'suitability' | 'specification' | 'installation' | 'compatibility' | 'general'

export type NormalisedQuestion = {
  keywords: string[]
  questionType: QuestionType
}

export function normaliseQuestion(question: string): NormalisedQuestion {
  const words = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const keywords = Array.from(new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w))))
  return { keywords, questionType: detectQuestionType(words) }
}

function detectQuestionType(words: string[]): QuestionType {
  const has = (list: string[]) => list.some((w) => words.includes(w))
  if (has(['suitable', 'suitability', 'allowed', 'ok', 'okay'])) return 'suitability'
  if (has(['install', 'installation', 'fix', 'fixing', 'fastener', 'nail', 'screw', 'centres'])) return 'installation'
  if (has(['compatible', 'compatibility', 'match', 'matches'])) return 'compatibility'
  if (has(['rating', 'rated', 'value', 'spec', 'specification', 'dimension', 'size', 'weight', 'thickness'])) return 'specification'
  return 'general'
}

/** Jaccard overlap on keyword sets — "basic frequency counting", not clustering (§A2). */
export function isNearDuplicateQuestion(a: NormalisedQuestion, b: NormalisedQuestion): boolean {
  if (a.keywords.length === 0 || b.keywords.length === 0) return false
  const setB = new Set(b.keywords)
  const intersection = a.keywords.filter((k) => setB.has(k)).length
  const union = new Set(a.keywords.concat(b.keywords)).size
  return union > 0 && intersection / union >= 0.6
}

export type FailureType =
  | 'KNOWLEDGE_GAP'
  | 'RETRIEVAL_GAP'
  | 'VERIFICATION_GAP'
  | 'AMBIGUOUS_QUERY'
  | 'OUT_OF_SCOPE'
// TERMINOLOGY_GAP, RELATIONSHIP_GAP and SCHEMA_GAP exist in the DB check
// constraint (migration 066) for manual/admin reclassification, but nothing
// in this codebase can detect them automatically yet — that needs the
// terminology-mapping table and schema-gap tooling, both Phase 2 (§A2).

export type RetrievalSignals = {
  systemIdentified: boolean
  meaningfulKeywordCount: number
  candidateAssertionCount: number     // facts found for the system, any policy
  answerableAssertionCount: number    // of those, ones an agent may actually answer from
  semanticMatchCount: number          // raw pgvector hits, if embeddings were configured
  llmProducedAnswer: boolean          // did the model actually answer, not NO_VERIFIED_ANSWER
}

/**
 * Deterministic-first classification (§A5 step 5) — never asks the model to
 * self-diagnose why it couldn't answer; the code decides from what actually
 * happened at each retrieval stage.
 */
export function classifyFailureType(signals: RetrievalSignals): FailureType {
  if (!signals.systemIdentified) return 'OUT_OF_SCOPE'
  if (signals.meaningfulKeywordCount < 2) return 'AMBIGUOUS_QUERY'
  if (signals.candidateAssertionCount === 0 && signals.semanticMatchCount === 0) return 'KNOWLEDGE_GAP'
  if (signals.candidateAssertionCount > 0 && signals.answerableAssertionCount === 0) return 'VERIFICATION_GAP'
  return 'RETRIEVAL_GAP'
}

export type RecoveryPayload = {
  rewordHint: true
  systemCardUrl: string | null
  installGuideUrl?: string
  techDataUrl?: string
  contactManufacturer?: { name: string; url: string }
}

/** Builds the §6 recovery options — each field present only when real, per the spec's own "only show if available" rule. */
export function buildRecoveryPayload(input: {
  manufacturerSlug: string
  systemSlug: string | null
  installGuideUrl?: string | null
  techDataUrl?: string | null
  manufacturerName?: string | null
  manufacturerWebsiteUrl?: string | null
}): RecoveryPayload {
  return {
    rewordHint: true,
    systemCardUrl: input.systemSlug ? `/library/${input.manufacturerSlug}/${input.systemSlug}` : null,
    ...(input.installGuideUrl ? { installGuideUrl: input.installGuideUrl } : {}),
    ...(input.techDataUrl ? { techDataUrl: input.techDataUrl } : {}),
    ...(input.manufacturerWebsiteUrl && input.manufacturerName
      ? { contactManufacturer: { name: input.manufacturerName, url: input.manufacturerWebsiteUrl } }
      : {}),
  }
}

const FAILURE_TYPE_EXPLANATION: Record<FailureType, string> = {
  KNOWLEDGE_GAP: 'The current verified product information does not contain a definitive answer about this.',
  RETRIEVAL_GAP: 'Relevant information may exist for this product, but it could not be resolved to a definitive answer.',
  VERIFICATION_GAP: 'Information exists but is not yet sufficiently verified to state a definitive answer.',
  AMBIGUOUS_QUERY: 'The question needs more detail before it can be answered from verified product information.',
  OUT_OF_SCOPE: 'This could not be matched to a specific product in BuildQuote.',
}

export function explanationForFailureType(failureType: FailureType): string {
  return FAILURE_TYPE_EXPLANATION[failureType]
}
