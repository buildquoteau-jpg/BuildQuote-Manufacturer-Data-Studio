// Server-only data helpers for admin manufacturer workspace support views.
// Uses anon/session Supabase client only. No service role key. No writes.
//
// These helpers are called from /admin/manufacturers/[manufacturerId]/* routes,
// which are already guarded by the admin layout (buildquote_admin and
// buildquote_reviewer only; manufacturer_user is redirected).
//
// Each function calls getStudioSession() and returns a role-check error if the
// caller is not admin or reviewer — a defensive belt-and-suspenders check.
//
// RLS note: migrations 004–006 grant open SELECT to anon and authenticated on
// all data_studio_* and staged_* tables. No policy changes are needed.

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

// ============================================================
// Types
// ============================================================

export type AdminWorkspaceManufacturer = {
  id: string
  name: string
  slug: string
  status: string
  description: string | null
  websiteUrl: string | null
}

export type AdminWorkspaceDocument = {
  id: string
  documentName: string
  documentType: string | null
  documentDate: string | null
  status: string
  uploadedAt: string
  fileSizeBytes: number | null
}

export type AdminWorkspaceSystem = {
  id: string
  name: string
  category: string | null
  verificationStatus: string
}

export type AdminWorkspaceComponent = {
  id: string
  name: string
  category: string | null
  verificationStatus: string
}

export type StatusCount = {
  status: string
  count: number
}

// ============================================================
// Result types
// ============================================================

export type AdminWorkspaceOverviewResult =
  | {
      ok: true
      manufacturer: AdminWorkspaceManufacturer
      documentCount: number
      systemCount: number
      componentCount: number
      profileCount: number
      colourCount: number
    }
  | { ok: false; error: string; forbidden?: boolean }

export type AdminWorkspaceDocumentsResult =
  | { ok: true; manufacturer: AdminWorkspaceManufacturer; documents: AdminWorkspaceDocument[] }
  | { ok: false; error: string; forbidden?: boolean }

export type AdminWorkspaceReviewResult =
  | {
      ok: true
      manufacturer: AdminWorkspaceManufacturer
      systems: AdminWorkspaceSystem[]
      systemCount: number
      componentCount: number
      profileCount: number
      colourCount: number
      systemStatusGroups: StatusCount[]
      componentStatusGroups: StatusCount[]
    }
  | { ok: false; error: string; forbidden?: boolean }

export type AdminWorkspacePreviewResult =
  | {
      ok: true
      manufacturer: AdminWorkspaceManufacturer
      systems: Array<AdminWorkspaceSystem & { colours: string[] }>
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

async function fetchManufacturer(
  supabase: ReturnType<typeof createStudioServerClient>,
  manufacturerId: string,
): Promise<{ ok: true; manufacturer: AdminWorkspaceManufacturer } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, status, description, website_url')
    .eq('id', manufacturerId)
    .single()

  if (error || !data) {
    return { ok: false, error: error?.code === 'PGRST116' ? 'Manufacturer not found.' : (error?.message ?? 'Unknown error.') }
  }

  const m = data as {
    id: string; name: string; slug: string; status: string
    description: string | null; website_url: string | null
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
    },
  }
}

// ============================================================
// getAdminManufacturerWorkspace
// Overview counts for the admin detail page header/stats.
// ============================================================

export async function getAdminManufacturerWorkspace(
  manufacturerId: string,
): Promise<AdminWorkspaceOverviewResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const mfrResult = await fetchManufacturer(c.supabase, manufacturerId)
  if (!mfrResult.ok) return { ok: false, error: mfrResult.error }

  const [docsResult, systemsResult, componentsResult] = await Promise.all([
    c.supabase
      .from('source_documents')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
    c.supabase
      .from('staged_systems')
      .select('id')
      .eq('manufacturer_id', manufacturerId),
    c.supabase
      .from('staged_components')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
  ])

  const systemIds = ((systemsResult.data ?? []) as Array<{ id: string }>).map((s) => s.id)

  let profileCount = 0
  let colourCount = 0
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

  return {
    ok: true,
    manufacturer: mfrResult.manufacturer,
    documentCount: docsResult.count ?? 0,
    systemCount: systemIds.length,
    componentCount: componentsResult.count ?? 0,
    profileCount,
    colourCount,
  }
}

