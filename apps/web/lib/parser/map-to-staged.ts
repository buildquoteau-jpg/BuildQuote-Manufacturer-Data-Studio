// Insertion layer contract for parser output → staged rows.
//
// Dry-run only. No Supabase client. No DB writes. No AI calls.
//
// Takes a validated ParserOutput and returns a ParserInsertionPlan describing
// what the real insertion layer would write to:
//   - staged_systems / staged_system_profiles / staged_components
//   - staged_system_colours / staged_system_components
//   - field_verifications (UNIQUE current-state per-field reviewer rows, seeded as 'pending')
//   - parser_field_evidence (append-only per-run extraction history rows)
//
// Real UUID resolution (temp_key → DB UUID) happens in the actual insertion layer
// after each staged row is inserted. This planner uses temp keys as placeholders
// throughout and annotates which fields still need resolution.
//
// Column references are accurate to migrations 001 + 002 + 007 + 008 + 009.

import type {
  ParserOutput,
  ParserRunContext,
  ParsedSystemCandidate,
  ParsedSystemProfileCandidate,
  ParsedComponentCandidate,
  ParsedSystemComponentCandidate,
  ParsedSystemColourCandidate,
  ParsedFieldSource,
  SystemMatchHint,
  ComponentMatchHint,
} from './types'
import { validateParserOutput } from './validate'
import type { ParserValidationResult } from './validate'

// ----------------------------------------------------------
// Internal plan context
// ----------------------------------------------------------

type PlanContext = {
  extractionRunId: string
  manufacturerId: string
  sourceDocumentId: string | null
}

// Placeholder UUIDs used in dry-run mode when real context is not supplied.
// These must never reach a real DB insert.
const PLACEHOLDER_RUN_ID = '00000000-0000-0000-0000-000000000000'
const PLACEHOLDER_MANUFACTURER_ID = '00000000-0000-0000-0000-000000000001'

// ----------------------------------------------------------
// parser_notes JSONB payload
// Stored in staged_*.parser_notes (migration 008).
// Overwritten on each new extraction run — not append-only.
// ----------------------------------------------------------

type ParserNotesPayload = {
  parser_notes: string[]
  uncertain_fields: string[]
  warnings?: string[]
  ignored_content_notes?: string[]
}

// ----------------------------------------------------------
// Planned row types
//
// Each type mirrors the real DB columns for its target table.
// Fields prefixed with _ are planning metadata only — they are
// replaced by real UUIDs when the insertion layer executes.
// ----------------------------------------------------------

/** Maps to staged_systems (migrations 001 + 007 + 008). */
export type PlannedStagedSystem = {
  _temp_key: string
  // DB columns
  manufacturer_id: string
  source_document_id: string | null
  source_chunk_id: string | null
  name: string
  product_code: string | null
  slug: string | null
  category: string | null
  subcategory: string | null
  description: string | null
  bal_rating: string | null          // migration 008
  acoustic_rating: string | null
  moisture_resistant: boolean
  structural_grade: string | null
  double_sided: boolean
  sheet_format: string | null
  install_guide_urls: { label: string; url: string }[] | null
  design_guide_url: string | null
  tech_data_url: string | null
  notes: string | null               // migration 007
  sort_order: number
  extraction_confidence: number
  verification_status: 'pending_review'
  parser_notes: ParserNotesPayload | null  // migration 008
}

/**
 * Maps to staged_system_profiles (migrations 001 + 007 + 008 + 009).
 *
 * Schema note: staged_system_profiles has no source_document_id or source_chunk_id
 * columns. Source traceability lives in field_verifications per-field.
 */
