// The bq: vocabulary — predicate registry, controlled enums and the
// synonym dictionary for the AI knowledge layer (design doc: "AI Knowledge
// Layer + Data Studio Workspace Redesign", §1–§5a).
//
// Pure module — no Supabase, no server imports — so it can be shared by the
// generator, the /ns/v1 route, and (later) the manufacturer verification UI
// without pulling in anything server-only.
//
// This file is the *seam* the design calls for, not a finished vocabulary:
// only terms this codebase can actually back with real data are documented
// or seeded. Do not add a predicate, taxonomy domain, or synonym entry here
// speculatively — every entry should correspond to something the generator
// (buildSystemKnowledge.ts) actually emits.

export const KNOWLEDGE_FORMAT = 'buildquote-system-knowledge'
export const KNOWLEDGE_FORMAT_VERSION = '1.0'

export const BQ_NAMESPACE = 'https://buildquote.com.au/ns/v1#'

/** The @context block every generated knowledge object carries verbatim. */
export const KNOWLEDGE_CONTEXT: (string | Record<string, string>)[] = [
  'https://schema.org/',
  {
    bq: BQ_NAMESPACE,
    prov: 'http://www.w3.org/ns/prov#',
    dcterms: 'http://purl.org/dc/terms/',
    fact: 'https://buildquote.com.au/id/fact/',
  },
]

// ─── Axis 1 — provenance class ──────────────────────────────────────────────

export type AssertionOrigin =
  | 'manufacturer_supplied'
  | 'document_extracted'
  | 'web_extracted'
  | 'derived'
  | 'buildquote_editorial'

// ─── Axis 2 — standing ───────────────────────────────────────────────────────
// Never conflate with confidence: a numeric confidence score must never
// change which of these a fact carries, and must never override 'unknown',
// 'not_applicable' or 'disputed'. See TRUST_LEVEL_BY_STATUS below.

export type EpistemicStatus =
  | 'unverified'
  | 'buildquote_checked'
  | 'manufacturer_verified'
  | 'manufacturer_corrected'
  | 'disputed'
  | 'not_applicable'
  | 'unknown'
  | 'superseded'
  | 'stale'
  // The source material was checked and does not state this field — distinct
  // from 'unknown' (a manufacturer explicitly said "we don't know") and from
  // simply omitting the field (which reads as "never checked"). Added for
  // the AI Knowledge Gap & Feedback Loop's "absence must never read as a
  // negative answer" rule (design doc addendum §A3/§5 of the master spec).
  | 'not_specified'

/** Collapsed single-token trust signal for consumers that ignore the two-axis model. */
export type TrustLevel = 'verified' | 'checked' | 'extracted' | 'unknown'

const TRUST_LEVEL_BY_STATUS: Record<EpistemicStatus, TrustLevel> = {
  manufacturer_verified: 'verified',
  manufacturer_corrected: 'verified',
  buildquote_checked: 'checked',
  unverified: 'extracted',
  stale: 'extracted',
  unknown: 'unknown',
  not_applicable: 'unknown',
  disputed: 'unknown',
  superseded: 'unknown',
  not_specified: 'unknown',
}

export function trustLevelFor(status: EpistemicStatus): TrustLevel {
  return TRUST_LEVEL_BY_STATUS[status]
}

/**
 * Statuses that must never appear as a *value* on the reading surface or in
 * bq:atomicAssertions — only inside bq:knowledgeGaps / bq:assertions. This is
 * the structural enforcement of "do not overstate what is known" (design
 * doc §1.3 / §4E) — a generator invariant, not an editorial choice.
 */
export const SUPPRESSED_FROM_READING_SURFACE: ReadonlySet<EpistemicStatus> = new Set<EpistemicStatus>([
  'disputed',
  'unknown',
  'not_applicable',
  'superseded',
  'not_specified',
])

// ─── claimType — what KIND of claim, independent of which entity it's about ─
// Orthogonal to the entity a fact is attached to (system/profile/component/…):
// two facts about the same profile can have different claimTypes.

export type ClaimType =
  | 'identity'
  | 'dimension'
  | 'weight'
  | 'packaging'
  | 'component'
  | 'installation_requirement'
  | 'installation_method'
  | 'performance_claim'
  | 'compatibility'
  | 'incompatibility'
  | 'application'
  | 'limitation'
  | 'environmental_constraint'
  | 'regulatory_relationship'
  | 'certification'
  | 'warranty'
  | 'maintenance'
  | 'safety'
  | 'availability'
  | 'supersession'
  | 'manufacturer_statement'
  | 'derived_fact'
  | 'unknown'

// ─── answerPolicy — what an agent may DO with a fact, independent of status ─
// Defaults are derived from (epistemicStatus × claimType); a reviewer can
// override once, tightening only. See resolveAnswerPolicy() below.

