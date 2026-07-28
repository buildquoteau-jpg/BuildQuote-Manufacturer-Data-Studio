// Server-only data helpers for the admin parser inspection view.
// Uses anon/session Supabase client only. No service role key. No writes.
//
// Reads staged parser data for a given source document:
//   - staged_systems, staged_system_profiles, staged_system_colours
//   - staged_components, staged_system_components
//   - field_verifications, parser_field_evidence
//   - extraction_runs (parse_systems run only)
//
// RLS note: migrations 006 + 016 grant open SELECT to anon and authenticated
// on all staged_* tables, field_verifications, and parser_field_evidence.
//
// Redaction: storage_bucket, storage_key, public_url, storage_provider are
// intentionally excluded from source_documents queries.

import { getStudioSession } from '@/lib/studio-auth/session'
import type { AdminWorkspaceManufacturer } from './manufacturer-workspace'
import { makeStudioClient } from '@/lib/supabase/helpers'

// ============================================================
// Types
// ============================================================

export type ParserDocumentMeta = {
  id: string
  documentName: string
  documentType: string | null
  documentDate: string | null
  status: string
  uploadedAt: string
}

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
  description: string | null
  notes: string | null
  reviewerNotes: string | null
  balRating: string | null
  acousticRating: string | null
  moistureResistant: boolean
  doubleSided: boolean
  verificationStatus: string
  extractionConfidence: number
  // computed after fetch
  profileCount: number
  colourCount: number
  linkCount: number
}

export type ParserStagedProfile = {
  id: string
  stagedSystemId: string
  name: string | null
  profileName: string | null
  productCode: string | null
  dimensions: string | null
  uom: string | null
  // dimensions
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  thicknessMm: number | null
  depthMm: number | null
  diameterMm: number | null
  rollM: number | null
  // pack
  packFormat: string | null
  supplierPackQty: number | null
  supplierPackUom: string | null
  supplierPackNote: string | null
  verificationStatus: string
}

export type ParserStagedComponent = {
  id: string
  name: string
  sku: string | null
  category: string | null
  description: string | null
  uom: string | null
  // material properties
  material: string | null
  finish: string | null
  colour: string | null
  texture: string | null
  // dimensions
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  thicknessMm: number | null
  depthMm: number | null
  diameterMm: number | null
  rollM: number | null
  // pack
  packFormat: string | null
  supplierPackQty: number | null
  supplierPackUom: string | null
  supplierPackNote: string | null
  reviewerNotes: string | null
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
  reviewerNotes: string | null
  verificationStatus: string
}

export type ParserStagedLink = {
  id: string
  stagedSystemId: string
  stagedComponentId: string
  role: string
  notes: string | null
  verificationStatus: string
}

