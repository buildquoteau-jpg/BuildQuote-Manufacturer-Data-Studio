// Server-only data helpers for the admin parser inspection view.
// Uses anon/session Supabase client only. No service role key. No writes.
//
// Reads staged parser data for a given source document:
//   - staged_systems, staged_system_profiles, staged_system_colours
//   - staged_components, staged_system_components
//   - field_verifications, parser_field_evidence
//
// RLS note: migrations 006 + 016 grant open SELECT to anon and authenticated
// on all staged_* tables, field_verifications, and parser_field_evidence.
//
// Redaction: storage_bucket, storage_key, public_url, storage_provider are
// intentionally excluded from source_documents queries.

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import type { AdminWorkspaceManufacturer } from './manufacturer-workspace'

// ============================================================
// Types
// ============================================================

export type ParserExtractionRun = {
  id: string
  runType: string
  status: string
  toolName: string | null
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
}

export type ParserStagedSystem = {
  id: string
  name: string
  productCode: string | null
  category: string | null
  subcategory: string | null
  verificationStatus: string
  extractionConfidence: number
}

export type ParserStagedProfile = {
  id: string
  stagedSystemId: string
  name: string | null
  profileName: string | null
  productCode: string | null
  dimensions: string | null
  uom: string | null
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  packFormat: string | null
  verificationStatus: string
  extractionConfidence: number
}

export type ParserStagedComponent = {
  id: string
  name: string
  sku: string | null
  category: string | null
  uom: string | null
  packFormat: string | null
  verificationStatus: string
  extractionConfidence: number
}

export type ParserStagedColour = {
  id: string
  stagedSystemId: string
  colourName: string
  sku: string | null
  skuSuffix: string | null
  isStocked: boolean
  verificationStatus: string
}

export type ParserStagedLink = {
  id: string
  stagedSystemId: string
  stagedComponentId: string
  role: string
  notes: string | null
}

export type ParserFieldVerification = {
  id: string
  entityType: string
  entityId: string
  fieldName: string
  extractedValue: string | null
  status: string
  sourcePageNumber: number | null
  sourceChunkId: string | null
}

export type ParserFieldEvidence = {
  id: string
  entityType: string
  entityId: string
  fieldName: string
  extractedValue: string | null
  confidence: number | null
  isUncertain: boolean
  parserNote: string | null
  sourcePageNumber: number | null
}

export type ParserInspectionCounts = {
  stagedSystems: number
  stagedProfiles: number
  stagedComponents: number
  stagedColours: number
  stagedLinks: number
  fieldVerifications: number
  parserFieldEvidence: number
}

// ============================================================
// Result types
// ============================================================

export type ParserInspectionResult =
  | {
      ok: true
      manufacturer: AdminWorkspaceManufacturer
      documentId: string
      documentName: string
      documentStatus: string
      parseRun: ParserExtractionRun | null
      counts: ParserInspectionCounts
      systems: ParserStagedSystem[]
      profiles: ParserStagedProfile[]
      components: ParserStagedComponent[]
      colours: ParserStagedColour[]
      links: ParserStagedLink[]
      fieldVerifications: ParserFieldVerification[]
      parserFieldEvidence: ParserFieldEvidence[]
      orphanLinkCount: number
    }
  | { ok: false; error: string; forbidden?: boolean }

// ============================================================
// Internal helpers
// ============================================================

function makeClient() {
  try {
    return { ok: true as const, supabase: createStudioServerClient() }
  } catch {
    return { ok: false as const, error: 'Supabase client not configured — check env vars.' }
  }
}

async function assertAdminOrReviewer(): Promise<
  { allowed: true } | { allowed: false; error: string }
> {
  const session = await getStudioSession()
  if (
    session.globalRole !== 'buildquote_admin' &&
    session.globalRole !== 'buildquote_reviewer'
  ) {
    return {
      allowed: false,
      error: 'Access denied. This data is only available to BuildQuote admin and reviewers.',
    }
  }
  return { allowed: true }
}

// ============================================================
// getAdminParserInspection
// Reads all staged parser data for a single source document.
// Scoped by source_document_id + manufacturer_id.
// ============================================================

const ROW_CAP = 150

