import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getManufacturerMessages, type ManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'
import { StudioShell } from '@/components/studio/StudioShell'
import { InboxMessagesPanel } from '@/components/studio/InboxMessagesPanel'
import { QuoteCardClient } from '../quotes/QuoteCardClient'
import type { QuoteRequest } from '../quotes/QuoteCardClient'

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
              {quotes.map(q => <QuoteCardClient key={q.id} q={q} />)}
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
