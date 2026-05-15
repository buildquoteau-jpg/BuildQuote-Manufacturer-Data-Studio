// Validation and reporting layer for parser dry-run output.
//
// Inspects a ParserInsertionPlan + the original ParserOutput and produces a
// DryRunReport with structured checks across entity counts, required fields,
// evidence coverage, classification heuristics, pack/UOM, and dimensions.
//
// No Supabase client. No DB writes. No AI calls. No file I/O.
// Callers write the report to disk.

import type { ParserOutput } from './types'
import type {
  ParserInsertionPlan,
  PlannedStagedSystem,
  PlannedStagedSystemProfile,
  PlannedStagedComponent,
  PlannedStagedSystemColour,
  PlannedStagedSystemComponent,
  PlanningIssue,
} from './map-to-staged'

// ----------------------------------------------------------
// Report types
// ----------------------------------------------------------

export type DryRunCheckSeverity = 'error' | 'warning' | 'info'

export type DryRunCheckCategory =
  | 'planning'
  | 'required_fields'
  | 'evidence'
  | 'classification'
  | 'pack_uom'
  | 'dimensions'
  | 'duplicates'
  | 'uncertain'

export interface DryRunCheck {
  severity: DryRunCheckSeverity
  category: DryRunCheckCategory
  code: string
  message: string
  path?: string
}

export interface EvidenceCoverage {
  /** Entities that have at least one field_sources entry (from ParserOutput). */
  entities_with_field_sources: number
  /** Entities that have zero field_sources entries. */
  entities_without_field_sources: number
  /** Total field_sources entries across all entities in ParserOutput. */
  total_field_source_entries: number
  /** Total uncertain_fields entries across all entities with parser_notes. */
  total_uncertain_fields: number
  /** field_verifications planned === parser_field_evidence planned (should always match). */
  evidence_row_parity: boolean
}

export interface DryRunReport {
  generated_at: string
  fixture_label: string
  bundle_document_id: string | null
  bundle_document_name: string | null

  plan_ok: boolean

  counts: {
    staged_systems: number
    staged_system_profiles: number
    staged_components: number
    staged_system_colours: number
    staged_system_components: number
    field_verifications: number
    parser_field_evidence: number
    media_candidates: number
  }

  planning_errors: number
  planning_warnings: number

  evidence_coverage: EvidenceCoverage

  checks: DryRunCheck[]

  totals: {
    errors: number
    warnings: number
    infos: number
  }
}

// ----------------------------------------------------------
// Keywords: things that are always components, never profiles
// ----------------------------------------------------------

const COMPONENT_KW = [
  'fascia board',
  'edge board',
  'corner trim',
  'hidden fix clip',
  'hidden fix',
  'starter strip',
  'starter trim',
  'door frame',
  'end cap',
  'edge trim',
  'fascia',
  'bullnose',
  'j-trim',
  'clip',
  'screw',
  'bolt',
  'fixing',
  'fastener',
  'nail',
  'adhesive',
  'sealant',
  'tape',
  'flashing',
  'bracket',
  'packer',
  'shim',
  'spacer',
  'jamb',
  'hinge',
  'threshold',
]

// Things that are more likely profiles (main dimensional sellable variants)
const PROFILE_KW = [
  'board',
  'panel',
  'sheet',
  'roll',
  'membrane',
  'wrap',
  'underlay',
  'cladding',
  'weatherboard',
  'deck',
]

// UOM values that look like pack sizes, not sell/quote units
const PACK_SIZE_UOM_RE = /^(pk|pack|box|carton|bag|bundle|roll)\s*\d+/i
const NUMERIC_UOM_RE = /^\d+$/

// Flat product context for dimension checks
function isFlatProductName(name: string | null | undefined): boolean {
  const t = (name ?? '').toLowerCase()
  if (/\b(roll|wrap|underlay|membrane|tape)\b/.test(t)) return false
  return /\b(board|sheet|cladding|weatherboard|panel|deck)\b/.test(t)
}

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

function check(
  checks: DryRunCheck[],
  severity: DryRunCheckSeverity,
  category: DryRunCheckCategory,
  code: string,
  message: string,
  path?: string,
) {
  checks.push({ severity, category, code, message, ...(path ? { path } : {}) })
}

function containsComponentKw(name: string): string | null {
  const lower = name.toLowerCase()
  for (const kw of COMPONENT_KW) {
    if (lower.includes(kw)) return kw
  }
  return null
}

// ----------------------------------------------------------
// Required field checks
// ----------------------------------------------------------