export async function getAdminParserInspection(
  manufacturerId: string,
  documentId: string,
): Promise<ParserInspectionResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  // Manufacturer
  const { data: mfrData, error: mfrErr } = await c.supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, status, description, website_url')
    .eq('id', manufacturerId)
    .single()

  if (mfrErr || !mfrData) {
    return { ok: false, error: mfrErr?.code === 'PGRST116' ? 'Manufacturer not found.' : (mfrErr?.message ?? 'Unknown error.') }
  }

  type MfrRow = { id: string; name: string; slug: string; status: string; description: string | null; website_url: string | null }
  const m = mfrData as MfrRow
  const manufacturer: AdminWorkspaceManufacturer = {
    id: m.id,
    name: m.name,
    slug: m.slug,
    status: m.status,
    description: m.description,
    websiteUrl: m.website_url,
  }

  // Document (no storage fields)
  const { data: docData, error: docErr } = await c.supabase
    .from('source_documents')
    .select('id, document_name, status')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (docErr || !docData) {
    return { ok: false, error: docErr?.code === 'PGRST116' ? 'Document not found.' : (docErr?.message ?? 'Unknown error.') }
  }
  type DocRow = { id: string; document_name: string; status: string }
  const doc = docData as DocRow

  // Latest parse_systems extraction run
  const { data: runData } = await c.supabase
    .from('extraction_runs')
    .select('id, run_type, status, tool_name, started_at, completed_at, error_message')
    .eq('source_document_id', documentId)
    .eq('run_type', 'parse_systems')
    .order('created_at', { ascending: false })
    .limit(1)

  type RunRow = { id: string; run_type: string; status: string; tool_name: string | null; started_at: string | null; completed_at: string | null; error_message: string | null }
  const runRows = (runData ?? []) as RunRow[]
  const parseRun: ParserExtractionRun | null = runRows.length > 0 ? {
    id: runRows[0].id,
    runType: runRows[0].run_type,
    status: runRows[0].status,
    toolName: runRows[0].tool_name,
    startedAt: runRows[0].started_at,
    completedAt: runRows[0].completed_at,
    errorMessage: runRows[0].error_message,
  } : null

  // Staged systems
  const { data: sysData } = await c.supabase
    .from('staged_systems')
    .select('id, name, product_code, category, subcategory, verification_status, extraction_confidence')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .order('sort_order')
    .limit(ROW_CAP)

  type SysRow = { id: string; name: string; product_code: string | null; category: string | null; subcategory: string | null; verification_status: string; extraction_confidence: number }
  const systemRows = (sysData ?? []) as SysRow[]
  const systems: ParserStagedSystem[] = systemRows.map((s) => ({
    id: s.id,
    name: s.name,
    productCode: s.product_code,
    category: s.category,
    subcategory: s.subcategory,
    verificationStatus: s.verification_status,
    extractionConfidence: s.extraction_confidence,
  }))
  const systemIds = systems.map((s) => s.id)

  // Staged components
  const { data: compData } = await c.supabase
    .from('staged_components')
    .select('id, name, sku, category, uom, pack_format, verification_status, extraction_confidence')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .order('sort_order')
    .limit(ROW_CAP)

  type CompRow = { id: string; name: string; sku: string | null; category: string | null; uom: string | null; pack_format: string | null; verification_status: string; extraction_confidence: number }
  const compRows = (compData ?? []) as CompRow[]
  const components: ParserStagedComponent[] = compRows.map((c) => ({
    id: c.id,
    name: c.name,
    sku: c.sku,
    category: c.category,
    uom: c.uom,
    packFormat: c.pack_format,
    verificationStatus: c.verification_status,
    extractionConfidence: c.extraction_confidence,
  }))
  const componentIds = components.map((c) => c.id)

  // Parallel fetches for child tables (all need systemIds)
  let profiles: ParserStagedProfile[] = []
  let colours: ParserStagedColour[] = []
  let links: ParserStagedLink[] = []

  if (systemIds.length > 0) {
    const [profData, colData, linkData] = await Promise.all([
      c.supabase
        .from('staged_system_profiles')
        .select('id, staged_system_id, name, profile_name, product_code, dimensions, uom, length_mm, width_mm, thickness_mm, pack_format, verification_status, extraction_confidence')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
      c.supabase
        .from('staged_system_colours')
        .select('id, staged_system_id, colour_name, sku, sku_suffix, is_stocked, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
      c.supabase
        .from('staged_system_components')
        .select('id, staged_system_id, staged_component_id, role, notes')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
    ])

    type ProfRow = { id: string; staged_system_id: string; name: string | null; profile_name: string | null; product_code: string | null; dimensions: string | null; uom: string | null; length_mm: number | null; width_mm: number | null; thickness_mm: number | null; pack_format: string | null; verification_status: string; extraction_confidence: number }
    profiles = ((profData.data ?? []) as ProfRow[]).map((p) => ({
      id: p.id,
      stagedSystemId: p.staged_system_id,
      name: p.name,
      profileName: p.profile_name,
      productCode: p.product_code,
      dimensions: p.dimensions,
      uom: p.uom,
      lengthMm: p.length_mm,
      widthMm: p.width_mm,
      thicknessMm: p.thickness_mm,
      packFormat: p.pack_format,
      verificationStatus: p.verification_status,
      extractionConfidence: p.extraction_confidence,
    }))

    type ColRow = { id: string; staged_system_id: string; colour_name: string; sku: string | null; sku_suffix: string | null; is_stocked: boolean; verification_status: string }
    colours = ((colData.data ?? []) as ColRow[]).map((c) => ({
      id: c.id,
      stagedSystemId: c.staged_system_id,
      colourName: c.colour_name,
      sku: c.sku,
      skuSuffix: c.sku_suffix,
      isStocked: c.is_stocked,
      verificationStatus: c.verification_status,
    }))

    type LinkRow = { id: string; staged_system_id: string; staged_component_id: string; role: string; notes: string | null }
    const allLinks = ((linkData.data ?? []) as LinkRow[]).map((l) => ({
      id: l.id,
      stagedSystemId: l.staged_system_id,
      stagedComponentId: l.staged_component_id,
      role: l.role,
      notes: l.notes,
    }))
    links = allLinks
  }

  // Orphan check: links where staged_component_id is not in our component set
  const componentIdSet = new Set(componentIds)
  const orphanLinkCount = links.filter((l) => !componentIdSet.has(l.stagedComponentId)).length

  // Field verifications (scoped by source_document_id — covers all entity types)
  const { data: fvData } = await c.supabase
    .from('field_verifications')
    .select('id, entity_type, entity_id, field_name, extracted_value, status, source_page_number, source_chunk_id')
    .eq('source_document_id', documentId)
    .order('entity_type')
    .limit(ROW_CAP)

  type FvRow = { id: string; entity_type: string; entity_id: string; field_name: string; extracted_value: string | null; status: string; source_page_number: number | null; source_chunk_id: string | null }
  const fieldVerifications: ParserFieldVerification[] = ((fvData ?? []) as FvRow[]).map((f) => ({
    id: f.id,
    entityType: f.entity_type,
    entityId: f.entity_id,
    fieldName: f.field_name,
    extractedValue: f.extracted_value,
    status: f.status,
    sourcePageNumber: f.source_page_number,
    sourceChunkId: f.source_chunk_id,
  }))

  // Parser field evidence (scoped by extraction_run_id if available)
  let parserFieldEvidence: ParserFieldEvidence[] = []
  if (parseRun) {
    const { data: pfeData } = await c.supabase
      .from('parser_field_evidence')
      .select('id, entity_type, entity_id, field_name, extracted_value, confidence, is_uncertain, parser_note, source_page_number')
      .eq('extraction_run_id', parseRun.id)
      .order('entity_type')
      .limit(ROW_CAP)

    type PfeRow = { id: string; entity_type: string; entity_id: string; field_name: string; extracted_value: string | null; confidence: number | null; is_uncertain: boolean; parser_note: string | null; source_page_number: number | null }
    parserFieldEvidence = ((pfeData ?? []) as PfeRow[]).map((p) => ({
      id: p.id,
      entityType: p.entity_type,
      entityId: p.entity_id,
      fieldName: p.field_name,
      extractedValue: p.extracted_value,
      confidence: p.confidence,
      isUncertain: p.is_uncertain,
      parserNote: p.parser_note,
      sourcePageNumber: p.source_page_number,
    }))
  }

  // Exact counts (head queries) for summary
  const [sysCnt, profCnt, compCnt, colCnt, linkCnt, fvCnt, pfeCnt] = await Promise.all([
    c.supabase.from('staged_systems').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId).eq('manufacturer_id', manufacturerId),
    systemIds.length > 0
      ? c.supabase.from('staged_system_profiles').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0, error: null }),
    c.supabase.from('staged_components').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId).eq('manufacturer_id', manufacturerId),
    systemIds.length > 0
      ? c.supabase.from('staged_system_colours').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0, error: null }),
    systemIds.length > 0
      ? c.supabase.from('staged_system_components').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0, error: null }),
    c.supabase.from('field_verifications').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId),
    parseRun
      ? c.supabase.from('parser_field_evidence').select('*', { count: 'exact', head: true }).eq('extraction_run_id', parseRun.id)
      : Promise.resolve({ count: 0, error: null }),
  ])

  const counts: ParserInspectionCounts = {
    stagedSystems: sysCnt.count ?? 0,
    stagedProfiles: profCnt.count ?? 0,
    stagedComponents: compCnt.count ?? 0,
    stagedColours: colCnt.count ?? 0,
    stagedLinks: linkCnt.count ?? 0,
    fieldVerifications: fvCnt.count ?? 0,
    parserFieldEvidence: pfeCnt.count ?? 0,
  }

  return {
    ok: true,
    manufacturer,
    documentId: doc.id,
    documentName: doc.document_name,
    documentStatus: doc.status,
    parseRun,
    counts,
    systems,
    profiles,
    components,
    colours,
    links,
    fieldVerifications,
    parserFieldEvidence,
    orphanLinkCount,
  }
}
