import { describe, it, expect } from 'vitest'
import { validateParserOutput, type ParserValidationResult } from './validate'
import type {
  ParsedComponentCandidate,
  ParsedFieldSource,
  ParsedImageCandidate,
  ParsedSystemCandidate,
  ParsedSystemColourCandidate,
  ParsedSystemComponentCandidate,
  ParsedSystemProfileCandidate,
  ParserOutput,
} from './types'

// ============================================================
// Fixtures — minimal, contract-clean entities that each test mutates.
// ============================================================

function source(field_name: string, over: Partial<ParsedFieldSource> = {}): ParsedFieldSource {
  return {
    field_name,
    extracted_value: 'x',
    source_page_number: 4,
    source_chunk_id: 'chunk-1',
    confidence: 0.9,
    ...over,
  }
}

function system(over: Partial<ParsedSystemCandidate> = {}): ParsedSystemCandidate {
  return {
    temp_key: 'system_0',
    source_document_id: 'doc-1',
    source_chunk_id: 'chunk-1',
    source_page_number: 1,
    name: 'Avenue Decking',
    category: 'Decking',
    extraction_confidence: 0.9,
    parser_notes: [],
    uncertain_fields: [],
    field_sources: [source('name')],
    ...over,
  }
}

function profile(over: Partial<ParsedSystemProfileCandidate> = {}): ParsedSystemProfileCandidate {
  return {
    temp_key: 'profile_0',
    system_match: { system_name: 'Avenue Decking', product_code: null },
    profile_name: 'Avenue 5400',
    extraction_confidence: 0.8,
    parser_notes: [],
    uncertain_fields: [],
    field_sources: [source('profile_name')],
    ...over,
  }
}

function component(over: Partial<ParsedComponentCandidate> = {}): ParsedComponentCandidate {
  return {
    temp_key: 'component_0',
    name: 'Hidden Fix Clip',
    uom: 'ea',
    extraction_confidence: 0.8,
    parser_notes: [],
    uncertain_fields: [],
    field_sources: [source('name')],
    ...over,
  }
}

function systemComponent(
  over: Partial<ParsedSystemComponentCandidate> = {},
): ParsedSystemComponentCandidate {
  return {
    temp_key: 'link_0',
    staged_system_match: { system_name: 'Avenue Decking', product_code: null },
    component_match: { sku: null, name: 'Hidden Fix Clip' },
    role: 'required',
    extraction_confidence: 0.7,
    ...over,
  }
}

function colour(over: Partial<ParsedSystemColourCandidate> = {}): ParsedSystemColourCandidate {
  return {
    temp_key: 'colour_0',
    system_match: { system_name: 'Avenue Decking', product_code: null },
    colour_name: 'Antique',
    sku_suffix: '-ANT',
    extraction_confidence: 0.75,
    ...over,
  }
}

function image(over: Partial<ParsedImageCandidate> = {}): ParsedImageCandidate {
  return { suggested_usage: 'hero_system', confidence: 0.6, ...over }
}

function output(over: Partial<ParserOutput> = {}): ParserOutput {
  return {
    source_document_id: 'doc-1',
    systems: [],
    system_profiles: [],
    components: [],
    system_components: [],
    system_colours: [],
    warnings: [],
    ignored_content_notes: [],
    ...over,
  }
}

// Codes are the stable contract here — compare on those, not on prose.
function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code)
}

function validate(over: Partial<ParserOutput>): ParserValidationResult {
  return validateParserOutput(output(over))
}

// ============================================================
// Clean output
// ============================================================

