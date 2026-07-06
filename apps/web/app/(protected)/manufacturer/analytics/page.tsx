// Manufacturer analytics — views, unique-ish devices, shares by
// channel/sender, doc clicks; by card and by range (30/90 days).
// Data comes from card_events / card_share_links (migration 050).

import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { getCardAnalytics } from '@/lib/studio-manufacturer/analytics-actions'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { AnalyticsClient } from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Analytics">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Analytics</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const initial = await getCardAnalytics(ctx.manufacturerId, { days: 30 })

  // Card list for the filter + tagged-share-link form
  let cards: { id: string; name: string; slug: string | null }[] = []
  try {
    const supabase = createStudioServerClient()
    const { data } = await supabase
      .from('staged_systems')
      .select('id, name, slug')
      .eq('manufacturer_id', ctx.manufacturerId)
      .order('name', { ascending: true })
    cards = (data ?? []) as { id: string; name: string; slug: string | null }[]
  } catch { /* filter just shows no cards */ }

  return (
    <StudioShell role="manufacturer" subtitle="Analytics">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Analytics</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 1.5rem', maxWidth: 680, lineHeight: 1.6 }}>
        Views, shares and document clicks across your System Cards — hosted pages and
        travelling static packages alike. No cookies and no personal data are collected;
        &ldquo;devices&rdquo; are approximate.
      </p>

      {!initial.ok && 'missingSchema' in initial && initial.missingSchema ? (
        <div className="studio-info">{initial.error}</div>
      ) : !initial.ok ? (
        <div className="studio-warn">{initial.error}</div>
      ) : (
        <AnalyticsClient
          manufacturerId={ctx.manufacturerId}
          initialData={initial.data}
          cards={cards}
        />
      )}
    </StudioShell>
  )
}
