// Public JSON representation of a card — machine readability.
//
//   GET /api/cards/<card-slug>/card.json?m=<manufacturer-slug>[&v=<version>]
//
// Returns the latest published version by default (or ?v= for a specific
// version), plus current stockists, validation metadata and the canonical
// URL. Same slug + ?m= convention as stockists.json.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getHostedCard } from '@/lib/data/getHostedCard'
import { buildCardJsonLd } from '@/lib/packages/jsonld'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const cardSlug = params.slug?.trim()
    const manufacturerSlug = req.nextUrl.searchParams.get('m')?.trim()
    const versionParam = req.nextUrl.searchParams.get('v')
    const version = versionParam ? Number.parseInt(versionParam, 10) : undefined
    if (!cardSlug || !manufacturerSlug || (versionParam && !Number.isFinite(version))) {
      return NextResponse.json(
        { error: 'Missing card slug or manufacturer (?m=) parameter' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    // Touch the service client early so a missing env fails as a clean 500.
    createStudioServiceClient()

    const card = await getHostedCard(manufacturerSlug, cardSlug, version)
    if (!card) {
      return NextResponse.json({ error: 'Unknown card' }, { status: 404, headers: CORS_HEADERS })
    }

    const canonicalUrl = `${ORIGIN}/cards/${card.manufacturerSlug}/${card.cardSlug}`
    return NextResponse.json(
      {
        format: 'buildquote-system-card',
        version: card.version,
        latest_version: card.latestVersion,
        canonical_url: canonicalUrl,
        versioned_url: `${canonicalUrl}/v/${card.version}`,
        validation: card.validation,
        card: card.system,
        local_stockists: card.stockists,
        json_ld: buildCardJsonLd(card.system, canonicalUrl),
      },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    console.error('Card JSON feed error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
