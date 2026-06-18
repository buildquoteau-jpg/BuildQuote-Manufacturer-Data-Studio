import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { QuoteCardClient } from './QuoteCardClient'
import type { QuoteRequest } from './QuoteCardClient'

export default async function ManufacturerQuotesPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!session.profile) redirect('/login')

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Quote Requests">
        <div className="studio-info">No manufacturer workspace found.</div>
      </StudioShell>
    )
  }

  const supabase = createStudioServerClient()

  const { data: quotes, error } = await supabase
    .from('widget_quote_requests')
    .select('*')
    .eq('manufacturer_id', ctx.manufacturerId)
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <StudioShell role="manufacturer" subtitle="Quote Requests">
        <div className="studio-warn">Could not load quote requests: {error.message}</div>
      </StudioShell>
    )
  }

  const requests = (quotes ?? []) as QuoteRequest[]
  const newCount = requests.filter(q => q.status === 'new').length

  return (
    <StudioShell role="manufacturer" subtitle="Quote Requests">
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Quote Requests
        </h1>
        {newCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#185D7A', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: 20, letterSpacing: '0.03em' }}>
            {newCount} new
          </span>
        )}
        <span style={{ fontSize: '0.83rem', color: '#94a3b8', marginLeft: 'auto' }}>
          {requests.length} total
        </span>
      </div>

      <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
        Customers who submitted a quote request from your embedded widget.
        Reply directly via email — the customer&apos;s address is the reply-to.
      </p>

      {requests.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>No quote requests yet</div>
          <div style={{ fontSize: '0.83rem' }}>
            Requests appear here when customers use the &ldquo;Request a Quote&rdquo; button in your embedded widget.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {requests.map(q => <QuoteCardClient key={q.id} q={q} />)}
        </div>
      )}

      <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
        <a href="/manufacturer/dashboard" style={{ fontSize: '0.83rem', color: '#475569', fontWeight: 600, textDecoration: 'none' }}>
          ← Back to dashboard
        </a>
      </div>
    </StudioShell>
  )
}
