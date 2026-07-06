// Manufacturer stockists — the merchants listed under "Local stockists" on
// this manufacturer's System Cards (hosted preview + static package).
// CRUD + per-card linking + tokenised confirmation links. Migration 048.

import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { listStockists } from '@/lib/studio-manufacturer/stockist-actions'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { StockistsClient } from './StockistsClient'

export const dynamic = 'force-dynamic'

export default async function StockistsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Stockists">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Stockists</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await listStockists(ctx.manufacturerId)

  // Card list for the per-card override picker (light query — names only).
  let cards: { id: string; name: string }[] = []
  try {
    const supabase = createStudioServerClient()
    const { data } = await supabase
      .from('staged_systems')
      .select('id, name')
      .eq('manufacturer_id', ctx.manufacturerId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    cards = (data ?? []) as { id: string; name: string }[]
  } catch {
    // Non-fatal — the picker just shows no cards.
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

  return (
    <StudioShell role="manufacturer" subtitle="Stockists">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Local stockists</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 1.5rem', maxWidth: 640, lineHeight: 1.6 }}>
        Stockists appear in the &ldquo;Local stockists&rdquo; section of your System Cards —
        including cards already shared or installed on other websites, which fetch the
        current list automatically. By default a stockist shows on all your cards; you can
        limit each one to specific cards.
      </p>

      {!result.ok ? (
        <div className={'missingSchema' in result && result.missingSchema ? 'studio-info' : 'studio-warn'}>
          {result.error}
        </div>
      ) : (
        <StockistsClient
          manufacturerId={ctx.manufacturerId}
          initialStockists={result.stockists}
          cards={cards}
          origin={origin}
        />
      )}
    </StudioShell>
  )
}
