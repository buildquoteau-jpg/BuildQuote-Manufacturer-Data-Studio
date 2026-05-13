// Parser output types for BuildQuote Data Studio.
//
// These types model the JSON the AI parser returns — NOT database rows.
// The insertion layer maps parser output to staged_* rows, field_verifications,
// and parser_field_evidence. Nothing in this file touches the database.

// ----------------------------------------------------------
// Primitives and shared literals
// ----------------------------------------------------------

/** Extraction confidence: 0.0 (no confidence) → 1.0 (certain). */
export type Confidence = number

/**
 * Temporary entity key used before DB UUIDs exist.
 * Convention: "system_0", "profile_0", "component_0", "colour_0", "link_0"
 * The insertion layer replaces these with real UUIDs after DB insert.
 */
export type TempKey = string

/**
 * DB-enforced role values for staged_system_components.role.
 * Do not use descriptive role strings (clip, trim, fastener, sealant, etc.).
 * Use component.category for item type, and link notes for relationship detail.
 */
export type SystemComponentRole = 'required' | 'optional' | 'accessory'

/**
 * Suggested usage for parsed image/media candidates.
 * Parser suggestions only — no actual files are stored or fetched.
 */
export type ImageSuggestedUsage =
  | 'hero_manufacturer'
  | 'hero_system'
  | 'product_profile'
  | 'component_accessory'
  | 'installation_detail'
  | 'diagram'
  | 'colour_swatch'

// ----------------------------------------------------------
// Match hints
// The parser cannot know DB UUIDs at parse time. It uses name/code hints
// instead. The insertion layer resolves these to real staged row UUIDs
// after inserting parent entities in dependency order.
// ----------------------------------------------------------

export interface SystemMatchHint {
  system_name: string | null
  product_code: string | null
}

export interface ComponentMatchHint {
  sku: string | null
  name: string
}

// ----------------------------------------------------------
// Field-level evidence
// One entry per extracted non-null field in field_sources[].
// Used by insertion layer to write both field_verifications and
// parser_field_evidence rows.
// ----------------------------------------------------------

export interface ParsedFieldSource {
  field_name: string
  /** Always stored as string regardless of original type. */
  extracted_value: string | null
  source_page_number: number | null
  source_chunk_id: string | null
  confidence: Confidence
  is_uncertain?: boolean
  parser_note?: string | null
}

// ----------------------------------------------------------
// Dimension fields
// Shared by system profiles and components.
//
// Classification rule for flat products (boards, sheets, cladding, panels):
//   5400 x 138 x 29 mm → length_mm=5400, width_mm=138, thickness_mm=29
//   height_mm stays null unless the manufacturer clearly labels the axis as
//   height (e.g. door height, explicitly labelled panel height).
//
// Always preserve the raw source text in dimensions alongside parsed fields.
// ----------------------------------------------------------

export interface ParsedDimensions {
  /** Raw dimension string from source. Always preserve alongside numeric fields. */
  dimensions?: string | null
  length_mm?: number | null
  /** Metres — use when source states length in metres and schema expects length_m. */
  length_m?: number | null
  width_mm?: number | null
  /** Use only when manufacturer clearly means height (doors, frames, labelled panels). */
  height_mm?: number | null
  /** Thin third axis for flat products: boards, sheets, panels, cladding. */
  thickness_mm?: number | null
  depth_mm?: number | null
  gauge_mm?: number | null
  diameter_mm?: number | null
  roll_m?: number | null
  weight_kg?: number | null
  weight_g?: number | null
  volume_ml?: number | null
  /**
   * True product piece count — the count of the item itself.
   * Not the supplier pack quantity.
   */
  pieces?: number | null
}

// ----------------------------------------------------------
// Pack and UOM fields
//
// uom = sell/request unit: how a builder or supplier quotes the item.
//   e.g. "ea", "piece", "lm", "m2", "sheet", "roll", "box", "carton", "kg"
//   Must NOT be set to a pack size or full-pack quantity.
//
// supplier_pack_qty = manufacturer full-pack quantity.
//   e.g. 120 clips per box, 10 boards per bundle.
//   Must NEVER become the builder/customer RFQ quantity.
//   RFQ quantity is always user-supplied at quoting time.
// ----------------------------------------------------------

