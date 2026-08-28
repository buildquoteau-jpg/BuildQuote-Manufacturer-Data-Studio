// Semantic search over system-card containers (Step 7 retrieval).
//
// POST { query, manufacturerId?, matchCount? } → embeds the query with Voyage
// and calls the match_card_sources RPC (migration 052) via the shared
// searchCardSources() helper (lib/knowledge/searchCardSources.ts) — the same
// function the public /api/knowledge/ask route's semantic-search stage uses.
// Returns citable spans: card_id, version, content, similarity.
// Admin/reviewer only.
//
// Requires VOYAGE_API_KEY; returns 503 when embeddings aren't configured.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { searchCardSources } from '@/lib/knowledge/searchCardSources'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin' && session.globalRole !== 'buildquote_reviewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    query?: string
    manufacturerId?: string | null
    matchCount?: number
  } | null

  const query = body?.query?.trim()
  if (!query) {
    return NextResponse.json({ error: 'query is required.' }, { status: 400 })
  }

  const result = await searchCardSources(query, { manufacturerId: body?.manufacturerId, matchCount: body?.matchCount })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  if (!result.configured) {
    return NextResponse.json({ error: result.reason }, { status: 503 })
  }

  return NextResponse.json({ ok: true, matches: result.matches })
}