function checkSystems(
  rows: PlannedStagedSystem[],
  checks: DryRunCheck[],
) {
  for (const s of rows) {
    const p = `staged_systems[${s._temp_key}]`
    if (!s.name) {
      check(checks, 'error', 'required_fields', 'SYSTEM_MISSING_NAME', 'System missing required field: name', p)
    }
    if (!s.category) {
      check(checks, 'warning', 'required_fields', 'SYSTEM_MISSING_CATEGORY', 'System missing recommended field: category', p)
    }
    if (!s.manufacturer_id || s.manufacturer_id === '00000000-0000-0000-0000-000000000001') {
      check(checks, 'info', 'required_fields', 'SYSTEM_PLACEHOLDER_MFR', 'manufacturer_id is placeholder — will need real ID at insertion time', p)
    }
  }
}

function checkProfiles(
  rows: PlannedStagedSystemProfile[],
  checks: DryRunCheck[],
) {
  for (const p of rows) {
    const path = `staged_system_profiles[${p._temp_key}]`
    if (!p.profile_name && !p.name) {
      check(checks, 'error', 'required_fields', 'PROFILE_MISSING_NAME', 'Profile missing both profile_name and name', path)
    }
    if (!p.uom) {
      check(checks, 'warning', 'required_fields', 'PROFILE_MISSING_UOM', 'Profile missing recommended field: uom', path)
    }
    if (p._staged_system_temp_key === null) {
      check(checks, 'error', 'required_fields', 'PROFILE_UNRESOLVED_SYSTEM', 'Profile has no resolved system link — insertion would fail', path)
    }
  }
}

function checkComponents(
  rows: PlannedStagedComponent[],
  checks: DryRunCheck[],
) {
  for (const c of rows) {
    const path = `staged_components[${c._temp_key}]`
    if (!c.name) {
      check(checks, 'error', 'required_fields', 'COMPONENT_MISSING_NAME', 'Component missing required field: name', path)
    }
    if (!c.uom) {
      check(checks, 'warning', 'required_fields', 'COMPONENT_MISSING_UOM', 'Component missing recommended field: uom', path)
    }
  }
}

function checkColours(
  rows: PlannedStagedSystemColour[],
  checks: DryRunCheck[],
) {
  for (const c of rows) {
    const path = `staged_system_colours[${c._temp_key}]`
    if (!c.colour_name) {
      check(checks, 'error', 'required_fields', 'COLOUR_MISSING_NAME', 'Colour missing required field: colour_name', path)
    }
    if (c._staged_system_temp_key === null) {
      check(checks, 'error', 'required_fields', 'COLOUR_UNRESOLVED_SYSTEM', 'Colour has no resolved system link — insertion would fail', path)
    }
  }
}

function checkSystemComponents(
  rows: PlannedStagedSystemComponent[],
  checks: DryRunCheck[],
) {
  for (const sc of rows) {
    const path = `staged_system_components[${sc._temp_key}]`
    if (sc._staged_system_temp_key === null) {
      check(checks, 'error', 'required_fields', 'LINK_UNRESOLVED_SYSTEM', 'System-component link has no resolved system reference — insertion would fail', path)
    }
    if (sc._staged_component_temp_key === null) {
      check(checks, 'error', 'required_fields', 'LINK_UNRESOLVED_COMPONENT', 'System-component link has no resolved component reference — insertion would fail', path)
    }
  }
}

// ----------------------------------------------------------
// Evidence coverage
// ----------------------------------------------------------

function buildEvidenceCoverage(
  output: ParserOutput,
  plan: ParserInsertionPlan,
): EvidenceCoverage {
  let withSources = 0
  let withoutSources = 0
  let totalSources = 0
  let uncertainTotal = 0

  const entityGroups = [
    ...output.systems.map(e => ({ field_sources: e.field_sources, uncertain_fields: e.uncertain_fields })),
    ...output.system_profiles.map(e => ({ field_sources: e.field_sources, uncertain_fields: e.uncertain_fields })),
    ...output.components.map(e => ({ field_sources: e.field_sources, uncertain_fields: e.uncertain_fields })),
  ]

  for (const e of entityGroups) {
    const count = e.field_sources?.length ?? 0
    if (count > 0) withSources++
    else withoutSources++
    totalSources += count
    uncertainTotal += e.uncertain_fields?.length ?? 0
  }

  // Colours and system_components have no field_sources — they use entity-level key field rows.
  // Count them as "with sources" since the planner always creates their rows.
  withSources += output.system_colours.length + output.system_components.length

  const evidenceParity = plan.summary.fieldVerifications === plan.summary.parserFieldEvidence

  return {
    entities_with_field_sources: withSources,
    entities_without_field_sources: withoutSources,
    total_field_source_entries: totalSources,
    total_uncertain_fields: uncertainTotal,
    evidence_row_parity: evidenceParity,
  }
}

