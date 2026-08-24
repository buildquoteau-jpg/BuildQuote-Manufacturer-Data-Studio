// Access seam for the knowledge-layer routes (design doc §11 / §15 access
// decision: fully open now, protectable later without a rewrite).
//
// Every knowledge route calls this first. Today it is unconditional — no
// route branches on the result. When keys/rate-limits are wanted later, this
// function (plus an api_keys table) is the only thing that changes; the
// routes, generator and object shape stay untouched.

export type KnowledgeAccess = { tier: 'public' }

export async function resolveKnowledgeAccess(_req: Request): Promise<KnowledgeAccess> {
  return { tier: 'public' }
}

export const KNOWLEDGE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
} as const
