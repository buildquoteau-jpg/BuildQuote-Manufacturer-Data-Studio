// Server-only data helpers for the manufacturer workspace pages.
// Uses the anon/session Supabase client only. No service role key. No writes.
//
// RLS note: migrations 004–006 grant open SELECT to anon and authenticated
// roles on all data_studio_* and staged_* tables. No policy changes needed.

import { cookies } from 'next/headers'
import { createStudioServerClient } from '@/lib/supabase/server'
import { createPresignedDownloadUrl } from '@/lib/r2'
import type { StudioSession, StudioManufacturerMembership } from '@/lib/studio-auth/session'

const GATE_COOKIE = 'admin_workspace_gate'

// ============================================================
// Workspace context resolver (pure, no DB call)
// ============================================================

export type WorkspaceContext =
  | {
      found: true
      manufacturerId: string
      membership: StudioManufacturerMembership
      // TODO: expose allMemberships for a future workspace switcher UI
      allMemberships: StudioManufacturerMembership[]
    }
  | {
      found: false
      reason: 'no_membership' | 'admin_no_context'
      allMemberships: StudioManufacturerMembership[]
    }

/**
 * Determines the active manufacturer workspace from the resolved session.
 * buildquote_admin gets admin_no_context (no memberships), unless
 * adminImpersonatedManufacturerId is provided (set via the workspace gate cookie).
 * manufacturer_user with no active memberships gets no_membership.
 * Multiple memberships: first active membership used as default.
 */
export function resolveWorkspaceContext(
  session: StudioSession,
  adminImpersonatedManufacturerId?: string | null,
): WorkspaceContext {
  if (session.globalRole === 'buildquote_admin') {
    if (adminImpersonatedManufacturerId) {
      return {
        found: true,
        manufacturerId: adminImpersonatedManufacturerId,
        membership: {
          id: 'admin-gate',
          manufacturerId: adminImpersonatedManufacturerId,
          role: 'manufacturer_admin',
          status: 'active',
        },
        allMemberships: [],
      }
    }
    return { found: false, reason: 'admin_no_context', allMemberships: [] }
  }

  const membership = session.memberships[0] ?? null
  if (!membership) {
    return { found: false, reason: 'no_membership', allMemberships: session.memberships }
  }

  return {
    found: true,
    manufacturerId: membership.manufacturerId,
    membership,
    allMemberships: session.memberships,
  }
}

/**
 * Async variant that reads the admin workspace gate cookie for impersonation.
 * Use this in manufacturer portal pages instead of resolveWorkspaceContext directly.
 */
export async function resolveWorkspaceContextFromRequest(
  session: StudioSession,
): Promise<WorkspaceContext> {
  let adminImpersonation: string | null = null
  if (session.globalRole === 'buildquote_admin') {
    const jar = await cookies()
    adminImpersonation = jar.get(GATE_COOKIE)?.value ?? null
  }
  return resolveWorkspaceContext(session, adminImpersonation)
}

/**
 * Returns the manufacturer ID from the admin workspace gate cookie, or null.
 * Used by the manufacturer layout to show the exit banner.
 */
export async function getAdminImpersonatedManufacturerId(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(GATE_COOKIE)?.value ?? null
}

// ============================================================
// Types
// ============================================================

export type ManufacturerInfo = {
  id: string
  name: string
  slug: string
  status: string
  description: string | null
  websiteUrl: string | null
  heroImageUrl: string | null
}

export type ManufacturerDocument = {
  id: string
  documentName: string
  documentType: string | null
  documentDate: string | null
  status: string
  uploadedAt: string
  fileSizeBytes: number | null
  uploaderName: string | null
}

export type WorkspaceCounts = {
  documentCount: number
  systemCount: number
  componentCount: number
}

export type ReviewSystem = {
  id: string
  name: string
  category: string | null
  verificationStatus: string
}

export type StatusCount = {
  status: string
  count: number
}

export type ManufacturerReviewData = {
  systems: ReviewSystem[]
  systemCount: number
  componentCount: number
  profileCount: number
  colourCount: number
  systemStatusGroups: StatusCount[]
  componentStatusGroups: StatusCount[]
}

export type PreviewSystem = {
  id: string
  name: string
  category: string | null
  verificationStatus: string
  colours: string[]
}

export type PortalSystem = {
  id: string
  name: string
  category: string | null
  description: string | null
  verificationStatus: string
  productionSystemId: string | null
  sourceDocumentId: string | null
}

