// Token-signed, read-only Agent Review endpoint for manufacturer AI agents.
//
//   GET /api/agent-review/<systemId>?token=<hmac>&exp=<unix>[&format=jsonld|markdown]
//
// Lets a manufacturer point their own company-trained AI agent (ChatGPT Enterprise,
// Claude, Microsoft Copilot, Gemini, or internal RAG/MCP agent) straight at the
// live JSON-LD or Markdown knowledge object — even before the card is published —
// without sharing studio logins or making a human wade through raw JSON.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import { buildFromCanonical } from '@/lib/knowledge/buildSystemKnowledge'
import { renderKnowledgeMarkdown } from '@/lib/knowledge/renderKnowledgeMarkdown'
import { verifyAgentReviewToken } from '@/lib/knowledge/agentReviewToken'
import { KNOWLEDGE_CORS_HEADERS } from '@/lib/knowledge/access'

export const dynamic = 'force-dynamic'

const REVIEW_HEADERS = {
  ...KNOWLEDGE_CORS_HEADERS,
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: REVIEW_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { systemId: string } },
) {
  const { systemId } = params
  const token = req.nextUrl.searchParams.get('token')
  const exp = req.nextUrl.searchParams.get('exp')
  const format = req.nextUrl.searchParams.get('format') === 'markdown' ? 'markdown' : 'jsonld'

  const check = verifyAgentReviewToken(systemId, token, exp)
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 401, headers: REVIEW_HEADERS })
  }

  try {
    const supabase = createStudioServiceClient()
    const { data: sysRow } = await supabase
      .from('staged_systems')
      .select('slug, manufacturer_id')
      .eq('id', systemId)
      .maybeSingle()

    const sys = sysRow as { slug: string | null; manufacturer_id: string } | null
    if (!sys?.slug) {
      return NextResponse.json(
        { error: 'System not found or not yet ready for knowledge export.' },
        { status: 404, headers: REVIEW_HEADERS },
      )
    }

    const { data: mfrRow } = await supabase
      .from('data_studio_manufacturers')
      .select('slug')
      .eq('id', sys.manufacturer_id)
      .maybeSingle()

    const mfrSlug = (mfrRow as { slug: string | null } | null)?.slug
    if (!mfrSlug) {
      return NextResponse.json({ error: 'Manufacturer not found.' }, { status: 404, headers: REVIEW_HEADERS })
    }

    const bundle = await fetchCanonicalSystemBundle(mfrSlug, sys.slug)
    if (!bundle) {
      return NextResponse.json({ error: 'Could not assemble system knowledge.' }, { status: 404, headers: REVIEW_HEADERS })
    }

    const knowledgeObject = buildFromCanonical(bundle)

    if (format === 'markdown') {
      const md = renderKnowledgeMarkdown(knowledgeObject)
      return new NextResponse(md, {
        status: 200,
        headers: {
          ...REVIEW_HEADERS,
          'Content-Type': 'text/markdown; charset=utf-8',
        },
      })
    }

    return NextResponse.json(knowledgeObject, {
      status: 200,
      headers: {
        ...REVIEW_HEADERS,
        'Content-Type': 'application/ld+json; charset=utf-8',
      },
    })
  } catch (err) {
    console.error('[agent-review] error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: REVIEW_HEADERS },
    )
  }
}