describe('validateParserOutput', () => {
  it('accepts an empty output', () => {
    expect(validate({})).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('accepts a contract-clean output with every entity type', () => {
    const result = validate({
      systems: [system()],
      system_profiles: [profile()],
      components: [component()],
      system_components: [systemComponent()],
      system_colours: [colour()],
      media: { images: [image()] },
    })
    expect(result).toEqual({ ok: true, errors: [], warnings: [] })
  })

  it('reports ok=false when any error is present, regardless of warnings', () => {
    const result = validate({ systems: [system({ name: '', field_sources: [] })] })
    expect(result.ok).toBe(false)
    expect(codes(result.errors)).toContain('REQUIRED_FIELD_MISSING')
  })

  it('flags the deprecated fire_rating key at the root', () => {
    const withFireRating = { ...output(), fire_rating: 'Group 1' } as ParserOutput
    const result = validateParserOutput(withFireRating)
    expect(result.errors).toEqual([
      {
        severity: 'error',
        code: 'DEPRECATED_FIRE_RATING',
        message: 'Use bal_rating instead of the deprecated fire_rating field',
        path: 'root',
      },
    ])
  })
})

// ============================================================
// Systems
// ============================================================

describe('system validation', () => {
  it('errors on a missing name and warns on a missing category', () => {
    const result = validate({ systems: [system({ name: '', category: null })] })
    expect(codes(result.errors)).toContain('REQUIRED_FIELD_MISSING')
    expect(codes(result.warnings)).toContain('REQUIRED_FIELD_MISSING')
  })

  it('does not require evidence for a name that is absent', () => {
    const result = validate({ systems: [system({ name: '', field_sources: [] })] })
    expect(codes(result.errors)).not.toContain('EVIDENCE_MISSING_KEY')
  })

  it('errors when the name has no field_sources entry', () => {
    const result = validate({ systems: [system({ field_sources: [source('category')] })] })
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'EVIDENCE_MISSING_KEY', path: 'systems[system_0]' }),
    )
  })

  it('errors on a missing extraction_confidence (key field)', () => {
    const result = validate({
      systems: [system({ extraction_confidence: null as unknown as number })],
    })
    expect(codes(result.errors)).toContain('CONFIDENCE_MISSING')
  })

  it.each([1.4, -0.1, '0.9'])('errors on out-of-range confidence %p', (value) => {
    const result = validate({
      systems: [system({ extraction_confidence: value as unknown as number })],
    })
    expect(codes(result.errors)).toContain('CONFIDENCE_RANGE')
  })

  it.each([0, 1])('accepts the confidence boundary %p', (value) => {
    const result = validate({ systems: [system({ extraction_confidence: value })] })
    expect(result.errors).toEqual([])
  })

  it('warns rather than errors on a missing field_sources confidence', () => {
    const result = validate({
      systems: [system({ field_sources: [source('name', { confidence: null as unknown as number })] })],
    })
    expect(codes(result.errors)).not.toContain('CONFIDENCE_MISSING')
    expect(codes(result.warnings)).toContain('CONFIDENCE_MISSING')
  })

  it('warns when evidence has neither a chunk id nor a page number', () => {
    const result = validate({
      systems: [system({ field_sources: [source('name', { source_chunk_id: null, source_page_number: null })] })],
    })
    expect(codes(result.warnings)).toContain('EVIDENCE_NO_LOCATION')
  })

  it('accepts evidence located by page number alone', () => {
    const result = validate({
      systems: [system({ field_sources: [source('name', { source_chunk_id: null })] })],
    })
    expect(result.warnings).toEqual([])
  })

  it('warns when an uncertain field has no matching evidence', () => {
    const result = validate({ systems: [system({ uncertain_fields: ['category'] })] })
    expect(codes(result.warnings)).toContain('UNCERTAIN_FIELD_NO_SOURCE')
  })

  it('warns when an uncertain field has evidence that is not flagged uncertain', () => {
    const result = validate({ systems: [system({ uncertain_fields: ['name'] })] })
    expect(codes(result.warnings)).toContain('UNCERTAIN_FIELD_NOT_FLAGGED')
  })

  it('accepts an uncertain field whose evidence is flagged', () => {
    const result = validate({
      systems: [
        system({
          uncertain_fields: ['name'],
          field_sources: [source('name', { is_uncertain: true })],
        }),
      ],
    })
    expect(result.warnings).toEqual([])
  })
})

// ============================================================
// System profiles
// ============================================================

