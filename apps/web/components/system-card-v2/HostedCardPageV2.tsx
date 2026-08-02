'use client'

// Real hosted-card data through System Card V2, for the live /cards routes.
// Same prop shape as the original renderer (HostedCardPageProps, from
// components/system-card-renderer/HostedCardPage) so both route files
// (/cards/[mfr]/[slug] and /v/[version]) can switch between the two with
// one flag — see lib/systemCardV2Flag.ts. `validation` and `storageKey`
// aren't used here: V2 has no validation display and no persisted shopping
// list (see SelectionContext.tsx), but they stay in the shared prop type so
// one call site works for either component.

import { useEffect } from 'react'
import { SystemCardV2Experience } from './SystemCardV2Experience'
import type { HostedCardPageProps } from '@/components/system-card-renderer/HostedCardPage'

export function HostedCardPageV2({ system, stockists, manufacturerName, superseded, version, canonicalUrl, tracking }: HostedCardPageProps) {
  // Same view-beacon contract as the original renderer (same endpoint, same
  // payload shape) — preserved so per-manufacturer page-view analytics
  // don't silently stop just because the renderer changed.
  useEffect(() => {
    if (!tracking) return
    try {
      fetch(`${tracking.apiBase}/api/beacon`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          m: tracking.manufacturerSlug,
          slug: tracking.cardSlug,
          version: tracking.version,
          host: window.location.hostname,
        }),
      }).catch(() => { /* silent */ })
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {superseded && (
        <div style={{ background: '#fffbeb', borderBottom: '1.5px solid #fde68a', padding: '12px 20px', textAlign: 'center' }}>
          <span style={{ fontSize: '13.5px', color: '#92400e', fontWeight: 600 }}>
            Superseded{version != null ? ` — you are viewing version ${version}` : ''}.{' '}
            <a href={canonicalUrl} style={{ color: '#185D7A', fontWeight: 700, textDecoration: 'underline' }}>
              View current version →
            </a>
          </span>
        </div>
      )}
      <SystemCardV2Experience
        manufacturer={{ name: system.manufacturer?.name ?? manufacturerName }}
        system={system}
        stockists={stockists}
        showExperimentBanner={false}
      />
    </>
  )
}