export type PortalDocument = {
  id: string
  documentName: string
  documentType: string | null
  documentDate: string | null
  status: string
  uploadedAt: string
  fileSizeBytes: number | null
  uploaderName: string | null
}

export type PortalData = {
  manufacturer: ManufacturerInfo
  documents: PortalDocument[]
  systems: PortalSystem[]
}

export type PortalDataResult =
  | { ok: true; data: PortalData }
  | { ok: false; error: string }

// ============================================================
// Result envelope types
// ============================================================

export type ManufacturerInfoResult =
  | { ok: true; manufacturer: ManufacturerInfo }
  | { ok: false; error: string }

export type ManufacturerDocumentsResult =
  | { ok: true; documents: ManufacturerDocument[] }
  | { ok: false; error: string }

export type WorkspaceCountsResult =
  | { ok: true; counts: WorkspaceCounts }
  | { ok: false; error: string }

export type ManufacturerReviewResult =
  | { ok: true; data: ManufacturerReviewData }
  | { ok: false; error: string }

export type ManufacturerPreviewResult =
  | { ok: true; manufacturer: ManufacturerInfo; systems: PreviewSystem[] }
  | { ok: false; error: string }

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

async function resolveUploaderNames(
  supabase: ReturnType<typeof createStudioServerClient>,
  authUserIds: string[],
): Promise<Map<string, string>> {
  if (!authUserIds.length) return new Map()
  const { data } = await supabase
    .from('data_studio_user_profiles')
    .select('auth_user_id, full_name, email, global_role')
    .in('auth_user_id', authUserIds)
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{
    auth_user_id: string; full_name: string | null; email: string; global_role: string
  }>) {
    map.set(
      row.auth_user_id,
      row.full_name ?? (row.global_role === 'buildquote_admin' ? 'Admin' : row.email),
    )
  }
  return map
}

function groupByStatus(
  rows: Array<{ verification_status: string }>,
): StatusCount[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.verification_status, (map.get(r.verification_status) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}

// ============================================================
// getManufacturerInfo
// Table: data_studio_manufacturers
// ============================================================

export async function getManufacturerInfo(
  manufacturerId: string,
): Promise<ManufacturerInfoResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { data, error } = await c.supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, status, description, website_url, hero_image_url')
    .eq('id', manufacturerId)
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Manufacturer not found.' }
  }

  const m = data as {
    id: string; name: string; slug: string; status: string
    description: string | null; website_url: string | null; hero_image_url: string | null
  }

  return {
    ok: true,
    manufacturer: {
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      description: m.description,
      websiteUrl: m.website_url,
      heroImageUrl: m.hero_image_url,
    },
  }
}

// ============================================================
// getWorkspaceCounts
// Uses count/head queries — no row data returned.
// ============================================================

export async function getWorkspaceCounts(
  manufacturerId: string,
): Promise<WorkspaceCountsResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [docsResult, systemsResult, componentsResult] = await Promise.all([
    c.supabase
      .from('source_documents')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
    c.supabase
      .from('staged_systems')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
    c.supabase
      .from('staged_components')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
  ])

  return {
    ok: true,
    counts: {
      documentCount: docsResult.count ?? 0,
      systemCount: systemsResult.count ?? 0,
      componentCount: componentsResult.count ?? 0,
    },
  }
}

// ============================================================
// getManufacturerDocuments
// Table: source_documents
// Storage fields (storage_bucket, storage_key, storage_provider,
// public_url, original_filename) are intentionally excluded.
// ============================================================

export async function getManufacturerDocuments(
  manufacturerId: string,
): Promise<ManufacturerDocumentsResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { data, error } = await c.supabase
    .from('source_documents')
    .select('id, document_name, document_type, document_date, status, uploaded_at, file_size_bytes, uploaded_by')
    .eq('manufacturer_id', manufacturerId)
    .order('uploaded_at', { ascending: false })
    .limit(50)

  if (error) {
    return { ok: false, error: `Failed to load documents: ${error.message}` }
  }

  type DocRow = {
    id: string; document_name: string; document_type: string | null
    document_date: string | null; status: string; uploaded_at: string
    file_size_bytes: number | null; uploaded_by: string | null
  }

  const rows = (data ?? []) as DocRow[]
  const uploaderIds = Array.from(new Set(rows.map((d) => d.uploaded_by).filter((id): id is string => !!id)))
  const uploaderNames = await resolveUploaderNames(c.supabase, uploaderIds)

  const documents: ManufacturerDocument[] = rows.map((d) => ({
    id: d.id,
    documentName: d.document_name,
    documentType: d.document_type,
    documentDate: d.document_date,
    status: d.status,
    uploadedAt: d.uploaded_at,
    fileSizeBytes: d.file_size_bytes,
    uploaderName: d.uploaded_by ? (uploaderNames.get(d.uploaded_by) ?? null) : null,
  }))

  return { ok: true, documents }
}

