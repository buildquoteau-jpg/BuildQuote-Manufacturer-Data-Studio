// Doc click-through tracking redirect (source documents, install guides…).
//
//   GET /api/doc-click?m=<mfr>&slug=<card>&label=<label>&u=<encoded url>
//
// OPEN-REDIRECT GUARD: the target must be one of the card's known document
// URLs (latest card_versions snapshot, falling back to staged_systems).
// Anything else gets 400 — this endpoint never redirects to arbitrary URLs.

import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { deviceHash, recordCardEvent } from '@/lib/data/cardEvents'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'

export const dynamic = 'force-dynamic'

function knownDocUrls(system: Partial<SystemCardSystem> & Record<string, unknown>): Set<string> {
  const urls = new Set<string>()
  const add = (u: unknown) => { if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) urls.add(u.trim()) }
  add(system.website_url)
  add(system.design_guide_url)
  add(system.tech_data_url)
  add((system as Record<string, unknown>).source_url)
  for (const g of (Array.isArray(system.install_guide_urls) ? system.install_guide_urls : []) as { url?: string }[]) add(g?.url)
  return urls
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const m = p.get('m')?.trim()
  const slug = p.get('slug')?.trim()
  const label = p.get('label')?.trim() ?? null
  const target = p.get('u')?.trim()

  if (!m || !slug || !target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  try {
    const supabase = createStudioServiceClient()
    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id')
      .eq('slug', m)
      .single()
    if (!manufacturer) return NextResponse.json({ error: 'Unknown manufacturer' }, { status: 404 })

    // Latest snapshot first (what shipped on the card), live row as fallback.
    let allowed = new Set<string>()
    let cardId: string | null = null
    const { data: version } = await supabase
      .from('card_versions')
      .select('card_id, card_json')
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', slug)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (version) {
      cardId = version.card_id
      allowed = knownDocUrls(version.card_json as SystemCardSystem)
    } else {
      const { data: staged } = await supabase
        .from('staged_systems')
        .select('id, website_url, design_guide_url, tech_data_url, source_url, install_guide_urls')
        .eq('manufacturer_id', manufacturer.id)
        .eq('slug', slug)
        .limit(1)
        .maybeSingle()
      if (staged) {
        cardId = staged.id
        allowed = knownDocUrls(staged as Record<string, unknown>)
      }
    }

    if (!allowed.has(target)) {
      return NextResponse.json({ error: 'Unknown document for this card' }, { status: 400 })
    }

    await recordCardEvent({
      manufacturer_id: manufacturer.id,
      card_id: cardId,
      card_slug: slug,
      event_type: 'doc_click',
      doc_label: label?.slice(0, 120) ?? null,
      doc_url: target.slice(0, 500),
      host_domain: req.headers.get('referer')?.slice(0, 200) ?? null,
      device_hash: deviceHash(req),
    })

    return NextResponse.redirect(target, 302)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