export type PlannedStagedSystemProfile = {
  _temp_key: string
  _staged_system_temp_key: string | null  // resolved from system_match; null = unresolved
  // DB columns
  name: string | null
  profile_name: string | null        // migration 007
  product_code: string | null
  dimensions: string | null
  length_m: number | null            // migration 001 (metres)
  length_mm: number | null           // migration 007
  width_mm: number | null            // migration 007
  height_mm: number | null           // migration 007
  thickness_mm: number | null        // migration 007
  depth_mm: number | null            // migration 007
  gauge_mm: number | null            // migration 007
  diameter_mm: number | null         // migration 007
  roll_m: number | null              // migration 007
  weight_kg: number | null           // migration 007
  weight_g: number | null            // migration 007
  volume_ml: number | null           // migration 007
  pieces: number | null              // migration 007
  pack_format: string | null         // migration 007
  supplier_pack_qty: number | null   // migration 007
  supplier_pack_uom: string | null   // migration 007
  supplier_pack_note: string | null  // migration 007
  bal_rating: string | null          // migration 007
  uom: string | null                 // migration 009
  sort_order: number
  extraction_confidence: number
  verification_status: 'pending_review'
  parser_notes: ParserNotesPayload | null  // migration 008
}

/** Maps to staged_components (migrations 001 + 007 + 008). */
export type PlannedStagedComponent = {
  _temp_key: string
  // DB columns
  manufacturer_id: string
  source_document_id: string | null
  source_chunk_id: string | null
  sku: string | null
  name: string
  description: string | null
  category: string | null
  uom: string | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  depth_mm: number | null
  gauge_mm: number | null
  diameter_mm: number | null
  roll_m: number | null
  weight_kg: number | null
  weight_g: number | null            // migration 007
  volume_ml: number | null           // migration 007
  pieces: number | null
  pack_format: string | null         // migration 007
  supplier_pack_qty: number | null   // migration 007
  supplier_pack_uom: string | null   // migration 007
  supplier_pack_note: string | null  // migration 007
  material: string | null
  finish: string | null
  colour: string | null
  profile: string | null
  texture: string | null
  coverage_m2: number | null
  sort_order: number
  extraction_confidence: number
  verification_status: 'pending_review'
  parser_notes: ParserNotesPayload | null  // migration 008
}

/** Maps to staged_system_colours (migrations 001 + 008). */
export type PlannedStagedSystemColour = {
  _temp_key: string
  _staged_system_temp_key: string | null
  // DB columns
  colour_name: string
  sku: string | null
  sku_suffix: string | null          // migration 008
  image_url: string | null
  is_stocked: boolean
  sort_order: number
  extraction_confidence: number
  verification_status: 'pending_review'
  // parser_notes: always null — ParsedSystemColourCandidate has no parser_notes array
}

/** Maps to staged_system_components (migrations 001 + 008). */
export type PlannedStagedSystemComponent = {
  _temp_key: string
  _staged_system_temp_key: string | null
  _staged_component_temp_key: string | null
  // DB columns
  role: string
  notes: string | null
  sort_order: number
  extraction_confidence: number
  verification_status: 'pending_review'
  // parser_notes: always null — ParsedSystemComponentCandidate has no parser_notes array
}

/**
 * Maps to field_verifications (migration 002).
 * UNIQUE (entity_type, entity_id, field_name) — insertion layer enforces this.
 * entity_temp_key replaced by real entity UUID after staged row insert.
 */
export type PlannedFieldVerification = {
  entity_type: string
  entity_temp_key: string
  field_name: string
  extracted_value: string | null
  verified_value: null               // always null at seed time — set by reviewer
  source_document_id: string | null
  source_chunk_id: string | null
  source_page_number: number | null
  confidence: number | null
  status: 'pending'
}

/**
 * Maps to parser_field_evidence (migration 008).
 * Append-only — no UNIQUE constraint. Multiple runs produce multiple rows.
 * entity_temp_key replaced by real entity UUID after staged row insert.
 */
export type PlannedParserFieldEvidence = {
  extraction_run_id: string
  entity_type: string
  entity_temp_key: string
  field_name: string
  extracted_value: string | null
  source_document_id: string | null
  source_chunk_id: string | null
  source_page_number: number | null
  confidence: number | null
  is_uncertain: boolean
  parser_note: string | null
}

/**
 * Image/media candidate — dry-run only.
 * No DB table yet. Preserved in the plan for future implementation.
 */