// ============================================================
// getManufacturerReviewData
// Tables: staged_systems, staged_components,
//         staged_system_profiles, staged_system_colours
// Returns a read-only summary for the review overview page.
// ============================================================

export async function getManufacturerReviewData(
  manufacturerId: string,
): Promise<ManufacturerReviewResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  // Fetch systems list + component statuses + counts in parallel
  const [systemsResult, componentStatusResult, systemCountResult, componentCountResult] =
    await Promise.all([
      c.supabase
        .from('staged_systems')
        .select('id, name, category, verification_status')
        .eq('manufacturer_id', manufacturerId)
        .order('sort_order')
        .limit(20),
      c.supabase
        .from('staged_components')
        .select('verification_status')
        .eq('manufacturer_id', manufacturerId),
      c.supabase
        .from('staged_systems')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer_id', manufacturerId),
      c.supabase
        .from('staged_components')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer_id', manufacturerId),
    ])

  if (systemsResult.error) {
    return { ok: false, error: `Failed to load staged systems: ${systemsResult.error.message}` }
  }

  type SystemRow = { id: string; name: string; category: string | null; verification_status: string }

  const systems: ReviewSystem[] = ((systemsResult.data ?? []) as SystemRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    verificationStatus: s.verification_status,
  }))

  // Count profiles and colours scoped to this manufacturer's systems
  let profileCount = 0
  let colourCount = 0

  const systemIds = systems.map((s) => s.id)
  if (systemIds.length > 0) {
    const [profilesResult, coloursResult] = await Promise.all([
      c.supabase
        .from('staged_system_profiles')
        .select('*', { count: 'exact', head: true })
        .in('staged_system_id', systemIds),
      c.supabase
        .from('staged_system_colours')
        .select('*', { count: 'exact', head: true })
        .in('staged_system_id', systemIds),
    ])
    profileCount = profilesResult.count ?? 0
    colourCount = coloursResult.count ?? 0
  }

  type CompStatusRow = { verification_status: string }
  const componentRows = (componentStatusResult.data ?? []) as CompStatusRow[]

  return {
    ok: true,
    data: {
      systems,
      systemCount: systemCountResult.count ?? 0,
      componentCount: componentCountResult.count ?? 0,
      profileCount,
      colourCount,
      systemStatusGroups: groupByStatus(
        systems.map((s) => ({ verification_status: s.verificationStatus })),
      ),
      componentStatusGroups: groupByStatus(componentRows),
    },
  }
}

// ============================================================
// getManufacturerPreviewData
// Tables: data_studio_manufacturers, staged_systems,
//         staged_system_colours
// Returns lightweight read-only data for the Studio preview page.
// ============================================================

export async function getManufacturerPreviewData(
  manufacturerId: string,
): Promise<ManufacturerPreviewResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [mfrResult, systemsResult] = await Promise.all([
    c.supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, status, description, website_url')
      .eq('id', manufacturerId)
      .single(),
    c.supabase
      .from('staged_systems')
      .select('id, name, category, verification_status')
      .eq('manufacturer_id', manufacturerId)
      .order('sort_order')
      .limit(20),
  ])

  if (mfrResult.error || !mfrResult.data) {
    return { ok: false, error: mfrResult.error?.message ?? 'Manufacturer not found.' }
  }

  const m = mfrResult.data as {
    id: string; name: string; slug: string; status: string
    description: string | null; website_url: string | null
  }

  type SystemRow = { id: string; name: string; category: string | null; verification_status: string }
  const systemRows = (systemsResult.data ?? []) as SystemRow[]

  // Fetch colours for all systems in one query
  let systemsWithColours: PreviewSystem[] = systemRows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    verificationStatus: s.verification_status,
    colours: [],
  }))

  if (systemRows.length > 0) {
    const systemIds = systemRows.map((s) => s.id)
    const { data: coloursData } = await c.supabase
      .from('staged_system_colours')
      .select('staged_system_id, colour_name')
      .in('staged_system_id', systemIds)
      .order('sort_order')

    type ColourRow = { staged_system_id: string; colour_name: string }
    const coloursMap = new Map<string, string[]>()
    for (const r of (coloursData ?? []) as ColourRow[]) {
      const list = coloursMap.get(r.staged_system_id) ?? []
      list.push(r.colour_name)
      coloursMap.set(r.staged_system_id, list)
    }

    systemsWithColours = systemRows.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      verificationStatus: s.verification_status,
      colours: coloursMap.get(s.id) ?? [],
    }))
  }

  return {
    ok: true,
    manufacturer: {
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      description: m.description,
      websiteUrl: m.website_url,
      heroImageUrl: null,
    },
    systems: systemsWithColours,
  }
}

