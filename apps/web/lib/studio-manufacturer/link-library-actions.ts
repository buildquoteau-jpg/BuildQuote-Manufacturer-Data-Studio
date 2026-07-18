'use server'

// Mutations for the manufacturer link library (manufacturer_link_library, migration 056).
// Read helper lives in link-library.ts. Follows asset-actions.ts conventions:
// assertManufacturerAccess gate + result envelopes, session client so RLS stays in force.

import { revalidatePath } from 'next/cache'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import type { LinkLibraryEntry } from './link-library'

async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  if (session.globalRole === 'buildquote_admin') return { allowed: true, userId: session.user!.id }
  if (session.globalRole !== 'manufacturer_user') return { allowed: false, error: 'Access denied.' }
  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) return { allowed: false, error: 'Not a member of this workspace.' }
  return { allowed: true, userId: session.user!.id }
}

function friendlyDbError(message: string): string {
  if (/does not exist/i.test(message)) {
    return 'The link library table is not set up yet (migration 056 has not been applied).'
  }
  return message
}

function makeClient() {
  try {
    return { ok: true as const, supabase: createStudioServerClient() }
  } catch {
    return { ok: false as const, error: 'Supabase client not configured.' }
  }
}

// ─── addLinkLibraryEntry ────────────────────────────────────────────────────

export type AddLinkLibraryResult =
  | { ok: true; entry: LinkLibraryEntry }
  | { ok: false; error: string }

export async function addLinkLibraryEntry(
  manufacturerId: string,
  label: string,
  url: string,
): Promise<AddLinkLibraryResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const trimmedLabel = label.trim()
  const trimmedUrl = url.trim()
  if (!trimmedLabel) return { ok: false, error: 'Label is required.' }
  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    return { ok: false, error: 'That is not a valid URL.' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only http(s) URLs are supported.' }
  }

  const client = makeClient()
  if (!client.ok) return client

  const { data, error } = await client.supabase
    .from('manufacturer_link_library')
    .insert({
      manufacturer_id: manufacturerId,
      label: trimmedLabel,
      url: trimmedUrl,
      created_by: auth.userId,
    })
    .select('id, label, url, created_at')
    .single()

  if (error || !data) {
    return { ok: false, error: friendlyDbError(error?.message ?? 'Failed to add link.') }
  }

  revalidatePath('/manufacturer/assets')
  const row = data as { id: string; label: string; url: string; created_at: string }
  return { ok: true, entry: { id: row.id, label: row.label, url: row.url, createdAt: row.created_at } }
}

// ─── updateLinkLibraryEntry ─────────────────────────────────────────────────

export type LinkLibraryActionResult = { ok: true } | { ok: false; error: string }

export async function updateLinkLibraryEntry(
  manufacturerId: string,
  id: string,
  label: string,
  url: string,
): Promise<LinkLibraryActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const trimmedLabel = label.trim()
  const trimmedUrl = url.trim()
  if (!trimmedLabel) return { ok: false, error: 'Label is required.' }
  try {
    const parsed = new URL(trimmedUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: 'Only http(s) URLs are supported.' }
    }
  } catch {
    return { ok: false, error: 'That is not a valid URL.' }
  }

  const client = makeClient()
  if (!client.ok) return client

  const { error } = await client.supabase
    .from('manufacturer_link_library')
    .update({ label: trimmedLabel, url: trimmedUrl, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }
  revalidatePath('/manufacturer/assets')
  return { ok: true }
}

// ─── deleteLinkLibraryEntry ─────────────────────────────────────────────────

export async function deleteLinkLibraryEntry(
  manufacturerId: string,
  id: string,
): Promise<LinkLibraryActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const client = makeClient()
  if (!client.ok) return client

  const { error } = await client.supabase
    .from('manufacturer_link_library')
    .delete()
    .eq('id', id)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }
  revalidatePath('/manufacturer/assets')
  return { ok: true }
}
