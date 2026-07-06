'use client'

// Hosted (studio-domain) public card page body. Used by:
//   /cards/[mfr]/[slug]            — canonical URL, always the CURRENT version
//   /cards/[mfr]/[slug]/v/[n]      — immutable versioned URL; superseded
//                                    versions show a banner linking forward.
//
// Renders a card_versions snapshot through the master renderer. The shopping
// list works but is scoped per manufacturer like the static package.

import { useEffect } from 'react'
import { ShoppingListProvider, useShoppingList } from './ShoppingListProvider'
import { ShoppingListDrawer } from './ShoppingListDrawer'
import { SystemCardRenderer } from './SystemCardRenderer'
import type { SystemCardSystem, SystemCardStockist, SystemCardTracking, SystemCardValidation } from './types'

const FONT_BODY = "'Barlow', -apple-system, 'Segoe UI', sans-serif"
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'

export type HostedCardPageProps = {
  system: SystemCardSystem
  stockists: SystemCardStockist[]
  validation: SystemCardValidation | null
  manufacturerName: string
  /** Absolute canonical URL of the CURRENT version of this card. */
  canonicalUrl: string
  /** True when this page shows an old version (renders the superseded banner). */
  superseded: boolean
  /** Version being viewed (shown in the banner). */
  version: number | null
  storageKey: string
  /** Share/analytics wiring (share links, view beacon, doc-click tracking). */
  tracking?: SystemCardTracking | null
}

function Body({ data }: { data: HostedCardPageProps }) {
  const { addItems } = useShoppingList()

  // View beacon — same contract as the static package. Silent on failure.
  useEffect(() => {
    const t = data.tracking
    if (!t) return
    try {
      fetch(`${t.apiBase}/api/beacon`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          m: t.manufacturerSlug,
          slug: t.cardSlug,
          version: t.version,
          host: window.location.hostname,
        }),
      }).catch(() => { /* silent */ })
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ fontFamily: FONT_BODY, background: '#f5f7f9', minHeight: '100vh', paddingBottom: '64px' }}>
      {data.superseded && (
        <div style={{ background: '#fffbeb', borderBottom: '1.5px solid #fde68a', padding: '12px 20px', textAlign: 'center' }}>
          <span style={{ fontSize: '13.5px', color: '#92400e', fontWeight: 600 }}>
            Superseded{data.version != null ? ` — you are viewing version ${data.version}` : ''}.{' '}
            <a href={data.canonicalUrl} style={{ color: '#185D7A', fontWeight: 700, textDecoration: 'underline' }}>
              View current version →
            </a>
          </span>
        </div>
      )}

      {/* Branded top bar */}
      <div style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d1d9e0', boxShadow: '0 1px 8px rgba(15,30,45,0.05)' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#185D7A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.manufacturerName}
          </span>
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em', color: '#185D7A', flexShrink: 0 }}>
            Build<span style={{ color: '#f97316' }}>Quote</span>
          </span>
        </div>
      </div>

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px 20px' }}>
        <SystemCardRenderer
          system={data.system}
          stockists={data.stockists}
          onAddToList={addItems}
          cardUrl={data.canonicalUrl}
          validation={data.validation}
          tracking={data.tracking ?? null}
        />
      </div>

      <div style={{ textAlign: 'center', padding: '20px 24px 28px', fontSize: '12px', color: '#94a3b8' }}>
        System Cards prepared with{' '}
        <span style={{ fontWeight: 700, color: '#64748b' }}>
          Build<span style={{ color: '#f97316' }}>Quote</span>
        </span>
      </div>
    </div>
  )
}

export function HostedCardPage(props: HostedCardPageProps) {
  return (
    <ShoppingListProvider storageKey={props.storageKey}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONTS_HREF} />
      <Body data={props} />
      <ShoppingListDrawer />
    </ShoppingListProvider>
  )
}
