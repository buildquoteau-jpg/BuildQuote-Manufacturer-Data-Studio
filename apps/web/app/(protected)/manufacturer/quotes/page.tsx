import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'

type QuoteRequest = {
  id: string
  system_name: string | null
  selected_items: { item_id: string; type: string; label: string; dims: string; uom: string; product_code: string | null }[]
  name: string
  email: string
  phone: string | null
  postcode: string | null
  project_type: string | null
  timeline: string | null
  message: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  new:       { bg: '#fef3c7', color: '#92400e', label: 'New' },
  viewed:    { bg: '#e0f2fe', color: '#0369a1', label: 'Viewed' },
  responded: { bg: '#dcfce7', color: '#166534', label: 'Responded' },
}

const PROJECT_LABELS: Record<string, string> = {
  residential: 'Residential',
  commercial:  'Commercial',
  other:       'Other',
}

const TIMELINE_LABELS: Record<string, string> = {
  asap:       'ASAP',
  '1-3months': '1–3 months',
  planning:   'Just planning',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function QuoteCard({ q }: { q: QuoteRequest }) {
  const statusStyle = STATUS_STYLES[q.status] ?? STATUS_STYLES.new
  const items = Array.isArray(q.selected_items) ? q.selected_items : []

  return (
    <div style={{
      background: '#fff',
      border: q.status === 'new' ? '1.5px solid #185D7A' : '1.5px solid #e2e8f0',
      borderRadius: 12,
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{q.name}</div>
          <div style={{ fontSize: '0.83rem', color: '#475569', marginTop: '0.15rem' }}>
            {q.system_name ?? 'Unknown system'} · {formatDate(q.created_at)}
          </div>
        </div>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          background: statusStyle.bg, color: statusStyle.color,
          padding: '0.25rem 0.6rem', borderRadius: 5,
          flexShrink: 0,
        }}>
          {statusStyle.label}
        </span>
      </div>

      {/* Contact */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', fontSize: '0.83rem' }}>
        <a href={`mailto:${q.email}`} style={{ color: '#185D7A', fontWeight: 600, textDecoration: 'none' }}>
          {q.email}
        </a>
        {q.phone && (
          <a href={`tel:${q.phone}`} style={{ color: '#374151', textDecoration: 'none' }}>
            {q.phone}
          </a>
        )}
        {q.postcode && (
          <span style={{ color: '#6b7280' }}>Postcode {q.postcode}</span>
        )}
        {q.project_type && (
          <span style={{ color: '#6b7280' }}>{PROJECT_LABELS[q.project_type] ?? q.project_type}</span>
        )}
        {q.timeline && (
          <span style={{ color: '#6b7280' }}>Timeline: {TIMELINE_LABELS[q.timeline] ?? q.timeline}</span>
        )}
      </div>

      {/* Selected items */}
      {items.length > 0 && (
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.4rem' }}>
            Selected items ({items.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {items.map((item, i) => (
              <div key={i} style={{
                fontSize: '0.82rem', color: '#374151',
                background: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 6, padding: '5px 10px',
                display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 600 }}>{item.label}</span>
                {item.dims && <span style={{ color: '#6b7280' }}>{item.dims}</span>}
                {item.uom && <span style={{ color: '#9ca3af', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em' }}>{item.uom}</span>}
                {item.product_code && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#4b5563', background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>{item.product_code}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message */}
      {q.message && (
        <div style={{ fontSize: '0.83rem', color: '#475569', lineHeight: 1.55, borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
          {q.message}
        </div>
      )}

      {/* Reply link */}
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
        <a
          href={`mailto:${q.email}?subject=Re: Quote request — ${encodeURIComponent(q.system_name ?? 'your enquiry')}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '0.83rem', fontWeight: 600, color: '#185D7A',
            background: '#eef6fa', border: '1.5px solid #b6dcea',
            padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
          }}
        >
          Reply via email →
        </a>
      </div>
    </div>
  )
}

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
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, background: '#185D7A', color: '#fff',
            padding: '0.2rem 0.6rem', borderRadius: 20, letterSpacing: '0.03em',
          }}>
            {newCount} new
          </span>
        )}
        <span style={{ fontSize: '0.83rem', color: '#94a3b8', marginLeft: 'auto' }}>
          {requests.length} total
        </span>
      </div>

      <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
        Customers who submitted a quote request from your embedded widget.
        Reply directly via email — the customer's address is the reply-to.
      </p>

      {requests.length === 0 ? (
        <div style={{
          background: '#f8fafc', border: '1.5px dashed #cbd5e1',
          borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#94a3b8',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>No quote requests yet</div>
          <div style={{ fontSize: '0.83rem' }}>
            Requests appear here when customers use the &ldquo;Request a Quote&rdquo; button in your embedded widget.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {requests.map(q => <QuoteCard key={q.id} q={q} />)}
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
