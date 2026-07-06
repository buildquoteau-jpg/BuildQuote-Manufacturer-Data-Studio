// Lightweight view beacon — included in hosted card pages AND the static
// package. Sends card slug, version, host domain, timestamp. No cookies, no
// personal data (device_hash is a one-way IP|UA hash). Always answers 204 —
// tracking failures are invisible to the card.
//
//   POST /api/beacon  {"m":"<mfr-slug>","slug":"<card-slug>","version":1,"host":"example.com.au"}
//   GET  /api/beacon?m=…&slug=…&version=…&host=…   (1px-style fallback)

import { NextRequest, NextResponse } from 'next/server'
import { deviceHash, recordCardEvent, resolveCardBySlugs } from '@/lib/data/cardEvents'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function handle(req: NextRequest, input: {
  m?: string | null; slug?: string | null; version?: number | null; host?: string | null
}) {
  const m = input.m?.trim()
  const slug = input.slug?.trim()
  if (m && slug) {
    const resolved = await resolveCardBySlugs(m, slug)
    if (resolved) {
      await recordCardEvent({
        manufacturer_id: resolved.manufacturerId,
        card_id: resolved.cardId,
        card_slug: slug,
        version: input.version ?? null,
        event_type: 'view',
        host_domain: (input.host ?? '').slice(0, 200) || null,
        device_hash: deviceHash(req),
      })
    }
  }
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* ignore */ }
  const version = Number.parseInt(String(body.version ?? ''), 10)
  return handle(req, {
    m: typeof body.m === 'string' ? body.m : null,
    slug: typeof body.slug === 'string' ? body.slug : null,
    version: Number.isFinite(version) ? version : null,
    host: typeof body.host === 'string' ? body.host : null,
  })
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const version = Number.parseInt(p.get('version') ?? '', 10)
  return handle(req, {
    m: p.get('m'),
    slug: p.get('slug'),
    version: Number.isFinite(version) ? version : null,
    host: p.get('host'),
  })
}