export type ParserFieldVerification = {
  id: string
  entityType: string
  entityId: string
  fieldName: string
  extractedValue: string | null
  status: string
  sourcePageNumber: number | null
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

export type EvidenceCoverage = {
  entitiesWithEvidence: number
  entitiesTotal: number
  pct: number
  byEntityType: Record<string, number>
}

// ============================================================
// Result type
// ============================================================

export type ParserInspectionResult =
  | {
      ok: true
      manufacturer: AdminWorkspaceManufacturer
      document: ParserDocumentMeta
      parseRun: ParserExtractionRun | null
      counts: ParserInspectionCounts
      evidenceCoverage: EvidenceCoverage
      systems: ParserStagedSystem[]
      profiles: ParserStagedProfile[]
      components: ParserStagedComponent[]
      colours: ParserStagedColour[]
      links: ParserStagedLink[]
      fieldVerifications: ParserFieldVerification[]
      parserFieldEvidence: ParserFieldEvidence[]
      orphanLinkCount: number
      systemIdsWithEvidence: Set<string>
      componentIdsWithEvidence: Set<string>
    }
  | { ok: false; error: string; forbidden?: boolean }

// ============================================================
// Internal helpers
// ============================================================

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

const ROW_CAP = 200

export async function getAdminParserInspection(
  manufacturerId: string,
  documentId: string,
): Promise<ParserInspectionResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeStudioClient()
  if (!c.ok) return { ok: false, error: c.error }

  // ── Manufacturer ──────────────────────────────────────────────────────────
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
    id: m.id, name: m.name, slug: m.slug, status: m.status,
    description: m.description, websiteUrl: m.website_url,
  }

  // ── Document (no storage fields) ──────────────────────────────────────────
  const { data: docData, error: docErr } = await c.supabase
    .from('source_documents')
    .select('id, document_name, document_type, document_date, status, uploaded_at')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (docErr || !docData) {
    return { ok: false, error: docErr?.code === 'PGRST116' ? 'Document not found.' : (docErr?.message ?? 'Unknown error.') }
  }
  type DocRow = { id: string; document_name: string; document_type: string | null; document_date: string | null; status: string; uploaded_at: string }
  const d = docData as DocRow
  const document: ParserDocumentMeta = {
    id: d.id, documentName: d.document_name, documentType: d.document_type,
    documentDate: d.document_date, status: d.status, uploadedAt: d.uploaded_at,
  }

  // ── Latest parse_systems extraction run ───────────────────────────────────
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
    id: runRows[0].id, runType: runRows[0].run_type, status: runRows[0].status,
    toolName: runRows[0].tool_name, startedAt: runRows[0].started_at,
    completedAt: runRows[0].completed_at, errorMessage: runRows[0].error_message,
  } : null

  // ── Staged systems (full column set) ──────────────────────────────────────
  const { data: sysData } = await c.supabase
    .from('staged_systems')
    .select('id, name, product_code, category, subcategory, description, notes, reviewer_notes, bal_rating, acoustic_rating, moisture_resistant, double_sided, verification_status, extraction_confidence')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .order('sort_order')
    .limit(ROW_CAP)

  type SysRow = {
    id: string; name: string; product_code: string | null; category: string | null
    subcategory: string | null; description: string | null; notes: string | null
    reviewer_notes: string | null; bal_rating: string | null; acoustic_rating: string | null
    moisture_resistant: boolean; double_sided: boolean
    verification_status: string; extraction_confidence: number
  }
  const systemRows = (sysData ?? []) as SysRow[]
  const systemIds = systemRows.map((s) => s.id)

  // ── Staged components (full column set) ───────────────────────────────────
  const { data: compData } = await c.supabase
    .from('staged_components')
    .select('id, name, sku, category, description, uom, material, finish, colour, texture, length_mm, width_mm, height_mm, thickness_mm, depth_mm, diameter_mm, roll_m, pack_format, supplier_pack_qty, supplier_pack_uom, supplier_pack_note, reviewer_notes, verification_status, extraction_confidence')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .order('sort_order')
    .limit(ROW_CAP)

  type CompRow = {
    id: string; name: string; sku: string | null; category: string | null
    description: string | null; uom: string | null; material: string | null
    finish: string | null; colour: string | null; texture: string | null
    length_mm: number | null; width_mm: number | null; height_mm: number | null
    thickness_mm: number | null; depth_mm: number | null; diameter_mm: number | null
    roll_m: number | null; pack_format: string | null; supplier_pack_qty: number | null
    supplier_pack_uom: string | null; supplier_pack_note: string | null
    reviewer_notes: string | null; verification_status: string; extraction_confidence: number
  }
  const compRows = (compData ?? []) as CompRow[]
  const componentIds = new Set(compRows.map((c) => c.id))

  const components: ParserStagedComponent[] = compRows.map((c) => ({
    id: c.id, name: c.name, sku: c.sku, category: c.category, description: c.description,
    uom: c.uom, material: c.material, finish: c.finish, colour: c.colour, texture: c.texture,
    lengthMm: c.length_mm, widthMm: c.width_mm, heightMm: c.height_mm,
    thicknessMm: c.thickness_mm, depthMm: c.depth_mm, diameterMm: c.diameter_mm,
    rollM: c.roll_m, packFormat: c.pack_format, supplierPackQty: c.supplier_pack_qty,
    supplierPackUom: c.supplier_pack_uom, supplierPackNote: c.supplier_pack_note,
    reviewerNotes: c.reviewer_notes, verificationStatus: c.verification_status,
    extractionConfidence: c.extraction_confidence,
  }))

  // ── Child tables (all need systemIds) ─────────────────────────────────────
  let rawProfiles: Array<{
    id: string; staged_system_id: string; name: string | null; profile_name: string | null
    product_code: string | null; dimensions: string | null; uom: string | null
    length_mm: number | null; width_mm: number | null; height_mm: number | null
    thickness_mm: number | null; depth_mm: number | null; diameter_mm: number | null
    roll_m: number | null; pack_format: string | null; supplier_pack_qty: number | null
    supplier_pack_uom: string | null; supplier_pack_note: string | null
    verification_status: string
  }> = []
  let rawColours: Array<{
    id: string; staged_system_id: string; colour_name: string; sku: string | null
    sku_suffix: string | null; is_stocked: boolean; reviewer_notes: string | null
    verification_status: string
  }> = []
  let rawLinks: Array<{
    id: string; staged_system_id: string; staged_component_id: string; role: string
    notes: string | null; verification_status: string
  }> = []

  if (systemIds.length > 0) {
    const [profRes, colRes, linkRes] = await Promise.all([
      c.supabase
        .from('staged_system_profiles')
        .select('id, staged_system_id, name, profile_name, product_code, dimensions, uom, length_mm, width_mm, height_mm, thickness_mm, depth_mm, diameter_mm, roll_m, pack_format, supplier_pack_qty, supplier_pack_uom, supplier_pack_note, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
      c.supabase
        .from('staged_system_colours')
        .select('id, staged_system_id, colour_name, sku, sku_suffix, is_stocked, reviewer_notes, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
      c.supabase
        .from('staged_system_components')
        .select('id, staged_system_id, staged_component_id, role, notes, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order')
        .limit(ROW_CAP),
    ])
    rawProfiles = (profRes.data ?? []) as typeof rawProfiles
    rawColours = (colRes.data ?? []) as typeof rawColours
    rawLinks = (linkRes.data ?? []) as typeof rawLinks
  }

  const profiles: ParserStagedProfile[] = rawProfiles.map((p) => ({
    id: p.id, stagedSystemId: p.staged_system_id, name: p.name, profileName: p.profile_name,
    productCode: p.product_code, dimensions: p.dimensions, uom: p.uom,
    lengthMm: p.length_mm, widthMm: p.width_mm, heightMm: p.height_mm,
    thicknessMm: p.thickness_mm, depthMm: p.depth_mm, diameterMm: p.diameter_mm,
    rollM: p.roll_m, packFormat: p.pack_format, supplierPackQty: p.supplier_pack_qty,
    supplierPackUom: p.supplier_pack_uom, supplierPackNote: p.supplier_pack_note,
    verificationStatus: p.verification_status,
  }))

  const colours: ParserStagedColour[] = rawColours.map((c) => ({
    id: c.id, stagedSystemId: c.staged_system_id, colourName: c.colour_name, sku: c.sku,
    skuSuffix: c.sku_suffix, isStocked: c.is_stocked, reviewerNotes: c.reviewer_notes,
    verificationStatus: c.verification_status,
  }))

  const links: ParserStagedLink[] = rawLinks.map((l) => ({
    id: l.id, stagedSystemId: l.staged_system_id, stagedComponentId: l.staged_component_id,
    role: l.role, notes: l.notes, verificationStatus: l.verification_status,
  }))

  // ── Per-system child counts ───────────────────────────────────────────────
  const profilesBySystem = new Map<string, number>()
  const coloursBySystem = new Map<string, number>()
  const linksBySystem = new Map<string, number>()
  for (const p of rawProfiles) profilesBySystem.set(p.staged_system_id, (profilesBySystem.get(p.staged_system_id) ?? 0) + 1)
  for (const c of rawColours) coloursBySystem.set(c.staged_system_id, (coloursBySystem.get(c.staged_system_id) ?? 0) + 1)
  for (const l of rawLinks) linksBySystem.set(l.staged_system_id, (linksBySystem.get(l.staged_system_id) ?? 0) + 1)

  const systems: ParserStagedSystem[] = systemRows.map((s) => ({
    id: s.id, name: s.name, productCode: s.product_code, category: s.category,
    subcategory: s.subcategory, description: s.description, notes: s.notes,
    reviewerNotes: s.reviewer_notes, balRating: s.bal_rating, acousticRating: s.acoustic_rating,
    moistureResistant: s.moisture_resistant ?? false, doubleSided: s.double_sided ?? false,
    verificationStatus: s.verification_status, extractionConfidence: s.extraction_confidence,
    profileCount: profilesBySystem.get(s.id) ?? 0,
    colourCount: coloursBySystem.get(s.id) ?? 0,
    linkCount: linksBySystem.get(s.id) ?? 0,
  }))

  // ── Orphan check ──────────────────────────────────────────────────────────
  const orphanLinkCount = links.filter((l) => !componentIds.has(l.stagedComponentId)).length

  // ── Field verifications ───────────────────────────────────────────────────
  const { data: fvData } = await c.supabase
    .from('field_verifications')
    .select('id, entity_type, entity_id, field_name, extracted_value, status, source_page_number')
    .eq('source_document_id', documentId)
    .order('entity_type')
    .limit(ROW_CAP)

  type FvRow = { id: string; entity_type: string; entity_id: string; field_name: string; extracted_value: string | null; status: string; source_page_number: number | null }
  const fieldVerifications: ParserFieldVerification[] = ((fvData ?? []) as FvRow[]).map((f) => ({
    id: f.id, entityType: f.entity_type, entityId: f.entity_id, fieldName: f.field_name,
    extractedValue: f.extracted_value, status: f.status, sourcePageNumber: f.source_page_number,
  }))

  // ── Parser field evidence ─────────────────────────────────────────────────
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
      id: p.id, entityType: p.entity_type, entityId: p.entity_id, fieldName: p.field_name,
      extractedValue: p.extracted_value, confidence: p.confidence,
      isUncertain: p.is_uncertain, parserNote: p.parser_note, sourcePageNumber: p.source_page_number,
    }))
  }

  // ── Evidence coverage ─────────────────────────────────────────────────────
  const systemIdsWithEvidence = new Set<string>()
  const componentIdsWithEvidence = new Set<string>()
  const byEntityType: Record<string, number> = {}

  for (const pfe of parserFieldEvidence) {
    byEntityType[pfe.entityType] = (byEntityType[pfe.entityType] ?? 0) + 1
    if (pfe.entityType === 'staged_system') systemIdsWithEvidence.add(pfe.entityId)
    if (pfe.entityType === 'staged_component') componentIdsWithEvidence.add(pfe.entityId)
  }

  const entitiesTotal = systems.length + components.length
  const entitiesWithEvidence = systemIdsWithEvidence.size + componentIdsWithEvidence.size
  const evidenceCoverage: EvidenceCoverage = {
    entitiesWithEvidence,
    entitiesTotal,
    pct: entitiesTotal > 0 ? Math.round((entitiesWithEvidence / entitiesTotal) * 100) : 0,
    byEntityType,
  }

  // ── Exact counts ──────────────────────────────────────────────────────────
  const [sysCnt, profCnt, compCnt, colCnt, linkCnt, fvCnt, pfeCnt] = await Promise.all([
    c.supabase.from('staged_systems').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId).eq('manufacturer_id', manufacturerId),
    systemIds.length > 0
      ? c.supabase.from('staged_system_profiles').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0 }),
    c.supabase.from('staged_components').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId).eq('manufacturer_id', manufacturerId),
    systemIds.length > 0
      ? c.supabase.from('staged_system_colours').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0 }),
    systemIds.length > 0
      ? c.supabase.from('staged_system_components').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds)
      : Promise.resolve({ count: 0 }),
    c.supabase.from('field_verifications').select('*', { count: 'exact', head: true }).eq('source_document_id', documentId),
    parseRun
      ? c.supabase.from('parser_field_evidence').select('*', { count: 'exact', head: true }).eq('extraction_run_id', parseRun.id)
      : Promise.resolve({ count: 0 }),
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
    document,
    parseRun,
    counts,
    evidenceCoverage,
    systems,
    profiles,
    components,
    colours,
    links,
    fieldVerifications,
    parserFieldEvidence,
    orphanLinkCount,
    systemIdsWithEvidence,
    componentIdsWithEvidence,
  }
}
