// Semantic search over system-card containers (Step 7 retrieval).
//
// POST { query, manufacturerId?, matchCount? } → embeds the query with Voyage
// (input_type='query', same model/dim as the stored document embeddings) and
// calls the match_card_sources RPC (migration 052). Returns citable spans:
// card_id, version, content, similarity. Admin/reviewer only.
//
// Requires VOYAGE_API_KEY; returns 503 when embeddings aren't configured.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5'
const VOYAGE_DIM = Number(process.env.VOYAGE_DIM || '1024')

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
  const manufacturerId = body?.manufacturerId ?? null
  const matchCount = Math.min(Math.max(Number(body?.matchCount ?? 8), 1), 50)
  if (!query) {
    return NextResponse.json({ error: 'query is required.' }, { status: 400 })
  }

  const key = process.env.VOYAGE_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'Embeddings not configured (VOYAGE_API_KEY).' }, { status: 503 })
  }

  // Embed the query text.
  let embedding: number[] | undefined
  try {
    const r = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: [query],
        model: VOYAGE_MODEL,
        input_type: 'query',
        output_dimension: VOYAGE_DIM,
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      return NextResponse.json({ error: `Embedding failed (${r.status}) ${detail}`.trim() }, { status: 502 })
    }
    const j = (await r.json()) as { data?: { embedding: number[] }[] }
    embedding = j.data?.[0]?.embedding
  } catch (e) {
    return NextResponse.json(
      { error: `Embedding request failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    )
  }
  if (!embedding || embedding.length === 0) {
    return NextResponse.json({ error: 'Embedding provider returned no vector.' }, { status: 502 })
  }

  const supabase = createStudioServerClient()
  // pgvector accepts its text form '[...]'; PostgREST casts to vector(1024).
  const { data, error } = await supabase.rpc('match_card_sources', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: matchCount,
    filter_manufacturer: manufacturerId,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, matches: data ?? [] })
}