// ============================================================
// getManufacturerVerificationData
// Full system card data for the manufacturer verification UI.
// Mirrors getAdminManufacturerSystemCards but without admin gate.
// ============================================================

export type VerificationSystemProfile = {
  id: string
  product_code: string | null
  profile_name: string
  description: string | null
  dimensions: string | null
  length_mm: number | null
  height_mm: number | null
  width_mm: number | null
  thickness_mm: number | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
}

export type VerificationSystemComponent = {
  id: string
  sku: string | null
  name: string
  description: string | null
  category: string | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
  procurement_route: 'specialist_supplier' | 'trade_merchant' | null
}

export type VerificationSystemColour = {
  id: string
  colour_name: string
  sku_suffix: string | null
  image_url: string | null
  image_asset_id: string | null
  is_stocked: boolean | null
}

export type VerificationSystem = {
  id: string
  name: string
  slug: string | null
  product_code: string | null
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  hero_image_asset_id: string | null
  hero_image_position_x: number | null
  hero_image_position_y: number | null
  hero_image_zoom: number | null
  gallery_images: { asset_id?: string | null; url: string; og_jpg_url?: string | null; alt: string; caption?: string | null }[] | null
  australian_made: boolean | null
  bal_rating: string | null
  fire_rating: string | null
  acoustic_rating: string | null
  moisture_resistant: boolean | null
  structural_grade: string | null
  website_url: string | null
  source_url: string | null
  source_document_id: string | null
  install_guide_urls: { label: string; url: string }[] | null
  design_guide_url: string | null
  tech_data_url: string | null
  // Extra named document buttons (energy ratings, sustainability reports…).
  // Optional — degrades to null pre-migration-055 (column absent).
  custom_document_links?: { label: string; url: string }[] | null
  custom_technical_attributes?: { label: string; value: string }[] | null
  notes: string | null
  verification_status: string
  reviewer_notes: string | null
  verified_at: string | null
  production_system_id: string | null
  last_published_at: string | null
  // Hybrid publishing (053): live-publish state. Both null pre-migration.
  publish_status: 'draft' | 'published' | 'published_with_changes' | null
  published_version: string | null
  updated_at: string
  last_submitted_at: string | null
  profiles: VerificationSystemProfile[]
  components: VerificationSystemComponent[]
  colours: VerificationSystemColour[]
}

export type ManufacturerVerificationResult =
  | { ok: true; manufacturer: ManufacturerInfo; systems: VerificationSystem[] }
  | { ok: false; error: string }

// Resolves a manufacturer's own hero image the same way system/colour hero
// images are resolved elsewhere in this file: prefer the Asset-linked live
// URL (public_url, else a fresh presigned link) over the raw column, since
// that column can be null or a stale/expired presigned link.
async function resolveMfrHeroImageUrl(
  supabase: ReturnType<typeof createStudioServerClient>,
  assetId: string | null,
  rawUrl: string | null,
): Promise<string | null> {
  if (!assetId) return rawUrl
  const { data } = await supabase
    .from('manufacturer_assets')
    .select('storage_key, public_url')
    .eq('id', assetId)
    .maybeSingle()
  const asset = data as { storage_key: string | null; public_url: string | null } | null
  if (!asset) return rawUrl
  if (asset.public_url) return asset.public_url
  if (!asset.storage_key) return rawUrl
  const presigned = await createPresignedDownloadUrl({ storageKey: asset.storage_key, expiresInSeconds: 3600 })
  return presigned.ok ? presigned.downloadUrl : rawUrl
}

