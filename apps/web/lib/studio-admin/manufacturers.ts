// Server-only data helper for the admin manufacturer workspace list and detail views.
// Uses the anon/session Supabase client only. No service role key. No writes.
//
// RLS note: migrations 004–006 grant open SELECT to both anon and authenticated
// roles on data_studio_manufacturers, source_documents, staged_systems, and
// staged_components. No policy changes are needed for these reads.

import { makeStudioClient } from '@/lib/supabase/helpers'

// ============================================================
// Types
// ============================================================

export type AdminManufacturerSummary = {
  id: string
  name: string
  slug: string
  status: string
  documentCount: number
  systemCount: number
  componentCount: number
}

export type AdminManufacturerDocument = {
  id: string
  documentName: string
  documentType: string | null
  status: string
  uploadedAt: string
}

export type AdminManufacturerDetail = {
  id: string
  name: string
  slug: string
  status: string
  description: string | null
  websiteUrl: string | null
  documents: AdminManufacturerDocument[]
  systemCount: number
  componentCount: number
}

export type AdminManufacturerListResult =
  | { ok: true; manufacturers: AdminManufacturerSummary[] }
  | { ok: false; error: string }

export type AdminManufacturerDetailResult =
  | { ok: true; manufacturer: AdminManufacturerDetail }
  | { ok: false; error: string; notFound?: boolean }

// ============================================================
// getAdminManufacturerList
// ============================================================
// Returns all manufacturers with doc/system/component counts.
// Uses 4 parallel queries: one for the manufacturer list, one
// per related table fetching only manufacturer_id columns, then
// counts are computed in JS. Safe for local seed sizes.

export async function getAdminManufacturerList(): Promise<AdminManufacturerListResult> {
  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  const [mfrsResult, docsResult, systemsResult, componentsResult] = await Promise.all([
    supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, status')
      .order('name'),
    supabase.from('source_documents').select('manufacturer_id'),
    supabase.from('staged_systems').select('manufacturer_id'),
    supabase.from('staged_components').select('manufacturer_id'),
  ])

  if (mfrsResult.error) {
    return { ok: false, error: `Failed to load manufacturers: ${mfrsResult.error.message}` }
  }

  const mfrs = mfrsResult.data ?? []
  if (mfrs.length === 0) return { ok: true, manufacturers: [] }

  function countByManufacturer(rows: Array<{ manufacturer_id: string }> | null) {
    const map = new Map<string, number>()
    for (const r of rows ?? []) {
      map.set(r.manufacturer_id, (map.get(r.manufacturer_id) ?? 0) + 1)
    }
    return map
  }

  const docCounts = countByManufacturer(docsResult.data as Array<{ manufacturer_id: string }> | null)
  const systemCounts = countByManufacturer(systemsResult.data as Array<{ manufacturer_id: string }> | null)
  const componentCounts = countByManufacturer(componentsResult.data as Array<{ manufacturer_id: string }> | null)

  const manufacturers: AdminManufacturerSummary[] = (mfrs as Array<{
    id: string; name: string; slug: string; status: string
  }>).map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    status: m.status,
    documentCount: docCounts.get(m.id) ?? 0,
    systemCount: systemCounts.get(m.id) ?? 0,
    componentCount: componentCounts.get(m.id) ?? 0,
  }))

  return { ok: true, manufacturers }
}

// ============================================================
// getAdminManufacturerDetail
// ============================================================
// Returns a single manufacturer's details plus its source documents
// and counts of staged systems and components.

export async function getAdminManufacturerDetail(
  manufacturerId: string,
): Promise<AdminManufacturerDetailResult> {
  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  const [mfrResult, docsResult, systemCountResult, componentCountResult] = await Promise.all([
    supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, status, description, website_url')
      .eq('id', manufacturerId)
      .single(),
    supabase
      .from('source_documents')
      .select('id, document_name, document_type, status, uploaded_at')
      .eq('manufacturer_id', manufacturerId)
      .order('uploaded_at', { ascending: false })
      .limit(20),
    supabase
      .from('staged_systems')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
    supabase
      .from('staged_components')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId),
  ])

  if (mfrResult.error || !mfrResult.data) {
    const notFound = mfrResult.error?.code === 'PGRST116'
    return {
      ok: false,
      error: notFound
        ? 'Manufacturer not found.'
        : `Failed to load manufacturer: ${mfrResult.error?.message ?? 'unknown error'}`,
      notFound,
    }
  }

  const m = mfrResult.data as {
    id: string; name: string; slug: string; status: string;
    description: string | null; website_url: string | null
  }

  const documents: AdminManufacturerDocument[] = ((docsResult.data ?? []) as Array<{
    id: string; document_name: string; document_type: string | null;
    status: string; uploaded_at: string
  }>).map((d) => ({
    id: d.id,
    documentName: d.document_name,
    documentType: d.document_type,
    status: d.status,
    uploadedAt: d.uploaded_at,
  }))

  return {
    ok: true,
    manufacturer: {
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      description: m.description,
      websiteUrl: m.website_url,
      documents,
      systemCount: systemCountResult.count ?? 0,
      componentCount: componentCountResult.count ?? 0,
    },
  }
}