export type PlannedMediaCandidate = {
  source_document_id: string | null
  source_page_number: number | null
  source_chunk_id: string | null
  image_url: string | null
  caption: string | null
  alt_text: string | null
  suggested_usage: string
  entity_temp_key: string | null
  confidence: number
  parser_note: string | null
}

export type PlanningIssue = {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  path?: string
}

export type ParserInsertionPlan = {
  ok: boolean
  issues: PlanningIssue[]
  stagedSystems: PlannedStagedSystem[]
  stagedSystemProfiles: PlannedStagedSystemProfile[]
  stagedComponents: PlannedStagedComponent[]
  stagedSystemColours: PlannedStagedSystemColour[]
  stagedSystemComponents: PlannedStagedSystemComponent[]
  fieldVerifications: PlannedFieldVerification[]
  parserFieldEvidence: PlannedParserFieldEvidence[]
  mediaCandidates: PlannedMediaCandidate[]
  summary: {
    stagedSystems: number
    stagedSystemProfiles: number
    stagedComponents: number
    stagedSystemColours: number
    stagedSystemComponents: number
    fieldVerifications: number
    parserFieldEvidence: number
    mediaCandidates: number
    planningErrors: number
    planningWarnings: number
  }
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

function addIssue(
  issues: PlanningIssue[],
  severity: PlanningIssue['severity'],
  code: string,
  message: string,
  path?: string,
) {
  issues.push({ severity, code, message, path })
}

// Resolve a system_match hint to a temp_key within this parser output.
// Prefers product_code match (more stable than name).
function resolveSystemTempKey(
  systems: ParsedSystemCandidate[],
  hint: SystemMatchHint,
): string | null {
  if (hint.product_code) {
    const byCode = systems.find(s => s.product_code === hint.product_code)
    if (byCode) return byCode.temp_key
  }
  if (hint.system_name) {
    const byName = systems.find(s => s.name === hint.system_name)
    if (byName) return byName.temp_key
  }
  return null
}

// Resolve a component_match hint to a temp_key within this parser output.
// Prefers SKU match (more stable than name).
function resolveComponentTempKey(
  components: ParsedComponentCandidate[],
  hint: ComponentMatchHint,
): string | null {
  if (hint.sku) {
    const bySku = components.find(c => c.sku === hint.sku)
    if (bySku) return bySku.temp_key
  }
  return components.find(c => c.name === hint.name)?.temp_key ?? null
}

// Build the parser_notes JSONB payload for a staged row.
// Returns null if the entity has nothing to store.
function buildParserNotesPayload(entity: {
  parser_notes: string[]
  uncertain_fields: string[]
  warnings?: string[]
  ignored_content_notes?: string[]
}): ParserNotesPayload | null {
  const hasContent =
    entity.parser_notes.length > 0 ||
    entity.uncertain_fields.length > 0 ||
    (entity.warnings?.length ?? 0) > 0 ||
    (entity.ignored_content_notes?.length ?? 0) > 0
  if (!hasContent) return null
  return {
    parser_notes: entity.parser_notes,
    uncertain_fields: entity.uncertain_fields,
    ...(entity.warnings?.length ? { warnings: entity.warnings } : {}),
    ...(entity.ignored_content_notes?.length
      ? { ignored_content_notes: entity.ignored_content_notes }
      : {}),
  }
}

// Plan field_verifications rows from an entity's field_sources array.
// One planned row per field_source.
function planFieldVerifsFromSources(
  entityType: string,
  entityTempKey: string,
  fieldSources: ParsedFieldSource[],
  sourceDocumentId: string | null,
): PlannedFieldVerification[] {
  return fieldSources.map(fs => ({
    entity_type: entityType,
    entity_temp_key: entityTempKey,
    field_name: fs.field_name,
    extracted_value: fs.extracted_value,
    verified_value: null,
    source_document_id: sourceDocumentId,
    source_chunk_id: fs.source_chunk_id,
    source_page_number: fs.source_page_number,
    confidence: fs.confidence,
    status: 'pending' as const,
  }))
}

// Plan parser_field_evidence rows from an entity's field_sources array.
// One planned row per field_source (append-only, no deduplication).
function planEvidenceFromSources(
  entityType: string,
  entityTempKey: string,
  fieldSources: ParsedFieldSource[],
  sourceDocumentId: string | null,
  extractionRunId: string,
): PlannedParserFieldEvidence[] {
  return fieldSources.map(fs => ({
    extraction_run_id: extractionRunId,
    entity_type: entityType,
    entity_temp_key: entityTempKey,
    field_name: fs.field_name,
    extracted_value: fs.extracted_value,
    source_document_id: sourceDocumentId,
    source_chunk_id: fs.source_chunk_id,
    source_page_number: fs.source_page_number,
    confidence: fs.confidence,
    is_uncertain: fs.is_uncertain ?? false,
    parser_note: fs.parser_note ?? null,
  }))
}

// For entities without a field_sources array (colours, system_components),
// produce a single field_verifications + evidence pair for one key field
// using entity-level source information.
function planSingleKeyFieldRows(
  entityType: string,
  entityTempKey: string,
  fieldName: string,
  fieldValue: string,
  sourceDocumentId: string | null,
  sourceChunkId: string | null | undefined,
  sourcePageNumber: number | null | undefined,
  confidence: number,
  extractionRunId: string,
): { verif: PlannedFieldVerification; evidence: PlannedParserFieldEvidence } {
  return {
    verif: {
      entity_type: entityType,
      entity_temp_key: entityTempKey,
      field_name: fieldName,
      extracted_value: fieldValue,
      verified_value: null,
      source_document_id: sourceDocumentId,
      source_chunk_id: sourceChunkId ?? null,
      source_page_number: sourcePageNumber ?? null,
      confidence,
      status: 'pending',
    },
    evidence: {
      extraction_run_id: extractionRunId,
      entity_type: entityType,
      entity_temp_key: entityTempKey,
      field_name: fieldName,
      extracted_value: fieldValue,
      source_document_id: sourceDocumentId,
      source_chunk_id: sourceChunkId ?? null,
      source_page_number: sourcePageNumber ?? null,
      confidence,
      is_uncertain: false,
      parser_note: null,
    },
  }
}

// ----------------------------------------------------------
// Entity planners
// ----------------------------------------------------------

function planSystem(
  s: ParsedSystemCandidate,
  ctx: PlanContext,
  _issues: PlanningIssue[],
): {
  row: PlannedStagedSystem
  fieldVerifs: PlannedFieldVerification[]
  evidence: PlannedParserFieldEvidence[]
} {
  const srcDocId = s.source_document_id ?? ctx.sourceDocumentId

  return {
    row: {
      _temp_key: s.temp_key,
      manufacturer_id: ctx.manufacturerId,
      source_document_id: s.source_document_id,
      source_chunk_id: s.source_chunk_id,
      name: s.name,
      product_code: s.product_code ?? null,
      slug: s.slug ?? null,
      category: s.category ?? null,
      subcategory: s.subcategory ?? null,
      description: s.description ?? null,
      bal_rating: s.bal_rating ?? null,
      acoustic_rating: s.acoustic_rating ?? null,
      moisture_resistant: s.moisture_resistant ?? false,
      structural_grade: s.structural_grade ?? null,
      double_sided: s.double_sided ?? false,
      sheet_format: s.sheet_format ?? null,
      install_guide_urls: s.install_guide_urls ?? null,
      design_guide_url: s.design_guide_url ?? null,
      tech_data_url: s.tech_data_url ?? null,
      notes: s.notes ?? null,
      sort_order: s.sort_order ?? 0,
      extraction_confidence: s.extraction_confidence,
      verification_status: 'pending_review',
      parser_notes: buildParserNotesPayload(s),
    },
    fieldVerifs: planFieldVerifsFromSources(
      'staged_system',
      s.temp_key,
      s.field_sources,
      srcDocId,
    ),
    evidence: planEvidenceFromSources(
      'staged_system',
      s.temp_key,
      s.field_sources,
      srcDocId,
      ctx.extractionRunId,
    ),
  }
}

function planProfile(
  p: ParsedSystemProfileCandidate,
  ctx: PlanContext,
  systems: ParsedSystemCandidate[],
  issues: PlanningIssue[],
): {
  row: PlannedStagedSystemProfile
  fieldVerifs: PlannedFieldVerification[]
  evidence: PlannedParserFieldEvidence[]
} {
  const path = `system_profiles[${p.temp_key}]`

  const systemTempKey = resolveSystemTempKey(systems, p.system_match)
  if (!systemTempKey) {
    addIssue(
      issues,
      'error',
      'UNRESOLVED_SYSTEM_MATCH',
      `Cannot resolve system_match { system_name: "${p.system_match.system_name}", ` +
        `product_code: "${p.system_match.product_code}" } to any system in this output`,
      path,
    )
  }

  return {
    row: {
      _temp_key: p.temp_key,
      _staged_system_temp_key: systemTempKey,
      name: p.name ?? null,
      profile_name: p.profile_name ?? null,
      product_code: p.product_code ?? null,
      dimensions: p.dimensions ?? null,
      length_m: p.length_m ?? null,
      length_mm: p.length_mm ?? null,
      width_mm: p.width_mm ?? null,
      height_mm: p.height_mm ?? null,
      thickness_mm: p.thickness_mm ?? null,
      depth_mm: p.depth_mm ?? null,
      gauge_mm: p.gauge_mm ?? null,
      diameter_mm: p.diameter_mm ?? null,
      roll_m: p.roll_m ?? null,
      weight_kg: p.weight_kg ?? null,
      weight_g: p.weight_g ?? null,
      volume_ml: p.volume_ml ?? null,
      pieces: p.pieces ?? null,
      pack_format: p.pack_format ?? null,
      supplier_pack_qty: p.supplier_pack_qty ?? null,
      supplier_pack_uom: p.supplier_pack_uom ?? null,
      supplier_pack_note: p.supplier_pack_note ?? null,
      bal_rating: p.bal_rating ?? null,
      uom: p.uom ?? null,
      sort_order: p.sort_order ?? 0,
      extraction_confidence: p.extraction_confidence,
      verification_status: 'pending_review',
      parser_notes: buildParserNotesPayload(p),
    },
    fieldVerifs: planFieldVerifsFromSources(
      'staged_system_profile',
      p.temp_key,
      p.field_sources,
      ctx.sourceDocumentId,
    ),
    evidence: planEvidenceFromSources(
      'staged_system_profile',
      p.temp_key,
      p.field_sources,
      ctx.sourceDocumentId,
      ctx.extractionRunId,
    ),
  }
}

function planComponent(
  c: ParsedComponentCandidate,
  ctx: PlanContext,
  _issues: PlanningIssue[],
): {
  row: PlannedStagedComponent
  fieldVerifs: PlannedFieldVerification[]
  evidence: PlannedParserFieldEvidence[]
} {
  const srcDocId = c.source_document_id ?? ctx.sourceDocumentId

  return {
    row: {
      _temp_key: c.temp_key,
      manufacturer_id: ctx.manufacturerId,
      source_document_id: c.source_document_id ?? null,
      source_chunk_id: c.source_chunk_id ?? null,
      sku: c.sku ?? null,
      name: c.name,
      description: c.description ?? null,
      category: c.category ?? null,
      uom: c.uom ?? null,
      length_mm: c.length_mm ?? null,
      width_mm: c.width_mm ?? null,
      height_mm: c.height_mm ?? null,
      thickness_mm: c.thickness_mm ?? null,
      depth_mm: c.depth_mm ?? null,
      gauge_mm: c.gauge_mm ?? null,
      diameter_mm: c.diameter_mm ?? null,
      roll_m: c.roll_m ?? null,
      weight_kg: c.weight_kg ?? null,
      weight_g: c.weight_g ?? null,
      volume_ml: c.volume_ml ?? null,
      pieces: c.pieces ?? null,
      pack_format: c.pack_format ?? null,
      supplier_pack_qty: c.supplier_pack_qty ?? null,
      supplier_pack_uom: c.supplier_pack_uom ?? null,
      supplier_pack_note: c.supplier_pack_note ?? null,
      material: c.material ?? null,
      finish: c.finish ?? null,
      colour: c.colour ?? null,
      profile: c.profile ?? null,
      texture: c.texture ?? null,
      coverage_m2: c.coverage_m2 ?? null,
      sort_order: c.sort_order ?? 0,
      extraction_confidence: c.extraction_confidence,
      verification_status: 'pending_review',
      parser_notes: buildParserNotesPayload(c),
    },
    fieldVerifs: planFieldVerifsFromSources(
      'staged_component',
      c.temp_key,
      c.field_sources,
      srcDocId,
    ),
    evidence: planEvidenceFromSources(
      'staged_component',
      c.temp_key,
      c.field_sources,
      srcDocId,
      ctx.extractionRunId,
    ),
  }
}

function planColour(
  c: ParsedSystemColourCandidate,
  ctx: PlanContext,
  systems: ParsedSystemCandidate[],
  issues: PlanningIssue[],
): {
  row: PlannedStagedSystemColour
  fieldVerifs: PlannedFieldVerification[]
  evidence: PlannedParserFieldEvidence[]
} {
  const path = `system_colours[${c.temp_key}]`

  const systemTempKey = resolveSystemTempKey(systems, c.system_match)
  if (!systemTempKey) {
    addIssue(
      issues,
      'error',
      'UNRESOLVED_SYSTEM_MATCH',
      `Cannot resolve system_match { system_name: "${c.system_match.system_name}", ` +
        `product_code: "${c.system_match.product_code}" } to any system in this output`,
      path,
    )
  }

  const row: PlannedStagedSystemColour = {
    _temp_key: c.temp_key,
    _staged_system_temp_key: systemTempKey,
    colour_name: c.colour_name,
    sku: c.sku ?? null,
    sku_suffix: c.sku_suffix ?? null,
    image_url: c.image_url ?? null,
    is_stocked: c.is_stocked ?? true,
    sort_order: c.sort_order ?? 0,
    extraction_confidence: c.extraction_confidence,
    verification_status: 'pending_review',
  }

  // Colours have no field_sources array — generate entity-level field_verifications
  // for colour_name (always), sku_suffix (if set), and sku (if set).
  const fieldVerifs: PlannedFieldVerification[] = []
  const evidence: PlannedParserFieldEvidence[] = []

  const addKeyField = (fieldName: string, value: string) => {
    const { verif, evidence: ev } = planSingleKeyFieldRows(
      'staged_system_colour',
      c.temp_key,
      fieldName,
      value,
      ctx.sourceDocumentId,
      c.source_chunk_id,
      c.source_page_number,
      c.extraction_confidence,
      ctx.extractionRunId,
    )
    fieldVerifs.push(verif)
    evidence.push(ev)
  }

  addKeyField('colour_name', c.colour_name)
  if (c.sku_suffix) addKeyField('sku_suffix', c.sku_suffix)
  if (c.sku) addKeyField('sku', c.sku)

  return { row, fieldVerifs, evidence }
}

function planSystemComponent(
  sc: ParsedSystemComponentCandidate,
  ctx: PlanContext,
  systems: ParsedSystemCandidate[],
  components: ParsedComponentCandidate[],
  issues: PlanningIssue[],
): {
  row: PlannedStagedSystemComponent
  fieldVerifs: PlannedFieldVerification[]
  evidence: PlannedParserFieldEvidence[]
} {
  const path = `system_components[${sc.temp_key}]`

  const systemTempKey = resolveSystemTempKey(systems, sc.staged_system_match)
  if (!systemTempKey) {
    addIssue(
      issues,
      'error',
      'UNRESOLVED_SYSTEM_MATCH',
      `Cannot resolve staged_system_match { system_name: "${sc.staged_system_match.system_name}", ` +
        `product_code: "${sc.staged_system_match.product_code}" } to any system in this output`,
      path,
    )
  }

  const componentTempKey = resolveComponentTempKey(components, sc.component_match)
  if (!componentTempKey) {
    addIssue(
      issues,
      'error',
      'UNRESOLVED_COMPONENT_MATCH',
      `Cannot resolve component_match { sku: "${sc.component_match.sku}", ` +
        `name: "${sc.component_match.name}" } to any component in this output`,
      path,
    )
  }

  const row: PlannedStagedSystemComponent = {
    _temp_key: sc.temp_key,
    _staged_system_temp_key: systemTempKey,
    _staged_component_temp_key: componentTempKey,
    role: sc.role,
    notes: sc.notes ?? null,
    sort_order: sc.sort_order ?? 0,
    extraction_confidence: sc.extraction_confidence,
    verification_status: 'pending_review',
  }

  // System-components have no field_sources — generate entity-level field_verif for role.
  const { verif, evidence: ev } = planSingleKeyFieldRows(
    'staged_system_component',
    sc.temp_key,
    'role',
    sc.role,
    ctx.sourceDocumentId,
    sc.source_chunk_id,
    sc.source_page_number,
    sc.extraction_confidence,
    ctx.extractionRunId,
  )

  return { row, fieldVerifs: [verif], evidence: [ev] }
}

// ----------------------------------------------------------
// Main entry point
// ----------------------------------------------------------

/**
 * Plans the full DB insertion for a ParserOutput.
 * Dry-run only — no Supabase writes, no DB access, no AI calls.
 *
 * Calls validateParserOutput internally. If validation has errors,
 * returns ok=false immediately with those errors in issues.
 *
 * context is optional for dry-run scripts. Missing extraction_run_id
 * and manufacturer_id are replaced with placeholder UUIDs and noted
 * as info issues. Real insertion requires valid context.
 */
export function planParserOutputInsertion(
  output: ParserOutput,
  context?: Partial<ParserRunContext>,
): ParserInsertionPlan {
  const issues: PlanningIssue[] = []

  // Step 1: validate first — refuse to plan if validation has errors
  const validation: ParserValidationResult = validateParserOutput(output)
  if (!validation.ok) {
    for (const e of validation.errors) {
      addIssue(issues, 'error', `VALIDATION_${e.code}`, e.message, e.path)
    }
    const empty = {
      ok: false,
      issues,
      stagedSystems: [],
      stagedSystemProfiles: [],
      stagedComponents: [],
      stagedSystemColours: [],
      stagedSystemComponents: [],
      fieldVerifications: [],
      parserFieldEvidence: [],
      mediaCandidates: [],
      summary: {
        stagedSystems: 0,
        stagedSystemProfiles: 0,
        stagedComponents: 0,
        stagedSystemColours: 0,
        stagedSystemComponents: 0,
        fieldVerifications: 0,
        parserFieldEvidence: 0,
        mediaCandidates: 0,
        planningErrors: 0,
        planningWarnings: 0,
      },
    }
    return empty
  }

  // Surface validation warnings into the plan
  for (const w of validation.warnings) {
    addIssue(issues, 'warning', `VALIDATION_${w.code}`, w.message, w.path)
  }

  // Step 2: assemble plan context, noting any placeholders
  const extractionRunId = context?.extraction_run_id ?? PLACEHOLDER_RUN_ID
  const manufacturerId = context?.manufacturer_id ?? PLACEHOLDER_MANUFACTURER_ID

  if (!context?.extraction_run_id) {
    addIssue(
      issues,
      'info',
      'DRY_RUN_PLACEHOLDER',
      `extraction_run_id not supplied — using placeholder ${PLACEHOLDER_RUN_ID}. ` +
        'Real insertion requires a valid extraction_run_id from an extraction_runs row.',
    )
  }
  if (!context?.manufacturer_id) {
    addIssue(
      issues,
      'info',
      'DRY_RUN_PLACEHOLDER',
      `manufacturer_id not supplied — using placeholder ${PLACEHOLDER_MANUFACTURER_ID}. ` +
        'Real insertion requires a valid manufacturer_id from data_studio_manufacturers.',
    )
  }

  const ctx: PlanContext = {
    extractionRunId,
    manufacturerId,
    sourceDocumentId: output.source_document_id,
  }

  // Step 3: plan all entities

  const stagedSystems: PlannedStagedSystem[] = []
  const stagedSystemProfiles: PlannedStagedSystemProfile[] = []
  const stagedComponents: PlannedStagedComponent[] = []
  const stagedSystemColours: PlannedStagedSystemColour[] = []
  const stagedSystemComponents: PlannedStagedSystemComponent[] = []
  const fieldVerifications: PlannedFieldVerification[] = []
  const parserFieldEvidence: PlannedParserFieldEvidence[] = []
  const mediaCandidates: PlannedMediaCandidate[] = []

  for (const s of output.systems) {
    const { row, fieldVerifs, evidence } = planSystem(s, ctx, issues)
    stagedSystems.push(row)
    fieldVerifications.push(...fieldVerifs)
    parserFieldEvidence.push(...evidence)
  }

  for (const p of output.system_profiles) {
    const { row, fieldVerifs, evidence } = planProfile(p, ctx, output.systems, issues)
    stagedSystemProfiles.push(row)
    fieldVerifications.push(...fieldVerifs)
    parserFieldEvidence.push(...evidence)
  }

  for (const c of output.components) {
    const { row, fieldVerifs, evidence } = planComponent(c, ctx, issues)
    stagedComponents.push(row)
    fieldVerifications.push(...fieldVerifs)
    parserFieldEvidence.push(...evidence)
  }

  for (const c of output.system_colours) {
    const { row, fieldVerifs, evidence } = planColour(c, ctx, output.systems, issues)
    stagedSystemColours.push(row)
    fieldVerifications.push(...fieldVerifs)
    parserFieldEvidence.push(...evidence)
  }

  for (const sc of output.system_components) {
    const { row, fieldVerifs, evidence } = planSystemComponent(
      sc,
      ctx,
      output.systems,
      output.components,
      issues,
    )
    stagedSystemComponents.push(row)
    fieldVerifications.push(...fieldVerifs)
    parserFieldEvidence.push(...evidence)
  }

  // Media candidates — dry-run only; no DB table yet
  if (output.media) {
    for (const img of output.media.images) {
      mediaCandidates.push({
        source_document_id: img.source_document_id ?? null,
        source_page_number: img.source_page_number ?? null,
        source_chunk_id: img.source_chunk_id ?? null,
        image_url: img.image_url ?? null,
        caption: img.caption ?? null,
        alt_text: img.alt_text ?? null,
        suggested_usage: img.suggested_usage,
        entity_temp_key: img.entity_temp_key ?? null,
        confidence: img.confidence,
        parser_note: img.parser_note ?? null,
      })
    }
  }

  const planningErrors = issues.filter(i => i.severity === 'error').length
  const planningWarnings = issues.filter(i => i.severity === 'warning').length

  return {
    ok: planningErrors === 0,
    issues,
    stagedSystems,
    stagedSystemProfiles,
    stagedComponents,
    stagedSystemColours,
    stagedSystemComponents,
    fieldVerifications,
    parserFieldEvidence,
    mediaCandidates,
    summary: {
      stagedSystems: stagedSystems.length,
      stagedSystemProfiles: stagedSystemProfiles.length,
      stagedComponents: stagedComponents.length,
      stagedSystemColours: stagedSystemColours.length,
      stagedSystemComponents: stagedSystemComponents.length,
      fieldVerifications: fieldVerifications.length,
      parserFieldEvidence: parserFieldEvidence.length,
      mediaCandidates: mediaCandidates.length,
      planningErrors,
      planningWarnings,
    },
  }
}