export async function getManufacturerVerificationData(
  manufacturerId: string,
): Promise<ManufacturerVerificationResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const stagedSelect = (withGallery: boolean) =>
    c.supabase
      .from('staged_systems')
      .select(
        'id, name, slug, product_code, category, subcategory, description, hero_image_url, hero_image_asset_id, ' +
        'hero_image_position_x, hero_image_position_y, ' +
        (withGallery ? 'gallery_images, publish_status, published_version, hero_image_zoom, custom_document_links, custom_technical_attributes, ' : '') +
        'australian_made, bal_rating, fire_rating, acoustic_rating, moisture_resistant, ' +
        'structural_grade, website_url, source_url, install_guide_urls, design_guide_url, tech_data_url, ' +
        'notes, verification_status, reviewer_notes, verified_at, source_document_id, ' +
        'production_system_id, last_published_at, updated_at, last_submitted_at',
      )
      .eq('manufacturer_id', manufacturerId)
      .neq('verification_status', 'archived')
      .order('sort_order')
      .limit(100)

  const [mfrResult, firstSystemsResult] = await Promise.all([
    c.supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, status, description, website_url, hero_image_url, hero_image_asset_id')
      .eq('id', manufacturerId)
      .single(),
    stagedSelect(true),
  ])

  // Pre-053 environments lack gallery_images/publish_status — retry without.
  let systemsResult = firstSystemsResult
  if (systemsResult.error && /gallery_images|publish_status|published_version|hero_image_zoom|does not exist/i.test(systemsResult.error.message ?? '')) {
    systemsResult = await stagedSelect(false)
  }

  if (mfrResult.error || !mfrResult.data) {
    return { ok: false, error: mfrResult.error?.message ?? 'Manufacturer not found.' }
  }
  if (systemsResult.error) {
    return { ok: false, error: `Failed to load systems: ${systemsResult.error.message}` }
  }

  const m = mfrResult.data as {
    id: string; name: string; slug: string; status: string
    description: string | null; website_url: string | null
    hero_image_url: string | null; hero_image_asset_id: string | null
  }

  type SysRow = {
    id: string; name: string; slug: string | null; product_code: string | null
    category: string | null; subcategory: string | null; description: string | null
    hero_image_url: string | null; hero_image_asset_id: string | null
    hero_image_position_x: number | null; hero_image_position_y: number | null
    gallery_images?: VerificationSystem['gallery_images']
    publish_status?: VerificationSystem['publish_status']
    published_version?: string | null
    hero_image_zoom?: number | null
    australian_made: boolean | null
    bal_rating: string | null; fire_rating: string | null
    acoustic_rating: string | null; moisture_resistant: boolean | null
    structural_grade: string | null; website_url: string | null
    source_url: string | null; source_document_id: string | null
    install_guide_urls: { label: string; url: string }[] | null
    custom_document_links?: { label: string; url: string }[] | null
    custom_technical_attributes?: { label: string; value: string }[] | null
    design_guide_url: string | null; tech_data_url: string | null; notes: string | null
    verification_status: string; reviewer_notes: string | null
    verified_at: string | null
    production_system_id: string | null; last_published_at: string | null
    updated_at: string; last_submitted_at: string | null
  }

  const systemRows = (systemsResult.data ?? []) as unknown as SysRow[]
  const systemIds = systemRows.map((s) => s.id)

  if (systemIds.length === 0) {
    return {
      ok: true,
      manufacturer: {
        id: m.id, name: m.name, slug: m.slug, status: m.status,
        description: m.description, websiteUrl: m.website_url,
        heroImageUrl: await resolveMfrHeroImageUrl(c.supabase, m.hero_image_asset_id, m.hero_image_url),
      },
      systems: [],
    }
  }

  const [profilesResult, coloursResult, sysComponentsResult] = await Promise.all([
    c.supabase
      .from('staged_system_profiles')
      .select(
        'id, staged_system_id, product_code, profile_name, description, dimensions, ' +
        'length_mm, height_mm, width_mm, thickness_mm, uom, ' +
        'supplier_pack_qty, supplier_pack_uom, sort_order',
      )
      .in('staged_system_id', systemIds)
      .order('sort_order'),
    c.supabase
      .from('staged_system_colours')
      .select('id, staged_system_id, colour_name, sku_suffix, image_url, image_asset_id, is_stocked')
      .in('staged_system_id', systemIds)
      .order('sort_order'),
    c.supabase
      .from('staged_system_components')
      .select(
        'staged_system_id, staged_components(id, sku, name, description, category, uom, supplier_pack_qty, supplier_pack_uom, sort_order, procurement_route)',
      )
      .in('staged_system_id', systemIds),
  ])

  // Pre-migration-063 environments lack image_asset_id — retry without it.
  if (coloursResult.error && /image_asset_id|does not exist/i.test(coloursResult.error.message ?? '')) {
    const retry = await c.supabase
      .from('staged_system_colours')
      .select('id, staged_system_id, colour_name, sku_suffix, image_url, is_stocked')
      .in('staged_system_id', systemIds)
      .order('sort_order')
    if (!retry.error) {
      coloursResult.data = (retry.data ?? []).map((r: any) => ({ ...r, image_asset_id: null })) as any
      ;(coloursResult as any).error = null
    }
  }

  type ProfileRow = VerificationSystemProfile & { staged_system_id: string }
  type ColourRow  = VerificationSystemColour  & { staged_system_id: string }
  type CompLink   = { staged_system_id: string; staged_components: VerificationSystemComponent | VerificationSystemComponent[] | null }

  const profilesMap  = new Map<string, VerificationSystemProfile[]>()
  const coloursMap   = new Map<string, VerificationSystemColour[]>()
  const componentsMap = new Map<string, VerificationSystemComponent[]>()

  for (const r of (profilesResult.data ?? []) as unknown as ProfileRow[]) {
    const { staged_system_id, ...profile } = r
    const list = profilesMap.get(staged_system_id) ?? []
    list.push(profile)
    profilesMap.set(staged_system_id, list)
  }

  for (const r of (coloursResult.data ?? []) as ColourRow[]) {
    const { staged_system_id, ...colour } = r
    const list = coloursMap.get(staged_system_id) ?? []
    list.push(colour)
    coloursMap.set(staged_system_id, list)
  }

  for (const r of ((sysComponentsResult.data as unknown as CompLink[]) ?? [])) {
    if (!r.staged_components) continue
    const comp = Array.isArray(r.staged_components) ? r.staged_components[0] : r.staged_components
    if (!comp) continue
    const list = componentsMap.get(r.staged_system_id) ?? []
    list.push(comp)
    componentsMap.set(r.staged_system_id, list)
  }

  // When a system's hero image (or a colour swatch) is linked to an Asset
  // Library upload, the *_url column can be null or stale (e.g. a presigned
  // link saved before the URL-sync fix, or simply out of date) — resolve the
  // asset's live URL here so every consumer of this function (review grid,
  // studio preview, etc.) gets the correct image without each having to know
  // about assets.
  const colourRows = (coloursResult.data ?? []) as unknown as ColourRow[]
  const linkedAssetIds = Array.from(new Set([
    m.hero_image_asset_id,
    ...systemRows.map((s) => s.hero_image_asset_id),
    ...colourRows.map((c) => c.image_asset_id),
  ].filter((id): id is string => !!id)))
  const imageUrlByAssetId = new Map<string, string>()
  if (linkedAssetIds.length > 0) {
    const { data: linkedAssets } = await c.supabase
      .from('manufacturer_assets')
      .select('id, storage_key, public_url')
      .in('id', linkedAssetIds)
    const rows = (linkedAssets ?? []) as { id: string; storage_key: string | null; public_url: string | null }[]
    await Promise.all(rows.map(async (a) => {
      if (a.public_url) { imageUrlByAssetId.set(a.id, a.public_url); return }
      if (!a.storage_key) return
      const presigned = await createPresignedDownloadUrl({ storageKey: a.storage_key, expiresInSeconds: 3600 })
      if (presigned.ok) imageUrlByAssetId.set(a.id, presigned.downloadUrl)
    }))
  }

  for (const list of Array.from(coloursMap.values())) {
    for (const colour of list) {
      if (colour.image_asset_id && imageUrlByAssetId.get(colour.image_asset_id)) {
        colour.image_url = imageUrlByAssetId.get(colour.image_asset_id)!
      }
    }
  }

  const systems: VerificationSystem[] = systemRows.map((s) => ({
    ...s,
    gallery_images: s.gallery_images ?? null,
    publish_status: s.publish_status ?? null,
    published_version: s.published_version ?? null,
    hero_image_zoom: s.hero_image_zoom != null ? Number(s.hero_image_zoom) : null,
    hero_image_url: (s.hero_image_asset_id && imageUrlByAssetId.get(s.hero_image_asset_id)) || s.hero_image_url,
    profiles:   profilesMap.get(s.id)   ?? [],
    colours:    coloursMap.get(s.id)    ?? [],
    components: componentsMap.get(s.id) ?? [],
  }))

  return {
    ok: true,
    manufacturer: {
      id: m.id, name: m.name, slug: m.slug, status: m.status,
      description: m.description, websiteUrl: m.website_url,
      heroImageUrl: (m.hero_image_asset_id && imageUrlByAssetId.get(m.hero_image_asset_id)) || m.hero_image_url,
    },
    systems,
  }
}

