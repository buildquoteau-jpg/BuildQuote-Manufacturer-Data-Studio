// Server-only read helper for the manufacturer link library.
// Mutations live in link-library-actions.ts. Table: manufacturer_link_library (migration 056).
//
// Reusable named {label, url} pairs a manufacturer can attach to multiple
// system cards' custom_document_links without retyping the same URL —
// e.g. a decking calculator link shared across several product lines.

import {
  isMissingSchemaError,
  makeStudioClient,
} from '@/lib/supabase/helpers'

export type LinkLibraryEntry = {
  id: string
  label: string
  url: string
  createdAt: string
}

export type LinkLibraryResult =
  | { ok: true; links: LinkLibraryEntry[] }
  | { ok: false; error: string; migrationMissing?: boolean }

type LinkLibraryRow = {
  id: string
  label: string
  url: string
  created_at: string
}

export async function getManufacturerLinkLibrary(
  manufacturerId: string,
): Promise<LinkLibraryResult> {
  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  const { data, error } = await supabase
    .from('manufacturer_link_library')
    .select('id, label, url, created_at')
    .eq('manufacturer_id', manufacturerId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        ok: false,
        migrationMissing: true,
        error: 'The link library table is not set up yet (migration 056 has not been applied to this Supabase project).',
      }
    }
    return { ok: false, error: `Failed to load link library: ${error.message}` }
  }

  const rows = (data ?? []) as unknown as LinkLibraryRow[]
  return {
    ok: true,
    links: rows.map((r) => ({ id: r.id, label: r.label, url: r.url, createdAt: r.created_at })),
  }
}
