'use server'

// Stockist CRUD for the manufacturer workspace (manufacturer_stockists,
// migration 048). Follows asset-actions.ts conventions: assertManufacturerAccess
// gate + result envelopes, session client so RLS stays in force.
//
// Public reads (the /api/cards/<slug>/stockists.json endpoint and the
// tokenised confirmation page) do NOT live here — they use the service client
// in their route/page files because they run without a session.

import { revalidatePath } from 'next/cache'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import {
  AU_STATES,
  type StockistActionResult,
  type StockistImportResult,
  type StockistInput,
  type StockistListResult,
  type StockistRecord,
} from './stockist-types'

const MAX_IMPORT_ROWS = 1000

// ─── Auth gate ────────────────────────────────────────────────────────────────

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

function makeClient() {
  try {
    return { ok: true as const, supabase: createStudioServerClient() }
  } catch {
    return { ok: false as const, error: 'Supabase client not configured.' }
  }
}

function isMissingSchemaError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === '42703') return true
  return /does not exist/i.test(err.message ?? '')
}

function friendlyDbError(message: string): string {
  if (/does not exist/i.test(message)) {
    return 'The stockist tables are not set up yet (migration 048 has not been applied).'
  }
  return message
}

// ─── Input sanitising ─────────────────────────────────────────────────────────

function cleanText(v: string | null | undefined, max = 200): string | null {
  const t = (v ?? '').trim()
  return t ? t.slice(0, max) : null
}

function sanitise(input: StockistInput):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string } {
  const businessName = cleanText(input.businessName)
  if (!businessName) return { ok: false, error: 'Business name is required.' }
  const state = cleanText(input.state, 10)?.toUpperCase() ?? null
  if (state && !AU_STATES.includes(state as (typeof AU_STATES)[number])) {
    return { ok: false, error: `State must be one of ${AU_STATES.join(', ')}.` }
  }
  return {
    ok: true,
    row: {
      business_name: businessName,
      suburb: cleanText(input.suburb),
      state,
      phone: cleanText(input.phone, 40),
      website_url: cleanText(input.websiteUrl, 500),
      trade_desk_email: cleanText(input.tradeDeskEmail, 200),
    },
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listStockists(manufacturerId: string): Promise<StockistListResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  const { data, error } = await client.supabase
    .from('manufacturer_stockists')
    .select('*')
    .eq('manufacturer_id', manufacturerId)
    .eq('archived', false)
    .order('state', { ascending: true })
    .order('business_name', { ascending: true })

  if (error) {
    if (isMissingSchemaError(error)) {
      return { ok: false, error: friendlyDbError(error.message), missingSchema: true }
    }
    return { ok: false, error: error.message }
  }

  const rows = (data ?? []) as (Omit<StockistRecord, 'card_ids'> & Record<string, unknown>)[]
  const ids = rows.map((r) => r.id)
  let linksByStockist = new Map<string, string[]>()
  if (ids.length > 0) {
    const { data: links, error: linksError } = await client.supabase
      .from('manufacturer_stockist_cards')
      .select('stockist_id, card_id')
      .in('stockist_id', ids)
    if (!linksError) {
      linksByStockist = new Map()
      for (const l of (links ?? []) as { stockist_id: string; card_id: string }[]) {
        const arr = linksByStockist.get(l.stockist_id) ?? []
        arr.push(l.card_id)
        linksByStockist.set(l.stockist_id, arr)
      }
    }
  }

  return {
    ok: true,
    stockists: rows.map((r) => ({
      ...(r as Omit<StockistRecord, 'card_ids'>),
      card_ids: linksByStockist.get(r.id) ?? [],
    })),
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createStockist(
  manufacturerId: string,
  input: StockistInput,
): Promise<StockistActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  const clean = sanitise(input)
  if (!clean.ok) return clean

  const { error } = await client.supabase
    .from('manufacturer_stockists')
    .insert({ manufacturer_id: manufacturerId, ...clean.row })

  if (error) return { ok: false, error: friendlyDbError(error.message) }
  revalidatePath('/manufacturer/stockists')
  return { ok: true }
}

// ─── Bulk import (CSV) ──────────────────────────────────────────────────────────
// The client parses the CSV → StockistInput[] and posts it here. Each row is
// validated with the same sanitiser as single-add; invalid rows are skipped
// (reported back), valid rows are inserted in one batch.

export async function importStockists(
  manufacturerId: string,
  inputs: StockistInput[],
): Promise<StockistImportResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { ok: false, error: 'No rows found in the CSV.' }
  }
  if (inputs.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `Too many rows (${inputs.length}). Import up to ${MAX_IMPORT_ROWS} at a time.` }
  }

  const rows: Record<string, unknown>[] = []
  const skipped: { row: number; reason: string }[] = []
  inputs.forEach((input, i) => {
    const clean = sanitise(input)
    if (!clean.ok) {
      skipped.push({ row: i + 1, reason: clean.error }) // row 1 = first data row
      return
    }
    rows.push({ manufacturer_id: manufacturerId, ...clean.row })
  })

  if (rows.length === 0) return { ok: true, inserted: 0, skipped }

  const { error } = await client.supabase.from('manufacturer_stockists').insert(rows)
  if (error) return { ok: false, error: friendlyDbError(error.message) }

  revalidatePath('/manufacturer/stockists')
  return { ok: true, inserted: rows.length, skipped }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateStockist(
  manufacturerId: string,
  stockistId: string,
  input: StockistInput,
): Promise<StockistActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  const clean = sanitise(input)
  if (!clean.ok) return clean

  const { error } = await client.supabase
    .from('manufacturer_stockists')
    .update({ ...clean.row, updated_at: new Date().toISOString() })
    .eq('id', stockistId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }
  revalidatePath('/manufacturer/stockists')
  return { ok: true }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteStockist(
  manufacturerId: string,
  stockistId: string,
): Promise<StockistActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  const { error } = await client.supabase
    .from('manufacturer_stockists')
    .delete()
    .eq('id', stockistId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: friendlyDbError(error.message) }
  revalidatePath('/manufacturer/stockists')
  return { ok: true }
}

// ─── Card links (per-card override) ───────────────────────────────────────────
// Default: all_cards = true → stockist appears on every card. Turning it off
// replaces the link set with the given card ids.

export async function setStockistCards(
  manufacturerId: string,
  stockistId: string,
  opts: { allCards: boolean; cardIds: string[] },
): Promise<StockistActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  const client = makeClient()
  if (!client.ok) return { ok: false, error: client.error }

  const { error: updateError } = await client.supabase
    .from('manufacturer_stockists')
    .update({ all_cards: opts.allCards, updated_at: new Date().toISOString() })
    .eq('id', stockistId)
    .eq('manufacturer_id', manufacturerId)
  if (updateError) return { ok: false, error: friendlyDbError(updateError.message) }

  // Replace the override set (harmless when allCards = true — keeps any
  // previous selection around as a starting point next time it's toggled off).
  const { error: deleteError } = await client.supabase
    .from('manufacturer_stockist_cards')
    .delete()
    .eq('stockist_id', stockistId)
  if (deleteError) return { ok: false, error: friendlyDbError(deleteError.message) }

  if (!opts.allCards && opts.cardIds.length > 0) {
    const { error: insertError } = await client.supabase
      .from('manufacturer_stockist_cards')
      .insert(opts.cardIds.map((cardId) => ({ stockist_id: stockistId, card_id: cardId })))
    if (insertError) return { ok: false, error: friendlyDbError(insertError.message) }
  }

  revalidatePath('/manufacturer/stockists')
  return { ok: true }
}
