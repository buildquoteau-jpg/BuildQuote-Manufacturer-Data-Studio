// Public stockist feed for travelling System Cards.
//
//   GET /api/cards/<card-slug>/stockists.json?m=<manufacturer-slug>
//
// Static-package cards (and any embedded/shared card) call this on load to
// refresh their embedded stockist list, falling back silently to the embedded
// data when offline or blocked. CORS is open — the caller is the
// manufacturer's own website, not ours.
//
// Card slugs are only unique per manufacturer, so ?m= is required; the
// package generator bakes the full URL in at build time.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getManufacturerStockists, stockistsForCard } from '@/lib/data/getCardStockists'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // Fresh-ish without hammering the DB from popular cards.
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
    if (!cardSlug || !manufacturerSlug) {
      return NextResponse.json(
        { error: 'Missing card slug or manufacturer (?m=) parameter' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    const supabase = createStudioServiceClient()

    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id')
      .eq('slug', manufacturerSlug)
      .single()
    if (!manufacturer) {
      return NextResponse.json({ error: 'Unknown manufacturer' }, { status: 404, headers: CORS_HEADERS })
    }

    const { data: card } = await supabase
      .from('staged_systems')
      .select('id, slug')
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', cardSlug)
      .limit(1)
      .maybeSingle()
    if (!card) {
      return NextResponse.json({ error: 'Unknown card' }, { status: 404, headers: CORS_HEADERS })
    }

    const { rows, linkedCardIds } = await getManufacturerStockists(supabase, manufacturer.id)
    const stockists = stockistsForCard(rows, linkedCardIds, card.id)

    return NextResponse.json(
      { card: cardSlug, manufacturer: manufacturerSlug, generated_at: new Date().toISOString(), stockists },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    console.error('Card stockists feed error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