function checkEvidence(
  output: ParserOutput,
  plan: ParserInsertionPlan,
  coverage: EvidenceCoverage,
  checks: DryRunCheck[],
) {
  if (coverage.entities_without_field_sources > 0) {
    check(
      checks,
      'warning',
      'evidence',
      'ENTITIES_WITHOUT_FIELD_SOURCES',
      `${coverage.entities_without_field_sources} entity/entities (system/profile/component) have no field_sources entries — no field_verifications will be seeded for them`,
    )
  }

  if (!coverage.evidence_row_parity) {
    check(
      checks,
      'warning',
      'evidence',
      'EVIDENCE_ROW_MISMATCH',
      `field_verifications (${plan.summary.fieldVerifications}) ≠ parser_field_evidence (${plan.summary.parserFieldEvidence}) — planner parity check failed`,
    )
  }

  if (coverage.total_uncertain_fields > 0) {
    check(
      checks,
      'info',
      'uncertain',
      'UNCERTAIN_FIELDS_PRESENT',
      `${coverage.total_uncertain_fields} uncertain field(s) flagged across entities — review before staged write`,
    )
  }

  // Warn if a planned system_component links to a temp_key that has no field source in any entity
  const allEntityTempKeys = new Set([
    ...output.systems.map(s => s.temp_key),
    ...output.system_profiles.map(p => p.temp_key),
    ...output.components.map(c => c.temp_key),
    ...output.system_colours.map(c => c.temp_key),
    ...output.system_components.map(sc => sc.temp_key),
  ])

  for (const fv of plan.fieldVerifications) {
    if (!allEntityTempKeys.has(fv.entity_temp_key)) {
      check(
        checks,
        'warning',
        'evidence',
        'FIELD_VERIF_ORPHAN_KEY',
        `field_verifications row references unknown entity temp_key "${fv.entity_temp_key}"`,
        `field_verifications[${fv.entity_temp_key}.${fv.field_name}]`,
      )
    }
  }
}

// ----------------------------------------------------------
// Classification checks
// ----------------------------------------------------------

function checkClassification(
  output: ParserOutput,
  checks: DryRunCheck[],
) {
  // Profiles that contain component keywords
  for (const p of output.system_profiles) {
    const label = p.profile_name ?? p.name ?? ''
    const kw = containsComponentKw(label)
    if (kw) {
      check(
        checks,
        'warning',
        'classification',
        'PROFILE_LOOKS_LIKE_COMPONENT',
        `Profile name "${label}" contains component keyword "${kw}" — should this be a component instead?`,
        `system_profiles[${p.temp_key}]`,
      )
    }
  }

  // Components that might be profiles (main dimensional items)
  for (const c of output.components) {
    const lower = (c.name ?? '').toLowerCase()
    for (const kw of PROFILE_KW) {
      if (lower.includes(kw)) {
        // Only warn if no component keyword is also present
        const hasCompKw = containsComponentKw(c.name ?? '')
        if (!hasCompKw) {
          check(
            checks,
            'info',
            'classification',
            'COMPONENT_MAY_BE_PROFILE',
            `Component name "${c.name}" contains profile keyword "${kw}" — confirm it is not a main dimensional system variant`,
            `components[${c.temp_key}]`,
          )
          break
        }
      }
    }
  }
}

// ----------------------------------------------------------
// Pack / UOM checks
// ----------------------------------------------------------

function checkPackUom(
  output: ParserOutput,
  checks: DryRunCheck[],
) {
  const allItems = [
    ...output.system_profiles.map(p => ({
      temp_key: p.temp_key,
      label: p.profile_name ?? p.name ?? '',
      entity: 'system_profiles',
      uom: p.uom,
      supplier_pack_qty: p.supplier_pack_qty,
      supplier_pack_uom: p.supplier_pack_uom,
    })),
    ...output.components.map(c => ({
      temp_key: c.temp_key,
      label: c.name,
      entity: 'components',
      uom: c.uom,
      supplier_pack_qty: c.supplier_pack_qty,
      supplier_pack_uom: c.supplier_pack_uom,
    })),
  ]

  for (const item of allItems) {
    const path = `${item.entity}[${item.temp_key}]`

    if (item.uom && PACK_SIZE_UOM_RE.test(item.uom)) {
      check(
        checks,
        'error',
        'pack_uom',
        'UOM_IS_PACK_SIZE',
        `UOM "${item.uom}" looks like an encoded pack size for "${item.label}" — use supplier_pack_qty + supplier_pack_uom instead`,
        path,
      )
    }

    if (item.uom && NUMERIC_UOM_RE.test(item.uom)) {
      check(
        checks,
        'error',
        'pack_uom',
        'UOM_IS_NUMERIC',
        `UOM "${item.uom}" is a bare number for "${item.label}" — UOM must be a unit label (ea, lm, m2, roll, sheet, etc.)`,
        path,
      )
    }

    if (item.supplier_pack_qty != null && item.supplier_pack_qty > 0 && !item.supplier_pack_uom) {
      check(
        checks,
        'warning',
        'pack_uom',
        'PACK_QTY_NO_UOM',
        `supplier_pack_qty=${item.supplier_pack_qty} but supplier_pack_uom is missing for "${item.label}" — add supplier_pack_uom`,
        path,
      )
    }
  }
}

