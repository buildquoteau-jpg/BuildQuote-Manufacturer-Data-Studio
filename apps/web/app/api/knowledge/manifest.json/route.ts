// Machine description of the knowledge layer's own surface — endpoints,
// vocabulary location, licence, current status semantics. Design doc §11.
// Static content, no DB reads — safe to cache hard.

import { NextRequest, NextResponse } from 'next/server'
import { resolveKnowledgeAccess, KNOWLEDGE_CORS_HEADERS } from '@/lib/knowledge/access'
import {
  BQ_NAMESPACE,
  KNOWLEDGE_FORMAT,
  KNOWLEDGE_FORMAT_VERSION,
} from '@/lib/knowledge/vocabulary'

const STUDIO_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au').replace(/\/$/, '')

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: KNOWLEDGE_CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  await resolveKnowledgeAccess(req)
  return NextResponse.json(
    {
      format: KNOWLEDGE_FORMAT,
      formatVersion: KNOWLEDGE_FORMAT_VERSION,
      vocabulary: `${STUDIO_ORIGIN}/ns/v1`,
      vocabularyNamespace: BQ_NAMESPACE,
      access: 'public — no key required',
      endpoints: {
        card: `${STUDIO_ORIGIN}/api/cards/{system-slug}/knowledge.jsonld?m={manufacturer-slug}`,
        cardVersioned: `${STUDIO_ORIGIN}/api/cards/{system-slug}/knowledge.jsonld?m={manufacturer-slug}&v={version}`,
        index: `${STUDIO_ORIGIN}/api/knowledge/index.jsonld`,
      },
      statusSemantics: {
        epistemicStatus: [
          'unverified', 'buildquote_checked', 'manufacturer_verified', 'manufacturer_corrected',
          'disputed', 'not_applicable', 'unknown', 'superseded', 'stale',
        ],
        note: 'Only manufacturer_verified and manufacturer_corrected represent a manufacturer statement. disputed, unknown, not_applicable and superseded are never emitted as values — see bq:knowledgeGaps.',
      },
      licence: {
        status: 'pending',
        note: 'bq:dataLicence on every object is currently all-false/pending. This endpoint is published for demonstration and evaluation.',
      },
    },
    { headers: { ...KNOWLEDGE_CORS_HEADERS, 'Content-Type': 'application/json' } },
  )
}
