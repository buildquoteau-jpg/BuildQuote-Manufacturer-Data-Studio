// Dry-run validator for ParserOutput objects.
//
// Checks mock parser output against the rules in docs/parser-contracts.md and
// docs/extraction-architecture.md.
//
// No Supabase client. No DB writes. No AI calls. No file uploads.
// Imports only from ./types.

import type {
  ParserOutput,
  ParsedSystemCandidate,
  ParsedSystemProfileCandidate,
  ParsedComponentCandidate,
  ParsedSystemComponentCandidate,
  ParsedSystemColourCandidate,
  ParsedImageCandidate,
  ParsedFieldSource,
  ParsedDimensions,
  ImageSuggestedUsage,
} from './types'

// ----------------------------------------------------------
// Result types
// ----------------------------------------------------------

export type ParserValidationIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
}

export type ParserValidationResult = {
  ok: boolean
  errors: ParserValidationIssue[]
  warnings: ParserValidationIssue[]
}

// ----------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------

function err(issues: ParserValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ severity: 'error', code, message, path })
}

function warn(issues: ParserValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ severity: 'warning', code, message, path })
}

function hasFieldSource(field_sources: ParsedFieldSource[], field_name: string): boolean {
  return field_sources.some(fs => fs.field_name === field_name)
}

// Rule 3: UOM values that look like encoded pack sizes
const SUSPICIOUS_UOM_RE = /^(pk|pack|box|carton|bag|bundle|roll)\s*\d+/i

// Rule 5: name substrings that indicate a component, not a profile
// Ordered longest-first so "fascia board" matches before "board" could if it were present
const COMPONENT_NAME_KEYWORDS: string[] = [
  'fascia board',
  'edge board',
  'corner trim',
  'hidden fix clip',
  'hidden fix',
  'starter strip',
  'starter trim',
  'door frame',
  'fascia',
  'edge trim',
  'end cap',
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

// Rule 10: exhaustive list from ImageSuggestedUsage
const VALID_IMAGE_USAGES: ImageSuggestedUsage[] = [
  'hero_manufacturer',
  'hero_system',
  'product_profile',
  'component_accessory',
  'installation_detail',
  'diagram',
  'colour_swatch',
]

// Rule 2: check confidence is 0–1
function checkConfidence(
  issues: ParserValidationIssue[],
  confidence: unknown,
  path: string,
  fieldLabel: string,
  isKey: boolean,
) {
  if (confidence === null || confidence === undefined) {
    const fn = isKey ? err : warn
    fn(issues, 'CONFIDENCE_MISSING', `${fieldLabel} confidence is null or missing`, path)
    return
  }
  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    err(
      issues,
      'CONFIDENCE_RANGE',
      `${fieldLabel} confidence must be 0–1, got ${String(confidence)}`,
      path,
    )
  }
}

// Rule 3: flag suspicious UOMs
function checkUOM(issues: ParserValidationIssue[], uom: string | null | undefined, path: string) {
  if (!uom) return
  if (SUSPICIOUS_UOM_RE.test(uom)) {
    err(
      issues,
      'SUSPICIOUS_UOM',
      `UOM "${uom}" looks like an encoded pack size, not a sell/quote unit. ` +
        'Use supplier_pack_qty + supplier_pack_uom instead.',
      path,
    )
  }
}

// Rule 4: detect flat-product context (board / sheet / cladding) to check height_mm usage
// Returns false for roll/wrap/tape/membrane products — those are not flat boards.
function isFlatProduct(
  name?: string | null,
  category?: string | null,
  systemName?: string | null,
): boolean {
  const text = `${name ?? ''} ${category ?? ''} ${systemName ?? ''}`.toLowerCase()
  if (/\b(roll|wrap|underlay|membrane|tape)\b/.test(text)) return false
  return /\b(board|sheet|cladding|weatherboard|panel|deck)/.test(text)
}

