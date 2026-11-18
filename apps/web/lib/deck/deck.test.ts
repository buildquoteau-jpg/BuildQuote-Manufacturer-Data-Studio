import { describe, expect, it } from 'vitest'
import { suggestDeckType, isDeckType, DECK_TYPES } from './deckTypes'
import { presetsFor } from './deckAttributes'

describe('suggestDeckType', () => {
  it('files a brand range by manufacturer', () => {
    expect(suggestDeckType({ name: 'Extreme', category: 'Timber Finishes', manufacturerName: 'Cutek' })).toBe('care')
    expect(suggestDeckType({ name: 'Frame kit', manufacturerName: 'BQ TimberLock' })).toBe('outdoor')
  })
  it('does not read composite timber-look as hardwood', () => {
    expect(suggestDeckType({ name: 'Natural Grain', category: 'Decking', description: 'wood composite timber-look decking' })).toBe('composite')
  })
  it('detects the other board types', () => {
    expect(suggestDeckType({ name: 'Spotted Gum Decking', category: 'Decking', description: 'hardwood' })).toBe('hardwood')
    expect(suggestDeckType({ name: 'Accoya decking', category: 'Decking' })).toBe('modified')
    expect(suggestDeckType({ name: 'Deck tiles', category: 'Decking', description: 'interlocking' })).toBe('tiles')
    expect(suggestDeckType({ name: 'HardieDeck', category: 'Decking' })).toBe('fibre-cement')
  })
  it('subfloor and care', () => {
    expect(suggestDeckType({ name: 'Adjustable pedestal', description: 'for decks' })).toBe('subfloor')
    expect(suggestDeckType({ name: 'Deck oil', description: 'for timber decks' })).toBe('care')
  })
  it('returns null rather than guessing', () => {
    expect(suggestDeckType({ name: 'Weatherboard', category: 'Cladding' })).toBeNull()
  })
})

describe('deck type guard + presets', () => {
  it('validates values', () => {
    expect(DECK_TYPES.every(isDeckType)).toBe(true)
    expect(isDeckType('cladding')).toBe(false)
  })
  it('offers relevant presets and hides ones already used', () => {
    const labels = presetsFor('care').map((p) => p.label)
    expect(labels).toContain('Coverage')
    expect(labels).not.toContain('Maximum joist spacing')
    expect(presetsFor('care', ['coverage']).map((p) => p.label)).not.toContain('Coverage')
    expect(presetsFor('composite').map((p) => p.label)).toContain('Warranty')
  })
})