// ----------------------------------------------------------
// Dimension checks
// ----------------------------------------------------------

function checkDimensions(
  output: ParserOutput,
  checks: DryRunCheck[],
) {
  const allDimItems = [
    ...output.system_profiles.map(p => ({
      temp_key: p.temp_key,
      label: p.profile_name ?? p.name ?? '',
      entity: 'system_profiles',
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      thickness_mm: p.thickness_mm,
      height_mm: p.height_mm,
    })),
    ...output.components.map(c => ({
      temp_key: c.temp_key,
      label: c.name,
      entity: 'components',
      length_mm: c.length_mm,
      width_mm: c.width_mm,
      thickness_mm: c.thickness_mm,
      height_mm: c.height_mm,
    })),
  ]

  for (const item of allDimItems) {
    const path = `${item.entity}[${item.temp_key}]`

    // For flat products, length should usually be the largest dimension
    if (
      isFlatProductName(item.label) &&
      item.length_mm != null &&
      item.width_mm != null &&
      item.width_mm > item.length_mm
    ) {
      check(
        checks,
        'warning',
        'dimensions',
        'DIMENSION_WIDTH_EXCEEDS_LENGTH',
        `width_mm (${item.width_mm}) > length_mm (${item.length_mm}) for flat product "${item.label}" — length should be the longest axis`,
        path,
      )
    }

    // For flat products, height_mm should typically be null
    if (isFlatProductName(item.label) && item.height_mm != null) {
      check(
        checks,
        'warning',
        'dimensions',
        'HEIGHT_MM_ON_FLAT_PRODUCT',
        `height_mm is set on flat product "${item.label}" — use thickness_mm for the thin third dimension unless source explicitly labels this axis as height`,
        path,
      )
    }

    // thickness_mm and width_mm should not obviously be swapped (thickness << width for boards)
    if (
      isFlatProductName(item.label) &&
      item.thickness_mm != null &&
      item.width_mm != null &&
      item.thickness_mm > item.width_mm
    ) {
      check(
        checks,
        'warning',
        'dimensions',
        'DIMENSION_THICKNESS_EXCEEDS_WIDTH',
        `thickness_mm (${item.thickness_mm}) > width_mm (${item.width_mm}) for flat product "${item.label}" — width and thickness may be swapped`,
        path,
      )
    }
  }
}

// ----------------------------------------------------------
// Duplicate checks
// ----------------------------------------------------------