describe('system profile validation', () => {
  it('errors when both profile_name and name are missing', () => {
    const result = validate({ system_profiles: [profile({ profile_name: null })] })
    expect(codes(result.errors)).toContain('REQUIRED_FIELD_MISSING')
  })

  it('warns when only name is present, and checks evidence for name instead', () => {
    const result = validate({
      system_profiles: [
        profile({ profile_name: null, name: 'Avenue Grooved Board', field_sources: [source('name')] }),
      ],
    })
    expect(codes(result.warnings)).toEqual(['PROFILE_NAME_FALLBACK'])
  })

  it('warns (not errors) when the key identifier has no evidence', () => {
    const result = validate({ system_profiles: [profile({ field_sources: [] })] })
    expect(codes(result.errors)).toEqual([])
    expect(codes(result.warnings)).toContain('EVIDENCE_MISSING_KEY')
  })

  it.each(['pk 120', 'PACK50', 'box 10', 'carton 4', 'bag2', 'bundle 6', 'roll 3'])(
    'errors on the encoded pack-size uom %p',
    (uom) => {
      const result = validate({ system_profiles: [profile({ uom })] })
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'SUSPICIOUS_UOM', path: 'system_profiles[profile_0].uom' }),
      )
    },
  )

  it.each(['ea', 'lm', 'm2', 'sheet', 'roll', 'box', null, undefined])(
    'accepts the sell unit %p',
    (uom) => {
      const result = validate({ system_profiles: [profile({ uom })] })
      expect(codes(result.errors)).not.toContain('SUSPICIOUS_UOM')
    },
  )

  it('errors when a numeric dimension arrives as a string', () => {
    const result = validate({
      system_profiles: [profile({ length_mm: '5400' as unknown as number, width_mm: 138 })],
    })
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'DIMENSION_NOT_NUMBER',
        message: 'Field "length_mm" must be a number, not a string "5400"',
      }),
    )
  })

  it('warns about height_mm on a flat product', () => {
    const result = validate({
      system_profiles: [profile({ profile_name: 'Avenue Board 5400', height_mm: 29 })],
    })
    expect(codes(result.warnings)).toContain('HEIGHT_MM_ON_FLAT_PRODUCT')
  })

  it('accepts height_mm on a roll product even when the system name sounds flat', () => {
    const result = validate({
      system_profiles: [
        profile({
          profile_name: 'EnviroSeal Wrap Roll',
          height_mm: 1350,
          system_match: { system_name: 'Wall Wrap Board', product_code: null },
          field_sources: [source('profile_name')],
        }),
      ],
    })
    expect(codes(result.warnings)).not.toContain('HEIGHT_MM_ON_FLAT_PRODUCT')
  })

  it('detects flat products via the matched system name', () => {
    const result = validate({
      system_profiles: [
        profile({
          profile_name: 'Avenue 5400',
          height_mm: 29,
          system_match: { system_name: 'Avenue Decking Board', product_code: null },
        }),
      ],
    })
    expect(codes(result.warnings)).toContain('HEIGHT_MM_ON_FLAT_PRODUCT')
  })

  it('warns once when the profile name looks like a component', () => {
    const result = validate({ system_profiles: [profile({ profile_name: 'Fascia Board Trim Clip' })] })
    expect(codes(result.warnings).filter((c) => c === 'POSSIBLE_COMPONENT_AS_PROFILE')).toHaveLength(1)
  })

  it('warns when bal_rating has no evidence', () => {
    const result = validate({ system_profiles: [profile({ bal_rating: 'BAL-29' })] })
    expect(codes(result.warnings)).toContain('BAL_NO_EVIDENCE')
  })

  it('accepts bal_rating backed by evidence', () => {
    const result = validate({
      system_profiles: [
        profile({ bal_rating: 'BAL-29', field_sources: [source('profile_name'), source('bal_rating')] }),
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it('errors on the deprecated fire_rating key', () => {
    const result = validate({
      system_profiles: [profile({ fire_rating: 'Group 1' } as Partial<ParsedSystemProfileCandidate>)],
    })
    expect(codes(result.errors)).toContain('DEPRECATED_FIRE_RATING')
  })
})

// ============================================================
// Components
// ============================================================

describe('component validation', () => {
  it('errors on a missing name and warns on a missing uom', () => {
    const result = validate({ components: [component({ name: '', uom: null })] })
    expect(codes(result.errors)).toContain('REQUIRED_FIELD_MISSING')
    expect(codes(result.warnings)).toContain('REQUIRED_FIELD_MISSING')
  })

  it('errors when the name has no evidence', () => {
    const result = validate({ components: [component({ field_sources: [] })] })
    expect(codes(result.errors)).toContain('EVIDENCE_MISSING_KEY')
  })

  it('errors on an encoded pack-size uom', () => {
    const result = validate({ components: [component({ uom: 'box 120' })] })
    expect(codes(result.errors)).toContain('SUSPICIOUS_UOM')
  })

  it('errors when a numeric dimension arrives as a string', () => {
    const result = validate({ components: [component({ weight_g: '35' as unknown as number })] })
    expect(codes(result.errors)).toContain('DIMENSION_NOT_NUMBER')
  })

  it('warns about height_mm on a flat product identified by category', () => {
    const result = validate({
      components: [component({ name: 'Edge Trim', category: 'Cladding', height_mm: 12 })],
    })
    expect(codes(result.warnings)).toContain('HEIGHT_MM_ON_FLAT_PRODUCT')
  })

  it('accepts height_mm on a non-flat component', () => {
    const result = validate({ components: [component({ height_mm: 12 })] })
    expect(codes(result.warnings)).not.toContain('HEIGHT_MM_ON_FLAT_PRODUCT')
  })

  it('warns when supplier_pack_qty is set without supplier_pack_uom', () => {
    const result = validate({ components: [component({ supplier_pack_qty: 120 })] })
    expect(codes(result.warnings)).toContain('PACK_QTY_NO_UOM')
  })

  it('accepts supplier_pack_qty paired with supplier_pack_uom', () => {
    const result = validate({
      components: [component({ supplier_pack_qty: 120, supplier_pack_uom: 'clips' })],
    })
    expect(result.warnings).toEqual([])
  })

  it('does not warn on a zero supplier_pack_qty', () => {
    const result = validate({ components: [component({ supplier_pack_qty: 0 })] })
    expect(codes(result.warnings)).not.toContain('PACK_QTY_NO_UOM')
  })

  it('errors on the deprecated fire_rating key', () => {
    const result = validate({
      components: [component({ fire_rating: 'Group 1' } as Partial<ParsedComponentCandidate>)],
    })
    expect(codes(result.errors)).toContain('DEPRECATED_FIRE_RATING')
  })
})

// ============================================================
// System-component links
// ============================================================

describe('system component validation', () => {
  it.each(['required', 'optional', 'accessory'] as const)('accepts the role %p', (role) => {
    const result = validate({ system_components: [systemComponent({ role })] })
    expect(result.errors).toEqual([])
  })

  it('errors on a descriptive role that the DB would reject', () => {
    const result = validate({
      system_components: [
        systemComponent({ role: 'fastener' as ParsedSystemComponentCandidate['role'] }),
      ],
    })
    expect(codes(result.errors)).toContain('INVALID_ROLE')
  })

  it('errors when the system match hint is empty', () => {
    const result = validate({
      system_components: [systemComponent({ staged_system_match: { system_name: null, product_code: null } })],
    })
    expect(codes(result.errors)).toContain('MATCH_HINT_EMPTY')
  })

  it('accepts a system match hint carrying only a product code', () => {
    const result = validate({
      system_components: [
        systemComponent({ staged_system_match: { system_name: null, product_code: 'NTW-AVE' } }),
      ],
    })
    expect(result.errors).toEqual([])
  })

  it('errors when component_match.name is empty', () => {
    const result = validate({
      system_components: [systemComponent({ component_match: { sku: 'CLIP-1', name: '' } })],
    })
    expect(codes(result.errors)).toContain('MATCH_HINT_EMPTY')
  })
})

// ============================================================
// Colours
// ============================================================

describe('system colour validation', () => {
  it('errors when colour_name is missing', () => {
    const result = validate({ system_colours: [colour({ colour_name: '' })] })
    expect(codes(result.errors)).toContain('REQUIRED_FIELD_MISSING')
  })

  it('warns when neither sku nor sku_suffix is present', () => {
    const result = validate({ system_colours: [colour({ sku_suffix: null })] })
    expect(codes(result.warnings)).toContain('COLOUR_NO_SKU')
  })

  it('accepts a colour identified by a full sku', () => {
    const result = validate({ system_colours: [colour({ sku_suffix: null, sku: 'NTW-AVE-ANT' })] })
    expect(result.warnings).toEqual([])
  })

  it('errors on the deprecated fire_rating key', () => {
    const result = validate({
      system_colours: [colour({ fire_rating: 'Group 1' } as Partial<ParsedSystemColourCandidate>)],
    })
    expect(codes(result.errors)).toContain('DEPRECATED_FIRE_RATING')
  })
})

// ============================================================
// Media
// ============================================================

describe('image validation', () => {
  it.each([
    'hero_manufacturer',
    'hero_system',
    'product_profile',
    'component_accessory',
    'installation_detail',
    'diagram',
    'colour_swatch',
  ] as const)('accepts the suggested usage %p', (suggested_usage) => {
    const result = validate({ media: { images: [image({ suggested_usage })] } })
    expect(result.errors).toEqual([])
  })

  it('errors on an unknown suggested usage and reports the image index', () => {
    const result = validate({
      media: {
        images: [
          image(),
          image({ suggested_usage: 'thumbnail' as ParsedImageCandidate['suggested_usage'] }),
        ],
      },
    })
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_IMAGE_USAGE', path: 'media.images[1]' }),
    )
  })

  it('warns rather than errors on a missing image confidence', () => {
    const result = validate({
      media: { images: [image({ confidence: null as unknown as number })] },
    })
    expect(result.errors).toEqual([])
    expect(codes(result.warnings)).toContain('CONFIDENCE_MISSING')
  })
})
