// Print-ready QR code for a card's CANONICAL hosted URL.
//
//   GET /api/cards/<card-slug>/qr.png?m=<manufacturer-slug>[&size=512]
//
// The static package already ships a per-card qr-code.png pointing at the
// manufacturer-site URL; this endpoint covers the studio-hosted canonical
// URL (/cards/<mfr>/<slug>), which is permanent across edits, renames and
// version changes.

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const cardSlug = params.slug?.trim()
    const manufacturerSlug = req.nextUrl.searchParams.get('m')?.trim()
    const size = Math.min(2048, Math.max(128, Number.parseInt(req.nextUrl.searchParams.get('size') ?? '512', 10) || 512))
    if (!cardSlug || !manufacturerSlug) {
      return NextResponse.json({ error: 'Missing card slug or manufacturer (?m=) parameter' }, { status: 400 })
    }

    // Only issue QR codes for cards that actually exist.
    const supabase = createStudioServiceClient()
    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id, slug')
      .eq('slug', manufacturerSlug)
      .single()
    if (!manufacturer) return NextResponse.json({ error: 'Unknown manufacturer' }, { status: 404 })

    const { data: card } = await supabase
      .from('staged_systems')
      .select('id')
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', cardSlug)
      .limit(1)
      .maybeSingle()
    if (!card) return NextResponse.json({ error: 'Unknown card' }, { status: 404 })

    const target = `${ORIGIN}/cards/${manufacturerSlug}/${cardSlug}`
    const png = await QRCode.toBuffer(target, {
      type: 'png', width: size, margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('Card QR error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