// ============================================================
// getPortalData
// Single query set for the manufacturer portal dashboard.
// Returns manufacturer info, documents (catalogues), and
// staged systems with verification + publish state.
// ============================================================

export async function getPortalData(
  manufacturerId: string,
): Promise<PortalDataResult> {
  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [mfrResult, docsResult, systemsResult] = await Promise.all([
    c.supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, status, description, website_url, hero_image_url, logo_url')
      .eq('id', manufacturerId)
      .single(),
    c.supabase
      .from('source_documents')
      .select('id, document_name, document_type, document_date, status, uploaded_at, file_size_bytes, uploaded_by')
      .eq('manufacturer_id', manufacturerId)
      .order('uploaded_at', { ascending: false })
      .limit(50),
    c.supabase
      .from('staged_systems')
      .select('id, name, category, description, verification_status, production_system_id, source_document_id')
      .eq('manufacturer_id', manufacturerId)
      .order('sort_order', { ascending: true })
      .limit(100),
  ])

  if (mfrResult.error || !mfrResult.data) {
    return { ok: false, error: 'Manufacturer workspace not found.' }
  }

  const m = mfrResult.data as {
    id: string; name: string; slug: string; status: string
    description: string | null; website_url: string | null
    hero_image_url: string | null; logo_url: string | null
  }

  type DocRow = {
    id: string; document_name: string; document_type: string | null
    document_date: string | null; status: string; uploaded_at: string
    file_size_bytes: number | null; uploaded_by: string | null
  }
  const docRows = (docsResult.data ?? []) as DocRow[]
  const portalUploaderIds = Array.from(new Set(docRows.map((d) => d.uploaded_by).filter((id): id is string => !!id)))
  const portalUploaderNames = await resolveUploaderNames(c.supabase, portalUploaderIds)

  const documents: PortalDocument[] = docRows.map((d) => ({
    id: d.id,
    documentName: d.document_name,
    documentType: d.document_type,
    documentDate: d.document_date,
    status: d.status,
    uploadedAt: d.uploaded_at,
    fileSizeBytes: d.file_size_bytes,
    uploaderName: d.uploaded_by ? (portalUploaderNames.get(d.uploaded_by) ?? null) : null,
  }))

  type SysRow = {
    id: string; name: string; category: string | null; description: string | null
    verification_status: string; production_system_id: string | null
    source_document_id: string | null
  }
  const systems: PortalSystem[] = ((systemsResult.data ?? []) as SysRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    verificationStatus: s.verification_status,
    productionSystemId: s.production_system_id,
    sourceDocumentId: s.source_document_id,
  }))

  return {
    ok: true,
    data: {
      manufacturer: {
        id: m.id, name: m.name, slug: m.slug, status: m.status,
        description: m.description, websiteUrl: m.website_url,
        heroImageUrl: m.hero_image_url,
      },
      documents,
      systems,
    },
  }
}

// ============================================================
// getOpenAiQuestionsCount
// AI Knowledge Gap & Feedback Loop (design doc addendum §A6) — count of a
// manufacturer's still-open questions, for the dashboard stat row, the
// Start Here guided flow, and the AI Questions list header. Centralized
// here rather than queried inline in three places, so all three always
// agree. Degrades to 0 (never throws) when migration 066 hasn't been
// applied yet in this environment — a missing feature should never break
// the dashboard.
// ============================================================

export async function getOpenAiQuestionsCount(manufacturerId: string): Promise<number> {
  const c = makeClient()
  if (!c.ok) return 0
  const { count, error } = await c.supabase
    .from('ai_knowledge_gaps')
    .select('id', { count: 'exact', head: true })
    .eq('manufacturer_id', manufacturerId)
    .in('status', ['NEW', 'TRIAGED', 'MANUFACTURER_RESPONDED'])
  if (error) return 0
  return count ?? 0
}