export interface ParsedPackInfo {
  /**
   * Sell/request unit used for quoting.
   * e.g. "ea", "lm", "m2", "roll", "sheet", "box"
   * Must not be set to a pack size.
   */
  uom?: string | null
  /** Physical packaging type: "Box", "Bundle", "Bag", "Roll", "Tube", "Carton" */
  pack_format?: string | null
  /**
   * Units per manufacturer/supplier full pack.
   * This is a logistics value — not the customer order quantity.
   */
  supplier_pack_qty?: number | null
  /** Name of the unit inside the pack: "clips", "screws", "boards", "pieces" */
  supplier_pack_uom?: string | null
  /** Free-text note about pack constraint or sell minimum. */
  supplier_pack_note?: string | null
}

// ----------------------------------------------------------
// Entity-level parser notes
// Applied to a whole extracted entity record (not a single field).
// Stored in staged_*.parser_notes (jsonb) on the staged row.
// This is a reviewer convenience snapshot — overwritten on each run.
// Per-field notes and uncertainty are in ParsedFieldSource and parser_field_evidence.
// ----------------------------------------------------------

export interface ParserEntityNotes {
  parser_notes: string[]
  uncertain_fields: string[]
  warnings?: string[]
  ignored_content_notes?: string[]
}

// ----------------------------------------------------------
// Image / media candidates
// Parser suggestions only. No actual image files are stored, fetched, or uploaded.
// image_url is only set when a URL is explicitly present in the source document.
// ----------------------------------------------------------

export interface ParsedImageCandidate {
  source_document_id?: string | null
  source_page_number?: number | null
  source_chunk_id?: string | null
  /** Only set if a URL is explicitly stated in the source. Never inferred or guessed. */
  image_url?: string | null
  caption?: string | null
  alt_text?: string | null
  suggested_usage: ImageSuggestedUsage
  /** temp_key of the entity this image relates to. */
  entity_temp_key?: string | null
  confidence: Confidence
  parser_note?: string | null
}

export interface ParsedMediaCandidates {
  images: ParsedImageCandidate[]
}

// ----------------------------------------------------------
// Parsed system candidate
// Represents a broad product system card (e.g. "Avenue Decking", "Linea Weatherboard").
// Not a single size/colour variant — those are system profiles.
// ----------------------------------------------------------

export interface ParsedSystemCandidate extends ParserEntityNotes {
  temp_key: TempKey
  source_document_id: string | null
  source_chunk_id: string | null
  source_page_number: number | null
  name: string
  product_code?: string | null
  slug?: string | null
  category?: string | null
  subcategory?: string | null
  description?: string | null
  /**
   * System-wide BAL (Bushfire Attack Level) rating.
   * Only set when the source clearly states BAL applies to the whole system.
   * Profile-specific BAL goes on the profile record, not here.
   */
  bal_rating?: string | null
  acoustic_rating?: string | null
  moisture_resistant?: boolean | null
  structural_grade?: string | null
  double_sided?: boolean | null
  sheet_format?: string | null
  install_guide_url?: string | null
  tech_data_url?: string | null
  notes?: string | null
  sort_order?: number | null
  extraction_confidence: Confidence
  field_sources: ParsedFieldSource[]
}

// ----------------------------------------------------------
// Parsed system profile candidate
// The main sellable dimensional variants/options of a system.
// Not accessories, fixings, trims, or components — see ParsedComponentCandidate.
//
// profile_name is the preferred short label (e.g. "Avenue 5400", "Linea 180").
// name is the full descriptive name (e.g. "Avenue Grooved Board 5400mm").
// The insertion layer decides how to map each to staged_system_profiles columns.
// ----------------------------------------------------------

