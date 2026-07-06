'use server'

// Card analytics for the manufacturer workspace (card_events +
// card_share_links, migration 050). Read side of the tracking endpoints;
// aggregation happens here in JS — volumes are small (one manufacturer,
// 90-day window).

import { randomBytes } from 'crypto'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

// ─── Auth gate (house pattern) ────────────────────────────────────────────────

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

function isMissingSchemaError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === '42703') return true
  return /does not exist/i.test(err.message ?? '')
}

// ─── Analytics summary ────────────────────────────────────────────────────────

export type CardAnalyticsRow = {
  cardSlug: string
  views: number
  uniqueDevices: number
  shareOpens: number
  docClicks: number
}

export type ShareBreakdownRow = {
  channel: string
  senderTag: string | null
  created: number
  opens: number
}

export type AnalyticsData = {
  days: number
  totals: { views: number; uniqueDevices: number; shareOpens: number; docClicks: number; sharesCreated: number }
  byCard: CardAnalyticsRow[]
  shares: ShareBreakdownRow[]
  viewsByDay: { date: string; views: number }[]
  topDocs: { label: string; url: string; clicks: number }[]
}

export type AnalyticsResult =
  | { ok: true; data: AnalyticsData }
  | { ok: false; error: string; missingSchema?: boolean }

export async function getCardAnalytics(
  manufacturerId: string,
  opts: { days?: number; cardSlug?: string } = {},
): Promise<AnalyticsResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const days = opts.days === 90 ? 90 : 30
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let eventsQuery = supabase
    .from('card_events')
    .select('card_slug, event_type, channel, sender_tag, device_hash, doc_label, doc_url, created_at')
    .eq('manufacturer_id', manufacturerId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(20000)
  if (opts.cardSlug) eventsQuery = eventsQuery.eq('card_slug', opts.cardSlug)
  const { data: eventRows, error: eventsError } = await eventsQuery
  if (eventsError) {
    if (isMissingSchemaError(eventsError)) {
      return { ok: false, error: 'Analytics tables are not set up yet (migration 050 has not been applied).', missingSchema: true }
    }
    return { ok: false, error: eventsError.message }
  }
  const events = (eventRows ?? []) as {
    card_slug: string; event_type: string; channel: string | null; sender_tag: string | null
    device_hash: string | null; doc_label: string | null; doc_url: string | null; created_at: string
  }[]

  let linksQuery = supabase
    .from('card_share_links')
    .select('card_slug, channel, sender_tag, token, created_at')
    .eq('manufacturer_id', manufacturerId)
    .gte('created_at', sinceIso)
  if (opts.cardSlug) linksQuery = linksQuery.eq('card_slug', opts.cardSlug)
  const { data: linkRows } = await linksQuery
  const links = (linkRows ?? []) as { card_slug: string; channel: string; sender_tag: string | null; token: string; created_at: string }[]

  // ── Aggregate ──
  const byCard = new Map<string, CardAnalyticsRow & { devices: Set<string> }>()
  const forCard = (slug: string) => {
    if (!byCard.has(slug)) byCard.set(slug, { cardSlug: slug, views: 0, uniqueDevices: 0, shareOpens: 0, docClicks: 0, devices: new Set() })
    return byCard.get(slug)!
  }
  const allDevices = new Set<string>()
  const viewsByDay = new Map<string, number>()
  const docs = new Map<string, { label: string; url: string; clicks: number }>()
  let views = 0, shareOpens = 0, docClicks = 0

  for (const e of events) {
    const row = forCard(e.card_slug)
    if (e.device_hash) { row.devices.add(e.device_hash); allDevices.add(e.device_hash) }
    if (e.event_type === 'view') {
      views++; row.views++
      const day = e.created_at.slice(0, 10)
      viewsByDay.set(day, (viewsByDay.get(day) ?? 0) + 1)
    } else if (e.event_type === 'share_open') {
      shareOpens++; row.shareOpens++
    } else if (e.event_type === 'doc_click') {
      docClicks++; row.docClicks++
      const key = `${e.doc_label ?? ''}|${e.doc_url ?? ''}`
      if (!docs.has(key)) docs.set(key, { label: e.doc_label ?? 'Document', url: e.doc_url ?? '', clicks: 0 })
      docs.get(key)!.clicks++
    }
  }

  // Shares by channel + sender: created (links) and opens (events)
  const shareMap = new Map<string, ShareBreakdownRow>()
  const shareKey = (channel: string | null, sender: string | null) => `${channel ?? 'copy'}|${sender ?? ''}`
  for (const l of links) {
    const key = shareKey(l.channel, l.sender_tag)
    if (!shareMap.has(key)) shareMap.set(key, { channel: l.channel, senderTag: l.sender_tag, created: 0, opens: 0 })
    shareMap.get(key)!.created++
  }
  for (const e of events) {
    if (e.event_type !== 'share_open') continue
    const key = shareKey(e.channel, e.sender_tag)
    if (!shareMap.has(key)) shareMap.set(key, { channel: e.channel ?? 'copy', senderTag: e.sender_tag, created: 0, opens: 0 })
    shareMap.get(key)!.opens++
  }

  // Fill missing days so the line chart has a continuous x-axis.
  const series: { date: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    series.push({ date, views: viewsByDay.get(date) ?? 0 })
  }

  return {
    ok: true,
    data: {
      days,
      totals: {
        views,
        uniqueDevices: allDevices.size,
        shareOpens,
        docClicks,
        sharesCreated: links.length,
      },
      byCard: Array.from(byCard.values())
        .map(({ devices, ...row }) => ({ ...row, uniqueDevices: devices.size }))
        .sort((a, b) => b.views - a.views),
      shares: Array.from(shareMap.values()).sort((a, b) => b.created + b.opens - (a.created + a.opens)),
      viewsByDay: series,
      topDocs: Array.from(docs.values()).sort((a, b) => b.clicks - a.clicks).slice(0, 12),
    },
  }
}

// ─── Tagged share links (workspace-created, e.g. per rep) ────────────────────

export type CreateShareLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function createTaggedShareLink(
  manufacturerId: string,
  input: { cardId: string; channel: 'copy' | 'sms' | 'email'; senderTag: string | null },
): Promise<CreateShareLinkResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const { data: card } = await supabase
    .from('staged_systems')
    .select('id, slug, name')
    .eq('id', input.cardId)
    .eq('manufacturer_id', manufacturerId)
    .single()
  if (!card) return { ok: false, error: 'Card not found.' }
  const slug = (card.slug ?? '').trim()
  if (!slug) return { ok: false, error: 'This card has no permanent slug yet — generate a package first to lock its URL.' }

  const token = randomBytes(9).toString('base64url')
  const { error } = await supabase.from('card_share_links').insert({
    manufacturer_id: manufacturerId,
    card_id: card.id,
    card_slug: slug,
    token,
    channel: input.channel,
    sender_tag: input.senderTag?.trim().slice(0, 80) || null,
  })
  if (error) {
    if (isMissingSchemaError(error)) {
      return { ok: false, error: 'Share-link tables are not set up yet (migration 050 has not been applied).' }
    }
    return { ok: false, error: error.message }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'
  return { ok: true, url: `${origin}/s/${token}` }
}
