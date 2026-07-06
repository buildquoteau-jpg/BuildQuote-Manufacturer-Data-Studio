// Shared helpers for the public tracking endpoints (/api/beacon, /s/[token],
// /api/doc-click, /api/share). Service-role writes; everything fails soft —
// tracking must never break a card.

import { createHash, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'

/** One-way "unique-ish device" hash: sha256(ip|user-agent), truncated.
 *  No cookies, no raw IP/UA stored. */
export function deviceHash(req: NextRequest): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? 'unknown'
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 24)
}

export function newShareToken(): string {
  return randomBytes(9).toString('base64url') // 12 chars, URL-safe
}

export type CardEventInsert = {
  manufacturer_id: string
  card_id?: string | null
  card_slug: string
  version?: number | null
  event_type: 'view' | 'share_open' | 'doc_click'
  channel?: string | null
  sender_tag?: string | null
  share_token?: string | null
  host_domain?: string | null
  doc_label?: string | null
  doc_url?: string | null
  device_hash?: string | null
}

/** Insert an event; swallows every error (missing migration, bad env…). */
export async function recordCardEvent(event: CardEventInsert): Promise<void> {
  try {
    const supabase = createStudioServiceClient()
    await supabase.from('card_events').insert(event)
  } catch {
    // fail silent — analytics must never break a card
  }
}

/** Resolve manufacturer id + card id from public slugs. Null when unknown. */
export async function resolveCardBySlugs(
  manufacturerSlug: string,
  cardSlug: string,
): Promise<{ manufacturerId: string; cardId: string | null } | null> {
  try {
    const supabase = createStudioServiceClient()
    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id')
      .eq('slug', manufacturerSlug)
      .single()
    if (!manufacturer) return null
    const { data: card } = await supabase
      .from('staged_systems')
      .select('id')
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', cardSlug)
      .limit(1)
      .maybeSingle()
    return { manufacturerId: manufacturer.id, cardId: card?.id ?? null }
  } catch {
    return null
  }
}