function checkDuplicates(
  output: ParserOutput,
  checks: DryRunCheck[],
) {
  // Duplicate system product_code
  const systemCodes = new Map<string, string[]>()
  for (const s of output.systems) {
    if (s.product_code) {
      const existing = systemCodes.get(s.product_code) ?? []
      existing.push(s.temp_key)
      systemCodes.set(s.product_code, existing)
    }
  }
  for (const [code, keys] of Array.from(systemCodes.entries())) {
    if (keys.length > 1) {
      check(
        checks,
        'warning',
        'duplicates',
        'DUPLICATE_SYSTEM_PRODUCT_CODE',
        `product_code "${code}" appears on ${keys.length} systems: ${keys.join(', ')}`,
      )
    }
  }

  // Duplicate profile product_code
  const profileCodes = new Map<string, string[]>()
  for (const p of output.system_profiles) {
    if (p.product_code) {
      const existing = profileCodes.get(p.product_code) ?? []
      existing.push(p.temp_key)
      profileCodes.set(p.product_code, existing)
    }
  }
  for (const [code, keys] of Array.from(profileCodes.entries())) {
    if (keys.length > 1) {
      check(
        checks,
        'warning',
        'duplicates',
        'DUPLICATE_PROFILE_PRODUCT_CODE',
        `product_code "${code}" appears on ${keys.length} profiles: ${keys.join(', ')}`,
      )
    }
  }

  // Duplicate component SKU
  const componentSkus = new Map<string, string[]>()
  for (const c of output.components) {
    if (c.sku) {
      const existing = componentSkus.get(c.sku) ?? []
      existing.push(c.temp_key)
      componentSkus.set(c.sku, existing)
    }
  }
  for (const [sku, keys] of Array.from(componentSkus.entries())) {
    if (keys.length > 1) {
      check(
        checks,
        'warning',
        'duplicates',
        'DUPLICATE_COMPONENT_SKU',
        `sku "${sku}" appears on ${keys.length} components: ${keys.join(', ')}`,
      )
    }
  }

  // Duplicate colour name within same system
  const coloursBySystem = new Map<string, string[]>()
  for (const c of output.system_colours) {
    const sysKey = c.system_match.system_name ?? c.system_match.product_code ?? '__unknown__'
    const mapKey = `${sysKey}::${c.colour_name}`
    const existing = coloursBySystem.get(mapKey) ?? []
    existing.push(c.temp_key)
    coloursBySystem.set(mapKey, existing)
  }
  for (const [mapKey, keys] of Array.from(coloursBySystem.entries())) {
    if (keys.length > 1) {
      const [, colourName] = mapKey.split('::')
      check(
        checks,
        'warning',
        'duplicates',
        'DUPLICATE_COLOUR_NAME',
        `colour_name "${colourName}" appears ${keys.length} times for the same system: ${keys.join(', ')}`,
      )
    }
  }
}

// ----------------------------------------------------------
// Planning issues from plan (surface as report checks)
// ----------------------------------------------------------

function surfacePlanningIssues(
  issues: PlanningIssue[],
  checks: DryRunCheck[],
) {
  for (const issue of issues) {
    if (issue.severity === 'info') continue  // already shown in info block
    check(
      checks,
      issue.severity as DryRunCheckSeverity,
      'planning',
      `PLAN_${issue.code}`,
      issue.message,
      issue.path,
    )
  }
}

// ----------------------------------------------------------
// Top-level entry point
// ----------------------------------------------------------

export interface DryRunReportInput {
  output: ParserOutput
  plan: ParserInsertionPlan
  fixtureLabel: string
  bundleDocumentId: string | null
  bundleDocumentName: string | null
}

/**
 * Builds a DryRunReport from a ParserInsertionPlan and its source ParserOutput.
 * Pure function — no I/O, no DB access, no AI calls.
 */
export function buildDryRunReport(input: DryRunReportInput): DryRunReport {
  const { output, plan, fixtureLabel, bundleDocumentId, bundleDocumentName } = input

  const checks: DryRunCheck[] = []

  // Surface planning issues (errors + warnings, not info)
  surfacePlanningIssues(plan.issues, checks)

  // Required field checks
  checkSystems(plan.stagedSystems, checks)
  checkProfiles(plan.stagedSystemProfiles, checks)
  checkComponents(plan.stagedComponents, checks)
  checkColours(plan.stagedSystemColours, checks)
  checkSystemComponents(plan.stagedSystemComponents, checks)

  // Evidence coverage
  const coverage = buildEvidenceCoverage(output, plan)
  checkEvidence(output, plan, coverage, checks)

  // Heuristic checks
  checkClassification(output, checks)
  checkPackUom(output, checks)
  checkDimensions(output, checks)
  checkDuplicates(output, checks)

  const totalErrors = checks.filter(c => c.severity === 'error').length
  const totalWarnings = checks.filter(c => c.severity === 'warning').length
  const totalInfos = checks.filter(c => c.severity === 'info').length

  return {
    generated_at: new Date().toISOString(),
    fixture_label: fixtureLabel,
    bundle_document_id: bundleDocumentId,
    bundle_document_name: bundleDocumentName,
    plan_ok: plan.ok,
    counts: {
      staged_systems: plan.summary.stagedSystems,
      staged_system_profiles: plan.summary.stagedSystemProfiles,
      staged_components: plan.summary.stagedComponents,
      staged_system_colours: plan.summary.stagedSystemColours,
      staged_system_components: plan.summary.stagedSystemComponents,
      field_verifications: plan.summary.fieldVerifications,
      parser_field_evidence: plan.summary.parserFieldEvidence,
      media_candidates: plan.summary.mediaCandidates,
    },
    planning_errors: plan.summary.planningErrors,
    planning_warnings: plan.summary.planningWarnings,
    evidence_coverage: coverage,
    checks,
    totals: {
      errors: totalErrors,
      warnings: totalWarnings,
      infos: totalInfos,
    },
  }
}
