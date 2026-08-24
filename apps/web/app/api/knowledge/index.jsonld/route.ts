// Crawl entry point for the knowledge layer — every published (manufacturer-
// verified) card, with its canonical knowledge.jsonld URL. Design doc §11.

import { NextRequest, NextResponse } from 'next/server'
import { fetchPublishedCardIndex } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import { resolveKnowledgeAccess, KNOWLEDGE_CORS_HEADERS } from '@/lib/knowledge/access'
import { KNOWLEDGE_CONTEXT, KNOWLEDGE_FORMAT_VERSION } from '@/lib/knowledge/vocabulary'

export const dynamic = 'force-dynamic'

const STUDIO_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au').replace(/\/$/, '')

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: KNOWLEDGE_CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  await resolveKnowledgeAccess(req)
  try {
    const cards = await fetchPublishedCardIndex()
    return NextResponse.json(
      {
        '@context': KNOWLEDGE_CONTEXT,
        '@id': `${STUDIO_ORIGIN}/api/knowledge/index.jsonld`,
        'bq:formatVersion': KNOWLEDGE_FORMAT_VERSION,
        'bq:generatedAt': new Date().toISOString(),
        'bq:cardCount': cards.length,
        'bq:cards': cards.map((c) => ({
          name: c.name,
          manufacturer: c.manufacturerName,
          'bq:canonicalUrl': `${STUDIO_ORIGIN}/cards/${c.manufacturerSlug}/${c.cardSlug}`,
          'bq:knowledgeUrl': `${STUDIO_ORIGIN}/api/cards/${c.cardSlug}/knowledge.jsonld?m=${c.manufacturerSlug}`,
          'bq:updatedAt': c.updatedAt,
        })),
      },
      { headers: { ...KNOWLEDGE_CORS_HEADERS, 'Content-Type': 'application/ld+json' } },
    )
  } catch (err) {
    console.error('Knowledge index error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: KNOWLEDGE_CORS_HEADERS })
  }
}
