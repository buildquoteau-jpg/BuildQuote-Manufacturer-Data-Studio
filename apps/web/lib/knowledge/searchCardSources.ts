// Shared semantic-search-over-published-cards logic (migration 052's
// match_card_sources RPC over card_embeddings). Extracted out of
// /api/admin/card-search so a second, public caller (the AI Knowledge Gap
// pipeline's /api/knowledge/ask, stage 3 retrieval) can reuse the exact
// same embedding+RPC path rather than a parallel implementation — the admin
// route's behavior is unchanged, it just calls this function now.
//
// card_embeddings is populated only from published card_versions content,
// so this always searches published/public material, never a manufacturer's
// unpublished draft — the right scope for a public-facing answer endpoint.
//
// Uses the service-role client deliberately: card_embeddings' RLS only
// grants SELECT to an authenticated manufacturer's own rows or BuildQuote
// staff (migration 052) — there is no anon policy. The public
// /api/knowledge/ask route has no session at all, so a session-scoped
// client would silently return zero rows for every caller. Reading with the
// service client here is the same pattern the public knowledge.jsonld route
// already uses to read canonical data past RLS, and is safe because the
// only rows ever in this table are published/public card content.
//
// Degrades to a "not configured" result (never throws) when VOYAGE_API_KEY
// is absent, matching this codebase's standing graceful-degradation
// convention — a knowledge-gap pipeline stage should skip, not crash, when
// an optional dependency isn't set up in this environment yet.

import { createStudioServiceClient } from '@/lib/supabase/service'

const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5'
const VOYAGE_DIM = Number(process.env.VOYAGE_DIM || '1024')

export type CardSourceMatch = {
  card_id: string
  manufacturer_id: string
  version: number
  source_role: string | null
  page_start: number | null
  page_end: number | null
  content: string
  similarity: number
}

export type CardSourceSearchResult =
  | { ok: true; configured: true; matches: CardSourceMatch[] }
  | { ok: true; configured: false; reason: string }  // e.g. no VOYAGE_API_KEY — not an error, a skip
  | { ok: false; error: string }

export async function searchCardSources(
  query: string,
  opts?: { manufacturerId?: string | null; matchCount?: number },
): Promise<CardSourceSearchResult> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) {
    return { ok: true, configured: false, reason: 'Embeddings not configured (VOYAGE_API_KEY).' }
  }

  const matchCount = Math.min(Math.max(opts?.matchCount ?? 8, 1), 50)

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
      return { ok: false, error: `Embedding failed (${r.status}) ${detail}`.trim() }
    }
    const j = (await r.json()) as { data?: { embedding: number[] }[] }
    embedding = j.data?.[0]?.embedding
  } catch (e) {
    return { ok: false, error: `Embedding request failed: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!embedding || embedding.length === 0) {
    return { ok: false, error: 'Embedding provider returned no vector.' }
  }

  const supabase = createStudioServiceClient()
  const { data, error } = await supabase.rpc('match_card_sources', {
    query_embedding: `[${embedding.join(',')}]`,
    match_count: matchCount,
    filter_manufacturer: opts?.manufacturerId ?? null,
  })
  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, configured: true, matches: (data ?? []) as CardSourceMatch[] }
}