export interface ParsedSystemProfileCandidate
  extends ParsedDimensions,
    ParsedPackInfo,
    ParserEntityNotes {
  temp_key: TempKey
  system_match: SystemMatchHint
  /**
   * Full descriptive profile name as written in source.
   * e.g. "Avenue Grooved Board 5400mm", "Linea 180 Weatherboard 3600mm"
   * May be used as a fallback if profile_name is absent.
   */
  name?: string | null
  /**
   * Short profile/variant label. Preferred primary identifier.
   * e.g. "Avenue 5400", "Linea 180", "30m Roll", "R2.5 90mm"
   */
  profile_name?: string | null
  product_code?: string | null
  /**
   * Profile-specific BAL rating.
   * Set only when the source states a BAL rating for this specific profile variant.
   */
  bal_rating?: string | null
  sort_order?: number | null
  source_page_number?: number | null
  source_chunk_id?: string | null
  extraction_confidence: Confidence
  field_sources: ParsedFieldSource[]
}

// ----------------------------------------------------------
// Parsed component candidate
// Supporting parts, accessories, fixings, trims, and similar items.
//
// Always components (never profiles):
//   edge boards, fascia boards, bullnose, trims, corner trims, J-trims,
//   starter strips, end caps, clips, hidden-fix clips, screws, bolts,
//   fixings, fasteners, adhesives, sealants, tapes, joint compounds,
//   flashings, brackets, packers, shims, spacers,
//   door frames, jambs, hinges, thresholds, seals,
//   cleaning and maintenance products, installation accessories.
// ----------------------------------------------------------

export interface ParsedComponentCandidate
  extends ParsedDimensions,
    ParsedPackInfo,
    ParserEntityNotes {
  temp_key: TempKey
  source_document_id?: string | null
  source_chunk_id?: string | null
  source_page_number?: number | null
  sku?: string | null
  name: string
  description?: string | null
  category?: string | null
  /** Staging-only enrichment — may not map to production components schema. */
  material?: string | null
  finish?: string | null
  colour?: string | null
  profile?: string | null
  texture?: string | null
  coverage_m2?: number | null
  sort_order?: number | null
  extraction_confidence: Confidence
  field_sources: ParsedFieldSource[]
}

// ----------------------------------------------------------
// Parsed system-component relationship candidate
// Links a component to a system. Role must use DB-enforced values only.
// ----------------------------------------------------------

export interface ParsedSystemComponentCandidate {
  temp_key: TempKey
  staged_system_match: SystemMatchHint
  component_match: ComponentMatchHint
  role: SystemComponentRole
  notes?: string | null
  sort_order?: number | null
  extraction_confidence: Confidence
  source_page_number?: number | null
  source_chunk_id?: string | null
}

// ----------------------------------------------------------
// Parsed system colour candidate
// Colour, finish, and texture options for a system.
// Colours link at the system level; profile-level colour joins are a future concern.
//
// sku       = fully distinct SKU for this colour (overrides base SKU entirely)
// sku_suffix = suffix appended to base SKU (e.g. base "NTW-AVE" + "-ANT" → "NTW-AVE-ANT")
// ----------------------------------------------------------

export interface ParsedSystemColourCandidate {
  temp_key: TempKey
  system_match: SystemMatchHint
  colour_name: string
  sku?: string | null
  sku_suffix?: string | null
  image_url?: string | null
  is_stocked?: boolean | null
  sort_order?: number | null
  source_page_number?: number | null
  source_chunk_id?: string | null
  extraction_confidence: Confidence
}

// ----------------------------------------------------------
// Top-level parser output
// The complete JSON shape the AI parser returns for one document.
// The insertion layer wraps this with ParserRunContext before processing.
// ----------------------------------------------------------

export interface ParserOutput {
  /** The source document this extraction was run against. */
  source_document_id: string | null
  systems: ParsedSystemCandidate[]
  system_profiles: ParsedSystemProfileCandidate[]
  components: ParsedComponentCandidate[]
  system_components: ParsedSystemComponentCandidate[]
  system_colours: ParsedSystemColourCandidate[]
  media?: ParsedMediaCandidates
  /** Top-level parser warnings (not tied to a specific entity). */
  warnings: string[]
  /** Notes on content the parser skipped or could not extract. */
  ignored_content_notes: string[]
}

/**
 * Context the insertion layer adds when processing parser output.
 * The AI parser does not produce this — the insertion layer assembles it
 * from the active extraction_run and source_document records.
 */
export interface ParserRunContext {
  extraction_run_id: string
  source_document_id: string
  manufacturer_id: string
  parsed_at: string
}
