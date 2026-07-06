// Create a tokenised share link from a card's share buttons (public — cards
// travel, so this cannot require a session). Sender tags are workspace-only;
// public creations are untagged.
//
//   POST /api/share {"m":"<mfr-slug>","slug":"<card-slug>","channel":"copy|sms|email"}
//   → {"url":"https://studio…/s/<token>"}
//
// Fails soft: on any error the caller falls back to sharing the canonical
// URL directly (untracked but working).

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { newShareToken, resolveCardBySlugs } from '@/lib/data/cardEvents'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* ignore */ }
    const m = typeof body.m === 'string' ? body.m.trim() : ''
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const channelRaw = typeof body.channel === 'string' ? body.channel : 'copy'
    const channel = ['copy', 'sms', 'email'].includes(channelRaw) ? channelRaw : 'copy'
    if (!m || !slug) {
      return NextResponse.json({ error: 'Missing m or slug' }, { status: 400, headers: CORS_HEADERS })
    }

    const resolved = await resolveCardBySlugs(m, slug)
    if (!resolved) {
      return NextResponse.json({ error: 'Unknown card' }, { status: 404, headers: CORS_HEADERS })
    }

    const token = newShareToken()
    const supabase = createStudioServiceClient()
    const { error } = await supabase.from('card_share_links').insert({
      manufacturer_id: resolved.manufacturerId,
      card_id: resolved.cardId,
      card_slug: slug,
      token,
      channel,
      sender_tag: null, // public creations are never tagged
    })
    if (error) {
      return NextResponse.json({ error: 'Share links unavailable' }, { status: 503, headers: CORS_HEADERS })
    }

    return NextResponse.json({ url: `${ORIGIN}/s/${token}` }, { headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: CORS_HEADERS })
  }
}
