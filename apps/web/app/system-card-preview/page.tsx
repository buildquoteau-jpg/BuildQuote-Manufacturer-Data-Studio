/**
 * Standalone system card preview — no auth, no DB.
 * Seed data lives in data/system-card-preview-seed.ts (shared with the
 * package-generator fixture script). Renders through the master v6 renderer
 * (components/system-card-renderer): manufacturer landing page → tile grid →
 * full System Card, with the client-side shopping list drawer and PNG sharing.
 */

import { SystemCardPreviewWrapper } from '@/components/system-card-renderer/SystemCardPreviewWrapper'
import { DEMO_MANUFACTURER, DEMO_SYSTEMS } from '@/data/system-card-preview-seed'

export default function SystemCardPreviewPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ds-page-bg)' }}>
      {/* Banner */}
      <div style={{
        background: 'var(--ds-navy)',
        color: '#fff',
        padding: '0.6rem 1rem',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700 }}>BuildQuote</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ opacity: 0.8 }}>System cards · master v6 renderer</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: '0.7rem' }}>
          Preview · Static data
        </span>
      </div>

      <SystemCardPreviewWrapper manufacturer={DEMO_MANUFACTURER} systems={DEMO_SYSTEMS} />
    </div>
  )
}
