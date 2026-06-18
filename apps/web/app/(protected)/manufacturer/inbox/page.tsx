import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getManufacturerMessages, type ManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'
import { StudioShell } from '@/components/studio/StudioShell'
import { InboxMessagesPanel } from '@/components/studio/InboxMessagesPanel'

// ─── Quote request types ──────────────────────────────────────────────────────

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
  asap:        'ASAP',
  '1-3months': '1–3 months',
  planning:    'Just planning',
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', fontSize: '0.83rem' }}>
        <a href={`mailto:${q.email}`} style={{ color: '#185D7A', fontWeight: 600, textDecoration: 'none' }}>
          {q.email}
        </a>
        {q.phone && (
          <a href={`tel:${q.phone}`} style={{ color: '#374151', textDecoration: 'none' }}>
            {q.phone}
          </a>
        )}
        {q.postcode && <span style={{ color: '#6b7280' }}>Postcode {q.postcode}</span>}
        {q.project_type && <span style={{ color: '#6b7280' }}>{PROJECT_LABELS[q.project_type] ?? q.project_type}</span>}
        {q.timeline && <span style={{ color: '#6b7280' }}>Timeline: {TIMELINE_LABELS[q.timeline] ?? q.timeline}</span>}
      </div>

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

      {q.message && (
        <div style={{ fontSize: '0.83rem', color: '#475569', lineHeight: 1.55, borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
          {q.message}
        </div>
      )}

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

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, quotesNew, messagesUnread }: { active: 'quotes' | 'messages'; quotesNew: number; messagesUnread: number }) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '9px 18px', fontSize: '0.875rem', fontWeight: 600,
    textDecoration: 'none', borderBottom: '2.5px solid transparent',
    color: '#64748b', marginBottom: '-2px',
    transition: 'color 0.1s',
  }
  const activeStyle: React.CSSProperties = {
    ...baseStyle,
    color: '#185D7A',
    borderBottomColor: '#185D7A',
  }

  function Badge({ count, color }: { count: number; color: string }) {
    return (
      <span style={{
        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em',
        background: color, color: '#fff',
        padding: '1px 6px', borderRadius: 10,
      }}>
        {count}
      </span>
    )
  }

  return (
    <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem', display: 'flex' }}>
      <a href="/manufacturer/inbox" style={active === 'quotes' ? activeStyle : baseStyle}>
        Quote Requests
        {quotesNew > 0 && <Badge count={quotesNew} color="#185D7A" />}
      </a>
      <a href="/manufacturer/inbox?tab=messages" style={active === 'messages' ? activeStyle : baseStyle}>
        Messages
        {messagesUnread > 0 && <Badge count={messagesUnread} color="#d97706" />}
      </a>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ManufacturerInboxPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const session = await getStudioSession()
  if (!session.profile) redirect('/login')

  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Inbox">
        <div className="studio-info">No manufacturer workspace found.</div>
      </StudioShell>
    )
  }

  const activeTab = searchParams.tab === 'messages' ? 'messages' : 'quotes'
  const supabase = createStudioServerClient()

  // Fetch quote requests
  const { data: quotesData } = await supabase
    .from('widget_quote_requests')
    .select('*')
    .eq('manufacturer_id', ctx.manufacturerId)
    .order('created_at', { ascending: false })

  const quotes = (quotesData ?? []) as QuoteRequest[]
  const newQuoteCount = quotes.filter(q => q.status === 'new').length

  // Fetch messages
  let messages: ManufacturerMessage[] = []
  const messagesResult = await getManufacturerMessages(ctx.manufacturerId)
  if (messagesResult.ok) messages = messagesResult.messages

  const unreadAdminCount = messages.filter(
    m => m.sender_type === 'buildquote' && !m.acknowledged_at,
  ).length

  const totalUnread = newQuoteCount + unreadAdminCount

  return (
    <StudioShell role="manufacturer" subtitle={totalUnread > 0 ? `Inbox (${totalUnread} new)` : 'Inbox'}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Inbox
        </h1>
        {totalUnread > 0 && (
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, background: '#185D7A', color: '#fff',
            padding: '0.2rem 0.6rem', borderRadius: 20, letterSpacing: '0.03em',
          }}>
            {totalUnread} new
          </span>
        )}
      </div>

      <TabBar active={activeTab} quotesNew={newQuoteCount} messagesUnread={unreadAdminCount} />

      {activeTab === 'quotes' && (
        <>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            Customers who submitted a quote request from your embedded widget.
            Reply directly via email — the customer&rsquo;s address is the reply-to.
          </p>
          {quotes.length === 0 ? (
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
              {quotes.map(q => <QuoteCard key={q.id} q={q} />)}
            </div>
          )}
        </>
      )}

      {activeTab === 'messages' && (
        <>
          <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>
            Messages from BuildQuote and your replies. Acknowledge each incoming message to confirm receipt.
          </p>
          <InboxMessagesPanel
            manufacturerId={ctx.manufacturerId}
            initialMessages={messages}
          />
        </>
      )}
    </StudioShell>
  )
}