// Rule 4: numeric dimension fields must be numbers, not strings
function checkDimensionTypes(
  issues: ParserValidationIssue[],
  entity: ParsedDimensions,
  path: string,
) {
  const numericFields: (keyof ParsedDimensions)[] = [
    'length_mm',
    'width_mm',
    'height_mm',
    'thickness_mm',
    'depth_mm',
    'gauge_mm',
    'diameter_mm',
    'roll_m',
    'length_m',
    'weight_kg',
    'weight_g',
    'volume_ml',
    'pieces',
  ]
  for (const f of numericFields) {
    const val = entity[f]
    if (val !== null && val !== undefined && typeof val === 'string') {
      err(
        issues,
        'DIMENSION_NOT_NUMBER',
        `Field "${f}" must be a number, not a string "${val}"`,
        path,
      )
    }
  }
}

// Rule 7: deprecated fire_rating key
function checkNoFireRating(issues: ParserValidationIssue[], entity: unknown, path: string) {
  if (entity !== null && typeof entity === 'object' && 'fire_rating' in entity) {
    err(
      issues,
      'DEPRECATED_FIRE_RATING',
      'Use bal_rating instead of the deprecated fire_rating field',
      path,
    )
  }
}

// Rule 9: uncertain_fields entries should have a matching field_sources entry with is_uncertain=true
function checkUncertainFields(
  issues: ParserValidationIssue[],
  entity: { field_sources: ParsedFieldSource[]; uncertain_fields: string[] },
  path: string,
) {
  for (const uf of entity.uncertain_fields) {
    const fsEntry = entity.field_sources.find(fs => fs.field_name === uf)
    if (!fsEntry) {
      warn(
        issues,
        'UNCERTAIN_FIELD_NO_SOURCE',
        `uncertain_fields lists "${uf}" but no matching field_sources entry found`,
        path,
      )
    } else if (!fsEntry.is_uncertain) {
      warn(
        issues,
        'UNCERTAIN_FIELD_NOT_FLAGGED',
        `uncertain_fields lists "${uf}" but its field_sources entry is not marked is_uncertain=true`,
        path,
      )
    }
  }
}

// Rule 1: validate field_sources entries — confidence and source location
function checkFieldSourceLocations(
  issues: ParserValidationIssue[],
  field_sources: ParsedFieldSource[],
  path: string,
) {
  for (const fs of field_sources) {
    checkConfidence(
      issues,
      fs.confidence,
      `${path}.field_sources[${fs.field_name}]`,
      fs.field_name,
      false,
    )
    if (!fs.source_chunk_id && fs.source_page_number == null) {
      warn(
        issues,
        'EVIDENCE_NO_LOCATION',
        `Field "${fs.field_name}" has neither source_chunk_id nor source_page_number`,
        `${path}.field_sources[${fs.field_name}]`,
      )
    }
  }
}

// ----------------------------------------------------------
// Entity validators
// ----------------------------------------------------------

function validateSystem(s: ParsedSystemCandidate, issues: ParserValidationIssue[]) {
  const path = `systems[${s.temp_key}]`

  // Rule 11: required publish fields
  if (!s.name) {
    err(issues, 'REQUIRED_FIELD_MISSING', 'System missing required field: name', path)
  }
  if (!s.category) {
    warn(issues, 'REQUIRED_FIELD_MISSING', 'System missing recommended field: category', path)
  }

  // Rule 2
  checkConfidence(issues, s.extraction_confidence, path, 'extraction_confidence', true)

  // Rule 1: name must have evidence
  if (s.name && !hasFieldSource(s.field_sources, 'name')) {
    err(issues, 'EVIDENCE_MISSING_KEY', 'Key field "name" has no field_sources entry', path)
  }

  // Rule 7
  checkNoFireRating(issues, s, path)

  // Rule 9
  checkUncertainFields(issues, s, path)

  // Rule 1: field source quality
  checkFieldSourceLocations(issues, s.field_sources, path)
}