export type AnswerPolicy =
  | 'answer_directly'
  | 'answer_with_conditions'
  | 'answer_with_source'
  | 'answer_with_warning'
  | 'do_not_infer'
  | 'manufacturer_confirmation_required'
  | 'not_applicable'
  | 'unknown'

const POLICY_RANK: Record<AnswerPolicy, number> = {
  answer_directly: 0,
  answer_with_source: 1,
  answer_with_conditions: 2,
  answer_with_warning: 3,
  manufacturer_confirmation_required: 4,
  not_applicable: 5,
  unknown: 6,
  do_not_infer: 7,
}

/** A tightening override must rank >= the current policy — never loosen. */
export function isTighteningOverride(current: AnswerPolicy, next: AnswerPolicy): boolean {
  return POLICY_RANK[next] >= POLICY_RANK[current]
}

/**
 * Deterministic default answer policy from status + claim type. Reviewers
 * (BuildQuote or a manufacturer admin) can override this once it's stored
 * on knowledge_assertions.answer_policy — this function only supplies the
 * generated default, and Step 1 (no knowledge_assertions table yet) always
 * uses this default.
 */
export function resolveAnswerPolicy(status: EpistemicStatus, claimType: ClaimType): AnswerPolicy {
  if (status === 'unknown' || status === 'not_specified') return 'unknown'
  if (status === 'not_applicable') return 'not_applicable'
  if (status === 'disputed' || status === 'superseded') return 'do_not_infer'
  if (claimType === 'incompatibility' || claimType === 'limitation' || claimType === 'safety') {
    return 'answer_with_warning'
  }
  if (claimType === 'compatibility' || claimType === 'performance_claim' || claimType === 'certification') {
    return status === 'manufacturer_verified' || status === 'manufacturer_corrected'
      ? 'answer_with_conditions'
      : 'manufacturer_confirmation_required'
  }
  if (status === 'manufacturer_verified' || status === 'manufacturer_corrected') return 'answer_directly'
  if (status === 'buildquote_checked') return 'answer_with_source'
  return 'answer_with_source' // unverified/stale extraction — usable, must carry its source
}

// ─── Taxonomy domains — the seam for knowledge_taxonomy_terms, not a vocabulary ─
// Kept here only so code and the eventual table agree on domain names; the
// table itself starts empty (design doc §5a.6).

export const TAXONOMY_DOMAINS = [
  'application',
  'substrate',
  'building_class',
  'bal_level',
  'corrosivity_category',
  'wind_region',
  'product_category',
  'component_role',
  'regulatory_instrument',
] as const
export type TaxonomyDomain = (typeof TAXONOMY_DOMAINS)[number]

// ─── Query vocabulary — shared, code-maintained, applied at generation time ─
// Generated from canonical concepts, not authored per product (design doc
// §5a.5). Seeded only with concepts the generator actually emits today;
// extend this list as new predicates go live, never speculatively.

export type QueryTerm = { concept: string; predicate: string; synonyms: string[] }

export const QUERY_TERMS: QueryTerm[] = [
  {
    concept: 'fixing centres',
    predicate: 'bq:fixingCentres',
    synonyms: [
      'nail spacing', 'nail centres', 'fastener spacing', 'fixing spacing',
      'how far apart do the nails go', 'how often do I fix it',
    ],
  },
  {
    concept: 'bushfire attack level',
    predicate: 'bq:balRating',
    synonyms: ['BAL rating', 'bushfire rating', 'BAL level', 'bushfire attack level'],
  },
  {
    concept: 'acoustic rating',
    predicate: 'bq:acousticRating',
    synonyms: ['sound rating', 'Rw rating', 'noise rating', 'sound transmission'],
  },
  {
    concept: 'fire rating',
    predicate: 'bq:fireRating',
    synonyms: ['fire resistance', 'combustibility', 'fire performance'],
  },
  {
    concept: 'effective cover',
    predicate: 'bq:effectiveCover',
    synonyms: ['coverage width', 'cover width', 'how much wall does one board cover'],
  },
  {
    concept: 'australian made',
    predicate: 'bq:countryOfOrigin',
    synonyms: ['made in australia', 'local manufacture', 'country of origin'],
  },
]

/** Look up a query term by predicate — used by the generator to attach synonyms. */
export function queryTermFor(predicate: string): QueryTerm | undefined {
  return QUERY_TERMS.find((t) => t.predicate === predicate)
}

/**
 * Finds which of the shared query terms a free-text question touches on —
 * stage 1 of the AI Knowledge Gap ask pipeline's retrieval order (design doc
 * addendum §A5): try the cheap, exact synonym dictionary before anything
 * that costs an API call. Plain substring matching, case-insensitive — this
 * is deliberately not NLU; it only has to catch the vocabulary this
 * codebase already knows about.
 */
export function findMatchingQueryTerms(question: string): QueryTerm[] {
  const q = question.toLowerCase()
  return QUERY_TERMS.filter((t) => q.includes(t.concept.toLowerCase()) || t.synonyms.some((s) => q.includes(s.toLowerCase())))
}
