// Tokenised share URL: /s/<token> → 302 to the card's canonical URL,
// recording a share_open event (channel + sender tag come from the link).
// Unknown tokens land on the home page rather than erroring.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { deviceHash, recordCardEvent } from '@/lib/data/cardEvents'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = createStudioServiceClient()
    const { data: link } = await supabase
      .from('card_share_links')
      .select('id, manufacturer_id, card_id, card_slug, channel, sender_tag')
      .eq('token', params.token)
      .maybeSingle()

    if (!link) return NextResponse.redirect(ORIGIN, 302)

    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('slug')
      .eq('id', link.manufacturer_id)
      .single()

    await recordCardEvent({
      manufacturer_id: link.manufacturer_id,
      card_id: link.card_id,
      card_slug: link.card_slug,
      event_type: 'share_open',
      channel: link.channel,
      sender_tag: link.sender_tag,
      share_token: params.token,
      host_domain: req.headers.get('referer')?.slice(0, 200) ?? null,
      device_hash: deviceHash(req),
    })

    const target = manufacturer
      ? `${ORIGIN}/cards/${manufacturer.slug}/${link.card_slug}`
      : ORIGIN
    return NextResponse.redirect(target, 302)
  } catch {
    return NextResponse.redirect(ORIGIN, 302)
  }
}