function validateSystemProfile(
  p: ParsedSystemProfileCandidate,
  issues: ParserValidationIssue[],
) {
  const path = `system_profiles[${p.temp_key}]`

  // Rule 11: profile_name preferred; name is fallback (warning only)
  if (!p.profile_name && !p.name) {
    err(
      issues,
      'REQUIRED_FIELD_MISSING',
      'System profile missing both profile_name and name',
      path,
    )
  } else if (!p.profile_name && p.name) {
    warn(
      issues,
      'PROFILE_NAME_FALLBACK',
      'profile_name is absent; name will be used as fallback. profile_name is the preferred short label.',
      path,
    )
  }

  // Rule 2
  checkConfidence(issues, p.extraction_confidence, path, 'extraction_confidence', true)

  // Rule 1: evidence for primary identifier
  const keyField = p.profile_name ? 'profile_name' : 'name'
  if (!hasFieldSource(p.field_sources, keyField)) {
    warn(
      issues,
      'EVIDENCE_MISSING_KEY',
      `Key field "${keyField}" has no field_sources entry`,
      path,
    )
  }

  // Rule 3
  checkUOM(issues, p.uom, `${path}.uom`)

  // Rule 4: dimension types
  checkDimensionTypes(issues, p, path)

  // Rule 4: height_mm on flat products
  if (p.height_mm != null) {
    const systemName = p.system_match?.system_name
    if (isFlatProduct(p.name ?? p.profile_name, null, systemName)) {
      warn(
        issues,
        'HEIGHT_MM_ON_FLAT_PRODUCT',
        'height_mm is set on what appears to be a flat product. ' +
          'Use thickness_mm for the thin third dimension unless the source explicitly labels this axis as height.',
        path,
      )
    }
  }

  // Rule 5: classification — profile name should not match component keywords
  const nameLower = (p.profile_name ?? p.name ?? '').toLowerCase()
  for (const kw of COMPONENT_NAME_KEYWORDS) {
    if (nameLower.includes(kw)) {
      warn(
        issues,
        'POSSIBLE_COMPONENT_AS_PROFILE',
        `Profile name contains component keyword "${kw}". Should this be a staged_component instead?`,
        path,
      )
      break
    }
  }

  // Rule 7: fire_rating + BAL must have evidence
  checkNoFireRating(issues, p, path)
  if (p.bal_rating && !hasFieldSource(p.field_sources, 'bal_rating')) {
    warn(
      issues,
      'BAL_NO_EVIDENCE',
      `bal_rating "${p.bal_rating}" has no field_sources entry`,
      path,
    )
  }

  // Rule 9
  checkUncertainFields(issues, p, path)

  // Rule 1: field source quality
  checkFieldSourceLocations(issues, p.field_sources, path)
}

function validateComponent(c: ParsedComponentCandidate, issues: ParserValidationIssue[]) {
  const path = `components[${c.temp_key}]`

  // Rule 11: required publish fields
  if (!c.name) {
    err(issues, 'REQUIRED_FIELD_MISSING', 'Component missing required field: name', path)
  }
  if (!c.uom) {
    warn(issues, 'REQUIRED_FIELD_MISSING', 'Component missing recommended field: uom', path)
  }

  // Rule 2
  checkConfidence(issues, c.extraction_confidence, path, 'extraction_confidence', true)

  // Rule 1: name must have evidence
  if (c.name && !hasFieldSource(c.field_sources, 'name')) {
    err(issues, 'EVIDENCE_MISSING_KEY', 'Key field "name" has no field_sources entry', path)
  }

  // Rule 3
  checkUOM(issues, c.uom, `${path}.uom`)

  // Rule 4: dimension types
  checkDimensionTypes(issues, c, path)

  // Rule 4: height_mm on flat products
  if (c.height_mm != null) {
    if (isFlatProduct(c.name, c.category, null)) {
      warn(
        issues,
        'HEIGHT_MM_ON_FLAT_PRODUCT',
        'height_mm is set on what appears to be a flat product. ' +
          'Use thickness_mm for the thin third dimension unless the source explicitly labels this axis as height.',
        path,
      )
    }
  }

  // Rule 7
  checkNoFireRating(issues, c, path)

  // Contract rule (§15.8): supplier_pack_qty set but supplier_pack_uom absent
  if (c.supplier_pack_qty != null && c.supplier_pack_qty > 0 && !c.supplier_pack_uom) {
    warn(
      issues,
      'PACK_QTY_NO_UOM',
      `supplier_pack_qty=${c.supplier_pack_qty} but supplier_pack_uom is null — ` +
        'add supplier_pack_uom or describe the unit in supplier_pack_note',
      path,
    )
  }

  // Rule 9
  checkUncertainFields(issues, c, path)

  // Rule 1: field source quality
  checkFieldSourceLocations(issues, c.field_sources, path)
}

