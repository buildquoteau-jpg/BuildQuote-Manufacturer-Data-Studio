// Public JSON-LD knowledge object for one system — the AI-facing sibling of
// /api/cards/[slug]/card.json. See design doc §11.
//
//   GET /api/cards/<card-slug>/knowledge.jsonld?m=<manufacturer-slug>[&v=<version>]
//
// No ?v= — generated live from canonical staged_* data (buildFromCanonical).
// ?v=<n> — generated from the immutable card_versions snapshot for that
//          version (buildFromCardVersion); lower fidelity until step 8
//          (freeze knowledge_json at publish) lands — see that function's
//          own comment.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import { buildFromCanonical, buildFromCardVersion } from '@/lib/knowledge/buildSystemKnowledge'
import { resolveKnowledgeAccess, KNOWLEDGE_CORS_HEADERS } from '@/lib/knowledge/access'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: KNOWLEDGE_CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  await resolveKnowledgeAccess(req) // no-op today — see lib/knowledge/access.ts

  try {
    const cardSlug = params.slug?.trim()
    const manufacturerSlug = req.nextUrl.searchParams.get('m')?.trim()
    const versionParam = req.nextUrl.searchParams.get('v')
    const version = versionParam ? Number.parseInt(versionParam, 10) : undefined
    if (!cardSlug || !manufacturerSlug || (versionParam && !Number.isFinite(version))) {
      return NextResponse.json(
        { error: 'Missing card slug or manufacturer (?m=) parameter' },
        { status: 400, headers: KNOWLEDGE_CORS_HEADERS },
      )
    }

    if (version != null) {
      const supabase = createStudioServiceClient()
      const { data: manufacturer } = await supabase
        .from('data_studio_manufacturers')
        .select('id')
        .eq('slug', manufacturerSlug)
        .single()
      if (!manufacturer) {
        return NextResponse.json({ error: 'Unknown manufacturer' }, { status: 404, headers: KNOWLEDGE_CORS_HEADERS })
      }
      const { data: row } = await supabase
        .from('card_versions')
        .select('card_json, validated_by, validated_at, knowledge_json')
        .eq('manufacturer_id', manufacturer.id)
        .eq('slug', cardSlug)
        .eq('version', version)
        .maybeSingle()
      if (!row) {
        return NextResponse.json({ error: 'Unknown card version' }, { status: 404, headers: KNOWLEDGE_CORS_HEADERS })
      }
      // Prefer the frozen object (design doc §14 step 11) — full provenance,
      // guaranteed to match what was published. Only reconstruct the lower-
      // fidelity structural version for a card published before migration
      // 065 existed, or before this environment applied it.
      const obj = row.knowledge_json ?? buildFromCardVersion(row.card_json, {
        manufacturerSlug, cardSlug, version,
        validatedBy: row.validated_by, validatedAt: row.validated_at,
      })
      return NextResponse.json(obj, { headers: { ...KNOWLEDGE_CORS_HEADERS, 'Content-Type': 'application/ld+json' } })
    }

    const bundle = await fetchCanonicalSystemBundle(manufacturerSlug, cardSlug)
    if (!bundle) {
      return NextResponse.json({ error: 'Unknown card' }, { status: 404, headers: KNOWLEDGE_CORS_HEADERS })
    }
    const obj = buildFromCanonical(bundle)
    return NextResponse.json(obj, { headers: { ...KNOWLEDGE_CORS_HEADERS, 'Content-Type': 'application/ld+json' } })
  } catch (err) {
    console.error('Knowledge JSON-LD feed error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: KNOWLEDGE_CORS_HEADERS })
  }
}
