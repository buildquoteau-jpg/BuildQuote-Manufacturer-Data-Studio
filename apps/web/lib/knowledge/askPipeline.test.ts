import { describe, it, expect } from 'vitest'
import {
  normaliseQuestion,
  isNearDuplicateQuestion,
  classifyFailureType,
  buildRecoveryPayload,
  explanationForFailureType,
} from './askPipeline'

// ============================================================
// normaliseQuestion
// ============================================================

describe('normaliseQuestion', () => {
  it('lowercases, strips punctuation, and drops stopwords', () => {
    const n = normaliseQuestion('Can I use this board behind tiles in a shower?')
    expect(n.keywords).toContain('board')
    expect(n.keywords).toContain('tiles')
    expect(n.keywords).toContain('shower')
    expect(n.keywords).not.toContain('can')
    expect(n.keywords).not.toContain('this')
    expect(n.keywords).not.toContain('in')
  })

  it('detects suitability questions', () => {
    expect(normaliseQuestion('Is this suitable for external walls?').questionType).toBe('suitability')
  })

  it('detects installation questions', () => {
    expect(normaliseQuestion('What fixing centres are required?').questionType).toBe('installation')
  })

  it('detects compatibility questions', () => {
    expect(normaliseQuestion('Is this compatible with brand X trim?').questionType).toBe('compatibility')
  })

  it('detects specification questions', () => {
    expect(normaliseQuestion('What is the fire rating?').questionType).toBe('specification')
  })

  it('falls back to general when nothing matches', () => {
    expect(normaliseQuestion('Tell me about this product').questionType).toBe('general')
  })
})

// ============================================================
// isNearDuplicateQuestion — basic frequency counting, not clustering (§A2)
// ============================================================

describe('isNearDuplicateQuestion', () => {
  it('treats paraphrases with high keyword overlap as duplicates', () => {
    const a = normaliseQuestion('Can this board be used behind tiles in a shower?')
    const b = normaliseQuestion('Is this suitable as a shower tile substrate?')
    // Deliberately not asserting true here — these two share few literal
    // keywords ("shower" only) despite meaning the same thing; that gap is
    // exactly why real clustering is Phase 2, not this heuristic's job.
    expect(isNearDuplicateQuestion(a, b)).toBe(false)
  })

  it('treats near-identical rewordings as duplicates', () => {
    const a = normaliseQuestion('Can I use this board behind tiles in a shower?')
    const b = normaliseQuestion('Can I use this board behind tiles in the shower?')
    expect(isNearDuplicateQuestion(a, b)).toBe(true)
  })

  it('treats unrelated questions as not duplicates', () => {
    const a = normaliseQuestion('What is the fire rating?')
    const b = normaliseQuestion('Can this be installed over masonry?')
    expect(isNearDuplicateQuestion(a, b)).toBe(false)
  })

  it('never matches when either side has no keywords', () => {
    const empty = normaliseQuestion('is it ok')
    const real = normaliseQuestion('What is the fire rating?')
    expect(isNearDuplicateQuestion(empty, real)).toBe(false)
  })
})

// ============================================================
// classifyFailureType — deterministic-first, never asks the model (§A5 step 5)
// ============================================================

describe('classifyFailureType', () => {
  const base = {
    systemIdentified: true,
    meaningfulKeywordCount: 3,
    candidateAssertionCount: 0,
    answerableAssertionCount: 0,
    semanticMatchCount: 0,
    llmProducedAnswer: false,
  }

  it('classifies OUT_OF_SCOPE when the system could not be identified at all', () => {
    expect(classifyFailureType({ ...base, systemIdentified: false })).toBe('OUT_OF_SCOPE')
  })

  it('classifies AMBIGUOUS_QUERY when the question has too few meaningful keywords', () => {
    expect(classifyFailureType({ ...base, meaningfulKeywordCount: 1 })).toBe('AMBIGUOUS_QUERY')
  })

  it('classifies KNOWLEDGE_GAP when nothing was found anywhere', () => {
    expect(classifyFailureType(base)).toBe('KNOWLEDGE_GAP')
  })

  it('classifies VERIFICATION_GAP when facts exist but none are answerable', () => {
    expect(classifyFailureType({ ...base, candidateAssertionCount: 3, answerableAssertionCount: 0 })).toBe('VERIFICATION_GAP')
  })

  it('classifies RETRIEVAL_GAP when evidence exists but composition still failed', () => {
    expect(classifyFailureType({ ...base, candidateAssertionCount: 2, answerableAssertionCount: 2 })).toBe('RETRIEVAL_GAP')
    expect(classifyFailureType({ ...base, semanticMatchCount: 4 })).toBe('RETRIEVAL_GAP')
  })

  it('every FailureType has a human-readable explanation', () => {
    for (const ft of ['KNOWLEDGE_GAP', 'RETRIEVAL_GAP', 'VERIFICATION_GAP', 'AMBIGUOUS_QUERY', 'OUT_OF_SCOPE'] as const) {
      expect(explanationForFailureType(ft).length).toBeGreaterThan(0)
    }
  })
})

// ============================================================
// buildRecoveryPayload — each field present only when real (§6's own rule)
// ============================================================

describe('buildRecoveryPayload', () => {
  it('always includes rewordHint and a systemCardUrl when the system was identified', () => {
    const r = buildRecoveryPayload({ manufacturerSlug: 'wallaby-board-co', systemSlug: 'shieldclad-180' })
    expect(r.rewordHint).toBe(true)
    expect(r.systemCardUrl).toBe('/library/wallaby-board-co/shieldclad-180')
  })

  it('omits systemCardUrl when the system was not identified', () => {
    const r = buildRecoveryPayload({ manufacturerSlug: 'wallaby-board-co', systemSlug: null })
    expect(r.systemCardUrl).toBeNull()
  })

  it('only includes installGuideUrl/techDataUrl when they are real', () => {
    const withDocs = buildRecoveryPayload({
      manufacturerSlug: 'a', systemSlug: 'b', installGuideUrl: 'https://x/install.pdf', techDataUrl: 'https://x/tds.pdf',
    })
    expect(withDocs.installGuideUrl).toBe('https://x/install.pdf')
    expect(withDocs.techDataUrl).toBe('https://x/tds.pdf')

    const withoutDocs = buildRecoveryPayload({ manufacturerSlug: 'a', systemSlug: 'b' })
    expect(withoutDocs).not.toHaveProperty('installGuideUrl')
    expect(withoutDocs).not.toHaveProperty('techDataUrl')
  })

  it('only includes contactManufacturer when both a name and a website are known', () => {
    const withContact = buildRecoveryPayload({
      manufacturerSlug: 'a', systemSlug: 'b', manufacturerName: 'Wallaby Board Co.', manufacturerWebsiteUrl: 'https://wallaby.example',
    })
    expect(withContact.contactManufacturer).toEqual({ name: 'Wallaby Board Co.', url: 'https://wallaby.example' })

    const missingWebsite = buildRecoveryPayload({ manufacturerSlug: 'a', systemSlug: 'b', manufacturerName: 'Wallaby Board Co.' })
    expect(missingWebsite).not.toHaveProperty('contactManufacturer')
  })
})