function validateSystemComponent(
  sc: ParsedSystemComponentCandidate,
  issues: ParserValidationIssue[],
) {
  const path = `system_components[${sc.temp_key}]`

  // Rule 6: role must be one of the three DB-enforced values
  const validRoles = ['required', 'optional', 'accessory'] as const
  if (!(validRoles as readonly string[]).includes(sc.role)) {
    err(
      issues,
      'INVALID_ROLE',
      `Role "${sc.role}" is not valid. Must be one of: required, optional, accessory`,
      path,
    )
  }

  // Rule 11: match hints must be resolvable
  if (!sc.staged_system_match.system_name && !sc.staged_system_match.product_code) {
    err(
      issues,
      'MATCH_HINT_EMPTY',
      'staged_system_match has neither system_name nor product_code — insertion layer cannot resolve this link',
      path,
    )
  }
  if (!sc.component_match.name) {
    err(issues, 'MATCH_HINT_EMPTY', 'component_match.name is required', path)
  }

  // Rule 2
  checkConfidence(issues, sc.extraction_confidence, path, 'extraction_confidence', true)
}

function validateSystemColour(c: ParsedSystemColourCandidate, issues: ParserValidationIssue[]) {
  const path = `system_colours[${c.temp_key}]`

  // Rule 11: colour_name required
  if (!c.colour_name) {
    err(issues, 'REQUIRED_FIELD_MISSING', 'Colour missing required field: colour_name', path)
  }

  // Rule 2
  checkConfidence(issues, c.extraction_confidence, path, 'extraction_confidence', true)

  // Rule 8: warn if neither sku nor sku_suffix is present
  if (!c.sku && !c.sku_suffix) {
    warn(
      issues,
      'COLOUR_NO_SKU',
      'Colour has neither sku nor sku_suffix. ' +
        'If a SKU suffix is visible in source evidence, add it as sku_suffix.',
      path,
    )
  }

  // Rule 7
  checkNoFireRating(issues, c, path)
}

function validateImage(img: ParsedImageCandidate, idx: number, issues: ParserValidationIssue[]) {
  const path = `media.images[${idx}]`

  // Rule 10: suggested_usage must be a known literal
  if (!VALID_IMAGE_USAGES.includes(img.suggested_usage)) {
    err(
      issues,
      'INVALID_IMAGE_USAGE',
      `suggested_usage "${img.suggested_usage}" is not a valid ImageSuggestedUsage value`,
      path,
    )
  }

  // Rule 10: confidence 0–1
  checkConfidence(issues, img.confidence, path, 'confidence', false)
}

// ----------------------------------------------------------
// Top-level entry point
// ----------------------------------------------------------

/**
 * Validates a ParserOutput object against the parser contract rules.
 * Dry-run only — no Supabase writes, no DB access, no AI calls.
 */
export function validateParserOutput(output: ParserOutput): ParserValidationResult {
  const issues: ParserValidationIssue[] = []

  // Rule 7: deprecated fire_rating at top level
  checkNoFireRating(issues, output, 'root')

  for (const s of output.systems) validateSystem(s, issues)
  for (const p of output.system_profiles) validateSystemProfile(p, issues)
  for (const c of output.components) validateComponent(c, issues)
  for (const sc of output.system_components) validateSystemComponent(sc, issues)
  for (const c of output.system_colours) validateSystemColour(c, issues)
  output.media?.images.forEach((img, i) => validateImage(img, i, issues))

  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')

  return { ok: errors.length === 0, errors, warnings }
}
