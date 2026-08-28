import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { listKnowledgeGaps } from '@/lib/studio-manufacturer/knowledge-gap-actions'
import { StudioShell } from '@/components/studio/StudioShell'

export const dynamic = 'force-dynamic'

// "AI Questions" — design doc addendum §14-17/§35-36. Deliberately framed as
// Product Knowledge Improvement, not a support-ticket queue (§35): the
// header states the value prop, the roll-up counts come first, and the
// table shows the useful question, not internal retrieval diagnostics.

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  NEW: { label: 'Needs review', bg: '#fef3c7', color: '#92400e' },
  TRIAGED: { label: 'Triaged', bg: '#fef3c7', color: '#92400e' },
  AWAITING_MANUFACTURER: { label: 'Needs review', bg: '#fef3c7', color: '#92400e' },
  MANUFACTURER_RESPONDED: { label: 'Awaiting verification', bg: '#dbeafe', color: '#1e40af' },
  AWAITING_VERIFICATION: { label: 'Awaiting verification', bg: '#dbeafe', color: '#1e40af' },
  RESOLVED: { label: 'Resolved', bg: '#dcfce7', color: '#166534' },
  PUBLISHED: { label: 'Resolved', bg: '#dcfce7', color: '#166534' },
  ESCALATED: { label: 'Escalated to BuildQuote', bg: '#fee2e2', color: '#991b1b' },
  DUPLICATE: { label: 'Duplicate', bg: '#f3f4f6', color: '#6b7280' },
  OUT_OF_SCOPE: { label: 'Out of scope', bg: '#f3f4f6', color: '#6b7280' },
  NO_ACTION_REQUIRED: { label: 'No action needed', bg: '#f3f4f6', color: '#6b7280' },
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default async function AiQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="AI Questions">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const result = await listKnowledgeGaps(ctx.manufacturerId, status)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="AI Questions">
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const gaps = result.gaps
  const newCount = gaps.filter((g) => g.status === 'NEW' || g.status === 'TRIAGED' || g.status === 'AWAITING_MANUFACTURER').length
  const repeatedCount = gaps.filter((g) => g.repeat_count > 1).length
  const resolvedThisMonth = gaps.filter((g) => {
    if (g.status !== 'RESOLVED' || !g.resolved_at) return false
    const d = new Date(g.resolved_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <StudioShell role="manufacturer" subtitle="AI Questions">
      <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.4rem' }}>Improve your product knowledge</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 1.3rem', maxWidth: 620, lineHeight: 1.6 }}>
        Builders are asking questions about your products. When our AI can&apos;t provide a verified
        answer, we capture the question here so you can clarify the information and improve your
        System Cards.
      </p>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Needs review', value: newCount },
          { label: 'Repeated questions', value: repeatedCount },
          { label: 'Resolved this month', value: resolvedThisMonth },
          { label: 'Total', value: gaps.length },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { key: 'open', label: 'Needs you' },
          { key: 'all', label: 'All' },
          { key: 'RESOLVED', label: 'Resolved' },
        ].map((f) => (
          <Link
            key={f.key}
            href={f.key === 'open' ? '/manufacturer/ai-questions' : `/manufacturer/ai-questions?status=${f.key}`}
            style={{
              fontSize: '0.8rem', fontWeight: 600, padding: '0.35rem 0.8rem', borderRadius: 20,
              border: '1.5px solid var(--ds-border, #d1d5db)',
              background: (status ?? 'open') === f.key ? '#185D7A' : 'transparent',
              color: (status ?? 'open') === f.key ? '#fff' : 'var(--ds-text, #0f172a)',
              textDecoration: 'none',
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {gaps.length === 0 ? (
        <div className="studio-info">No questions yet — nothing to review right now.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--ds-border, #e5e7eb)' }}>
                <th style={{ padding: '0.5rem' }}>Question</th>
                <th style={{ padding: '0.5rem' }}>Product</th>
                <th style={{ padding: '0.5rem' }}>Type</th>
                <th style={{ padding: '0.5rem' }}>Asked</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => {
                const s = STATUS_LABEL[g.status] ?? { label: g.status, bg: '#f3f4f6', color: '#6b7280' }
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
                    <td style={{ padding: '0.6rem 0.5rem', maxWidth: 320 }}>
                      <Link href={`/manufacturer/ai-questions/${g.id}`} style={{ color: 'var(--ds-text, #0f172a)', fontWeight: 600, textDecoration: 'none' }}>
                        {g.user_question}
                      </Link>
                      {g.repeat_count > 1 && (
                        <div style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '0.2rem' }}>
                          Asked {g.repeat_count} times by builders
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{g.systemName ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{g.failure_type ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--ds-text-muted)' }}>{timeAgo(g.created_at)}</td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </StudioShell>
  )
}
