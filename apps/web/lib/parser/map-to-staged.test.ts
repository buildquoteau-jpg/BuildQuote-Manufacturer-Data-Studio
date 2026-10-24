import { describe, it, expect } from 'vitest'
import { planParserOutputInsertion } from './map-to-staged'
import type {
  ParsedComponentCandidate,
  ParsedFieldSource,
  ParsedSystemCandidate,
  ParsedSystemColourCandidate,
  ParsedSystemComponentCandidate,
  ParsedSystemProfileCandidate,
  ParserOutput,
} from './types'

// ============================================================
// Fixtures — a contract-clean output so the planner runs past validation.
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
    source_document_id: 'doc-sys',
    source_chunk_id: 'chunk-sys',
    source_page_number: 1,
    name: 'Avenue Decking',
    product_code: 'NTW-AVE',
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
    sku: 'CLIP-1',
    uom: 'ea',
    extraction_confidence: 0.8,
    parser_notes: [],
    uncertain_fields: [],
    field_sources: [source('name')],
    ...over,
  }
}

function link(over: Partial<ParsedSystemComponentCandidate> = {}): ParsedSystemComponentCandidate {
  return {
    temp_key: 'link_0',
    staged_system_match: { system_name: 'Avenue Decking', product_code: null },
    component_match: { sku: null, name: 'Hidden Fix Clip' },
    role: 'required',
    extraction_confidence: 0.7,
    source_chunk_id: 'chunk-link',
    source_page_number: 9,
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
    source_chunk_id: 'chunk-colour',
    source_page_number: 7,
    ...over,
  }
}

function output(over: Partial<ParserOutput> = {}): ParserOutput {
  return {
    source_document_id: 'doc-1',
    systems: [system()],
    system_profiles: [],
    components: [],
    system_components: [],
    system_colours: [],
    warnings: [],
    ignored_content_notes: [],
    ...over,
  }
}

const CONTEXT = { extraction_run_id: 'run-1', manufacturer_id: 'mfr-1' }

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code)
}

// ============================================================
// Validation gate
// ============================================================

describe('planParserOutputInsertion validation gate', () => {
  it('refuses to plan anything when validation fails', () => {
    const plan = planParserOutputInsertion(
      output({ systems: [system({ name: '' })] }),
      CONTEXT,
    )
    expect(plan.ok).toBe(false)
    expect(plan.stagedSystems).toEqual([])
    expect(plan.summary.stagedSystems).toBe(0)
    expect(codes(plan.issues)).toContain('VALIDATION_REQUIRED_FIELD_MISSING')
    // The empty plan reports zero planning errors even though it failed —
    // the failure is recorded as VALIDATION_* issues.
    expect(plan.summary.planningErrors).toBe(0)
  })

  it('surfaces validation warnings as plan warnings but still plans', () => {
    const plan = planParserOutputInsertion(
      output({ systems: [system({ category: null })] }),
      CONTEXT,
    )
    expect(plan.ok).toBe(true)
    expect(codes(plan.issues)).toContain('VALIDATION_REQUIRED_FIELD_MISSING')
    expect(plan.summary.planningWarnings).toBe(1)
    expect(plan.stagedSystems).toHaveLength(1)
  })
})

// ============================================================
// Run context
// ============================================================

describe('run context', () => {
  it('uses the supplied ids without placeholder notes', () => {
    const plan = planParserOutputInsertion(output(), CONTEXT)
    expect(plan.stagedSystems[0].manufacturer_id).toBe('mfr-1')
    expect(plan.parserFieldEvidence[0].extraction_run_id).toBe('run-1')
    expect(codes(plan.issues)).not.toContain('DRY_RUN_PLACEHOLDER')
  })

  it('falls back to placeholder ids and notes each one', () => {
    const plan = planParserOutputInsertion(output())
    expect(plan.stagedSystems[0].manufacturer_id).toBe('00000000-0000-0000-0000-000000000001')
    expect(plan.parserFieldEvidence[0].extraction_run_id).toBe('00000000-0000-0000-0000-000000000000')
    expect(plan.issues.filter((i) => i.code === 'DRY_RUN_PLACEHOLDER')).toHaveLength(2)
    // Placeholders are informational — they must not block a dry run.
    expect(plan.ok).toBe(true)
  })
})