// ============================================================
// getAdminManufacturerDocuments
// Source documents list for the admin documents support view.
// Storage fields intentionally excluded.
// ============================================================

export async function getAdminManufacturerDocuments(
  manufacturerId: string,
): Promise<AdminWorkspaceDocumentsResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [mfrResult, docsResult] = await Promise.all([
    fetchManufacturer(c.supabase, manufacturerId),
    c.supabase
      .from('source_documents')
      .select('id, document_name, document_type, document_date, status, uploaded_at, file_size_bytes')
      .eq('manufacturer_id', manufacturerId)
      .order('uploaded_at', { ascending: false })
      .limit(50),
  ])

  if (!mfrResult.ok) return { ok: false, error: mfrResult.error }
  if (docsResult.error) return { ok: false, error: `Failed to load documents: ${docsResult.error.message}` }

  type DocRow = {
    id: string; document_name: string; document_type: string | null
    document_date: string | null; status: string; uploaded_at: string
    file_size_bytes: number | null
  }

  const documents: AdminWorkspaceDocument[] = ((docsResult.data ?? []) as DocRow[]).map((d) => ({
    id: d.id,
    documentName: d.document_name,
    documentType: d.document_type,
    documentDate: d.document_date,
    status: d.status,
    uploadedAt: d.uploaded_at,
    fileSizeBytes: d.file_size_bytes,
  }))

  return { ok: true, manufacturer: mfrResult.manufacturer, documents }
}

// ============================================================
// getAdminManufacturerReviewData
// Staged data summary for the admin review support view.
// ============================================================

export async function getAdminManufacturerReviewData(
  manufacturerId: string,
): Promise<AdminWorkspaceReviewResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [mfrResult, systemsResult, componentStatusResult, componentCountResult] =
    await Promise.all([
      fetchManufacturer(c.supabase, manufacturerId),
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
        .from('staged_components')
        .select('*', { count: 'exact', head: true })
        .eq('manufacturer_id', manufacturerId),
    ])

  if (!mfrResult.ok) return { ok: false, error: mfrResult.error }
  if (systemsResult.error) return { ok: false, error: `Failed to load systems: ${systemsResult.error.message}` }

  type SystemRow = { id: string; name: string; category: string | null; verification_status: string }
  const systems: AdminWorkspaceSystem[] = ((systemsResult.data ?? []) as SystemRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    verificationStatus: s.verification_status,
  }))

  const systemIds = systems.map((s) => s.id)
  let profileCount = 0
  let colourCount = 0
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
    manufacturer: mfrResult.manufacturer,
    systems,
    systemCount: systems.length,
    componentCount: componentCountResult.count ?? 0,
    profileCount,
    colourCount,
    systemStatusGroups: groupByStatus(
      systems.map((s) => ({ verification_status: s.verificationStatus })),
    ),
    componentStatusGroups: groupByStatus(componentRows),
  }
}

// ============================================================
// getAdminManufacturerPreviewData
// Manufacturer + staged systems + colours for admin preview page.
// ============================================================

export async function getAdminManufacturerPreviewData(
  manufacturerId: string,
): Promise<AdminWorkspacePreviewResult> {
  const authCheck = await assertAdminOrReviewer()
  if (!authCheck.allowed) return { ok: false, error: authCheck.error, forbidden: true }

  const c = makeClient()
  if (!c.ok) return { ok: false, error: c.error }

  const [mfrResult, systemsResult] = await Promise.all([
    fetchManufacturer(c.supabase, manufacturerId),
    c.supabase
      .from('staged_systems')
      .select('id, name, category, verification_status')
      .eq('manufacturer_id', manufacturerId)
      .order('sort_order')
      .limit(20),
  ])

  if (!mfrResult.ok) return { ok: false, error: mfrResult.error }

  type SystemRow = { id: string; name: string; category: string | null; verification_status: string }
  const systemRows = (systemsResult.data ?? []) as SystemRow[]
  const systemIds = systemRows.map((s) => s.id)

  let systems: Array<AdminWorkspaceSystem & { colours: string[] }> = systemRows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    verificationStatus: s.verification_status,
    colours: [],
  }))

  if (systemIds.length > 0) {
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

    systems = systemRows.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      verificationStatus: s.verification_status,
      colours: coloursMap.get(s.id) ?? [],
    }))
  }

  return { ok: true, manufacturer: mfrResult.manufacturer, systems }
}