// ============================================================
// Systems
// ============================================================

describe('planned staged_systems rows', () => {
  it('maps a system to its DB columns with defaults applied', () => {
    const plan = planParserOutputInsertion(output(), CONTEXT)
    expect(plan.stagedSystems[0]).toMatchObject({
      _temp_key: 'system_0',
      manufacturer_id: 'mfr-1',
      source_document_id: 'doc-sys',
      source_chunk_id: 'chunk-sys',
      name: 'Avenue Decking',
      product_code: 'NTW-AVE',
      category: 'Decking',
      moisture_resistant: false,
      double_sided: false,
      sort_order: 0,
      verification_status: 'pending_review',
      parser_notes: null,
    })
  })

  it('builds a parser_notes payload only from the parts that have content', () => {
    const plan = planParserOutputInsertion(
      output({
        systems: [
          system({
            parser_notes: ['Merged two tables'],
            uncertain_fields: ['name'],
            field_sources: [source('name', { is_uncertain: true })],
            ignored_content_notes: ['Skipped price list'],
          }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.stagedSystems[0].parser_notes).toEqual({
      parser_notes: ['Merged two tables'],
      uncertain_fields: ['name'],
      ignored_content_notes: ['Skipped price list'],
    })
  })

  it('plans one field_verification and one evidence row per field source', () => {
    const plan = planParserOutputInsertion(
      output({ systems: [system({ field_sources: [source('name'), source('category')] })] }),
      CONTEXT,
    )
    expect(plan.fieldVerifications).toHaveLength(2)
    expect(plan.parserFieldEvidence).toHaveLength(2)
    expect(plan.fieldVerifications[0]).toEqual({
      entity_type: 'staged_system',
      entity_temp_key: 'system_0',
      field_name: 'name',
      extracted_value: 'x',
      verified_value: null,
      source_document_id: 'doc-sys',
      source_chunk_id: 'chunk-1',
      source_page_number: 4,
      confidence: 0.9,
      status: 'pending',
    })
    expect(plan.parserFieldEvidence[0]).toMatchObject({
      extraction_run_id: 'run-1',
      entity_type: 'staged_system',
      is_uncertain: false,
      parser_note: null,
    })
  })

  it('carries per-field uncertainty and notes into the evidence rows', () => {
    const plan = planParserOutputInsertion(
      output({
        systems: [
          system({
            uncertain_fields: ['name'],
            field_sources: [source('name', { is_uncertain: true, parser_note: 'blurred scan' })],
          }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.parserFieldEvidence[0]).toMatchObject({
      is_uncertain: true,
      parser_note: 'blurred scan',
    })
  })

  it('falls back to the output-level source document for evidence rows', () => {
    const plan = planParserOutputInsertion(
      output({ systems: [system({ source_document_id: null })] }),
      CONTEXT,
    )
    expect(plan.stagedSystems[0].source_document_id).toBeNull()
    expect(plan.fieldVerifications[0].source_document_id).toBe('doc-1')
  })
})

// ============================================================
// Profiles
// ============================================================

describe('planned staged_system_profiles rows', () => {
  it('resolves the parent system by name', () => {
    const plan = planParserOutputInsertion(output({ system_profiles: [profile()] }), CONTEXT)
    expect(plan.stagedSystemProfiles[0]._staged_system_temp_key).toBe('system_0')
    expect(plan.ok).toBe(true)
  })

  it('prefers a product_code match over a name match', () => {
    const plan = planParserOutputInsertion(
      output({
        systems: [system(), system({ temp_key: 'system_1', name: 'Linea', product_code: 'JH-LIN' })],
        system_profiles: [
          profile({ system_match: { system_name: 'Avenue Decking', product_code: 'JH-LIN' } }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.stagedSystemProfiles[0]._staged_system_temp_key).toBe('system_1')
  })

  it('falls back to the name when the product code matches nothing', () => {
    const plan = planParserOutputInsertion(
      output({
        system_profiles: [
          profile({ system_match: { system_name: 'Avenue Decking', product_code: 'NOPE' } }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.stagedSystemProfiles[0]._staged_system_temp_key).toBe('system_0')
  })

  it('errors when the system match cannot be resolved', () => {
    const plan = planParserOutputInsertion(
      output({
        system_profiles: [profile({ system_match: { system_name: 'Ghost', product_code: null } })],
      }),
      CONTEXT,
    )
    expect(plan.ok).toBe(false)
    expect(plan.summary.planningErrors).toBe(1)
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'UNRESOLVED_SYSTEM_MATCH',
        path: 'system_profiles[profile_0]',
      }),
    )
    // The row is still planned, flagged as unresolved for the insertion layer.
    expect(plan.stagedSystemProfiles[0]._staged_system_temp_key).toBeNull()
  })

  it('maps dimension, pack and uom columns through unchanged', () => {
    const plan = planParserOutputInsertion(
      output({
        system_profiles: [
          profile({
            length_mm: 5400,
            width_mm: 138,
            thickness_mm: 29,
            supplier_pack_qty: 10,
            supplier_pack_uom: 'boards',
            uom: 'ea',
            sort_order: 3,
          }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.stagedSystemProfiles[0]).toMatchObject({
      length_mm: 5400,
      width_mm: 138,
      thickness_mm: 29,
      height_mm: null,
      supplier_pack_qty: 10,
      supplier_pack_uom: 'boards',
      uom: 'ea',
      sort_order: 3,
      verification_status: 'pending_review',
    })
  })

  it('attributes profile evidence to the output-level source document', () => {
    const plan = planParserOutputInsertion(output({ system_profiles: [profile()] }), CONTEXT)
    expect(plan.fieldVerifications).toContainEqual(
      expect.objectContaining({
        entity_type: 'staged_system_profile',
        entity_temp_key: 'profile_0',
        source_document_id: 'doc-1',
      }),
    )
  })
})

// ============================================================
// Components and links
// ============================================================

describe('planned staged_components rows', () => {
  it('maps a component to its DB columns', () => {
    const plan = planParserOutputInsertion(output({ components: [component()] }), CONTEXT)
    expect(plan.stagedComponents[0]).toMatchObject({
      _temp_key: 'component_0',
      manufacturer_id: 'mfr-1',
      sku: 'CLIP-1',
      name: 'Hidden Fix Clip',
      uom: 'ea',
      source_document_id: null,
      sort_order: 0,
      verification_status: 'pending_review',
    })
    expect(plan.fieldVerifications[1]).toMatchObject({
      entity_type: 'staged_component',
      source_document_id: 'doc-1',
    })
  })
})

describe('planned staged_system_components rows', () => {
  it('resolves both sides of the link and seeds a role verification', () => {
    const plan = planParserOutputInsertion(
      output({ components: [component()], system_components: [link()] }),
      CONTEXT,
    )
    expect(plan.stagedSystemComponents[0]).toMatchObject({
      _staged_system_temp_key: 'system_0',
      _staged_component_temp_key: 'component_0',
      role: 'required',
      notes: null,
      sort_order: 0,
    })
    expect(plan.fieldVerifications).toContainEqual({
      entity_type: 'staged_system_component',
      entity_temp_key: 'link_0',
      field_name: 'role',
      extracted_value: 'required',
      verified_value: null,
      source_document_id: 'doc-1',
      source_chunk_id: 'chunk-link',
      source_page_number: 9,
      confidence: 0.7,
      status: 'pending',
    })
  })

  it('prefers a sku match over a name match for the component', () => {
    const plan = planParserOutputInsertion(
      output({
        components: [component(), component({ temp_key: 'component_1', sku: 'CLIP-2', name: 'End Cap' })],
        system_components: [link({ component_match: { sku: 'CLIP-2', name: 'Hidden Fix Clip' } })],
      }),
      CONTEXT,
    )
    expect(plan.stagedSystemComponents[0]._staged_component_temp_key).toBe('component_1')
  })

  it('errors when the system side of the link cannot be resolved', () => {
    const plan = planParserOutputInsertion(
      output({
        components: [component()],
        system_components: [
          link({ staged_system_match: { system_name: 'Ghost', product_code: null } }),
        ],
      }),
      CONTEXT,
    )
    expect(plan.ok).toBe(false)
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_SYSTEM_MATCH',
        path: 'system_components[link_0]',
      }),
    )
    expect(plan.stagedSystemComponents[0]._staged_system_temp_key).toBeNull()
  })

  it('errors when the component match cannot be resolved', () => {
    const plan = planParserOutputInsertion(
      output({ system_components: [link()] }),
      CONTEXT,
    )
    expect(plan.ok).toBe(false)
    expect(codes(plan.issues)).toContain('UNRESOLVED_COMPONENT_MATCH')
    expect(plan.stagedSystemComponents[0]._staged_component_temp_key).toBeNull()
  })
})

// ============================================================
// Colours
// ============================================================

describe('planned staged_system_colours rows', () => {
  it('defaults is_stocked to true and links the parent system', () => {
    const plan = planParserOutputInsertion(output({ system_colours: [colour()] }), CONTEXT)
    expect(plan.stagedSystemColours[0]).toMatchObject({
      _temp_key: 'colour_0',
      _staged_system_temp_key: 'system_0',
      colour_name: 'Antique',
      sku: null,
      sku_suffix: '-ANT',
      is_stocked: true,
      verification_status: 'pending_review',
    })
  })

  it('seeds a verification per populated colour identifier', () => {
    const plan = planParserOutputInsertion(
      output({ system_colours: [colour({ sku: 'NTW-AVE-ANT' })] }),
      CONTEXT,
    )
    const colourFields = plan.fieldVerifications
      .filter((v) => v.entity_type === 'staged_system_colour')
      .map((v) => v.field_name)
    expect(colourFields).toEqual(['colour_name', 'sku_suffix', 'sku'])
  })

  it('seeds only colour_name when no sku information exists', () => {
    const plan = planParserOutputInsertion(
      output({ system_colours: [colour({ sku_suffix: null })] }),
      CONTEXT,
    )
    const colourFields = plan.fieldVerifications
      .filter((v) => v.entity_type === 'staged_system_colour')
      .map((v) => v.field_name)
    expect(colourFields).toEqual(['colour_name'])
  })

  it('errors when the colour cannot be attached to a system', () => {
    const plan = planParserOutputInsertion(
      output({ system_colours: [colour({ system_match: { system_name: 'Ghost', product_code: null } })] }),
      CONTEXT,
    )
    expect(plan.ok).toBe(false)
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_SYSTEM_MATCH',
        path: 'system_colours[colour_0]',
      }),
    )
    expect(plan.stagedSystemColours[0]._staged_system_temp_key).toBeNull()
  })

  it('keeps an explicit is_stocked=false', () => {
    const plan = planParserOutputInsertion(
      output({ system_colours: [colour({ is_stocked: false })] }),
      CONTEXT,
    )
    expect(plan.stagedSystemColours[0].is_stocked).toBe(false)
  })
})

// ============================================================
// Media and summary
// ============================================================

describe('media candidates and summary', () => {
  it('plans media candidates without a DB table', () => {
    const plan = planParserOutputInsertion(
      output({
        media: {
          images: [
            {
              suggested_usage: 'hero_system',
              confidence: 0.6,
              image_url: 'https://example.com/hero.jpg',
              entity_temp_key: 'system_0',
            },
          ],
        },
      }),
      CONTEXT,
    )
    expect(plan.mediaCandidates).toEqual([
      {
        source_document_id: null,
        source_page_number: null,
        source_chunk_id: null,
        image_url: 'https://example.com/hero.jpg',
        caption: null,
        alt_text: null,
        suggested_usage: 'hero_system',
        entity_temp_key: 'system_0',
        confidence: 0.6,
        parser_note: null,
      },
    ])
  })

  it('counts every planned row group', () => {
    const plan = planParserOutputInsertion(
      output({
        system_profiles: [profile()],
        components: [component()],
        system_components: [link()],
        system_colours: [colour()],
        media: { images: [{ suggested_usage: 'diagram', confidence: 0.5 }] },
      }),
      CONTEXT,
    )
    expect(plan.summary).toMatchObject({
      stagedSystems: 1,
      stagedSystemProfiles: 1,
      stagedComponents: 1,
      stagedSystemColours: 1,
      stagedSystemComponents: 1,
      // 3 field_sources + 2 colour identifiers + 1 link role
      fieldVerifications: 6,
      parserFieldEvidence: 6,
      mediaCandidates: 1,
      planningErrors: 0,
    })
    expect(plan.ok).toBe(true)
  })
})
