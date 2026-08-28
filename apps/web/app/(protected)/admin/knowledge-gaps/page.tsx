import Link from 'next/link'
import { StudioShell } from '@/components/studio/StudioShell'
import { getAllKnowledgeGaps } from '@/lib/studio-manufacturer/knowledge-gap-actions'

export const dynamic = 'force-dynamic'

// Cross-manufacturer triage (design doc addendum §A6/§25/§23) — mirrors
// admin/messages' list+detail pattern exactly. Primary use: RETRIEVAL_GAP
// rows (the AI/search layer failed despite the data existing — a BuildQuote
// problem, not a manufacturer one) and SCHEMA_GAP rows (no field exists yet
// to represent the answer). Manufacturer-facing KNOWLEDGE_GAP/VERIFICATION_GAP
// rows still show here for visibility but are primarily worked from each
// manufacturer's own /manufacturer/ai-questions queue.

const FAILURE_BADGE: Record<string, { bg: string; color: string }> = {
  RETRIEVAL_GAP: { bg: '#fee2e2', color: '#991b1b' },
  SCHEMA_GAP: { bg: '#fee2e2', color: '#991b1b' },
  KNOWLEDGE_GAP: { bg: '#fef3c7', color: '#92400e' },
  VERIFICATION_GAP: { bg: '#fef3c7', color: '#92400e' },
  AMBIGUOUS_QUERY: { bg: '#f3f4f6', color: '#6b7280' },
  OUT_OF_SCOPE: { bg: '#f3f4f6', color: '#6b7280' },
}

export default async function AdminKnowledgeGapsPage() {
  const result = await getAllKnowledgeGaps()

  const needsBuildquote = result.ok
    ? result.gaps.filter((g) => (g.failure_type === 'RETRIEVAL_GAP' || g.failure_type === 'SCHEMA_GAP') && g.status !== 'RESOLVED' && g.status !== 'NO_ACTION_REQUIRED')
    : []

  return (
    <StudioShell role="admin" subtitle="AI Knowledge Gaps">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>AI Knowledge Gaps</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.25rem' }}>
        Every question the AI couldn&apos;t answer, across all manufacturers. Retrieval and schema
        gaps route here — the data may already exist and the AI/search layer failed to find it, or
        the System Card has no field yet to represent the answer.
      </p>

      {needsBuildquote.length > 0 && (
        <div style={{ padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: '1.25rem' }}>
          <strong style={{ fontSize: '0.85rem', color: '#991b1b' }}>
            {needsBuildquote.length} retrieval/schema gap{needsBuildquote.length === 1 ? '' : 's'} need BuildQuote attention
          </strong>
        </div>
      )}

      {!result.ok ? (
        <div className="studio-warn">{result.error}</div>
      ) : result.gaps.length === 0 ? (
        <div className="studio-info">No knowledge gaps logged yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--ds-border, #e5e7eb)' }}>
                <th style={{ padding: '0.5rem' }}>Question</th>
                <th style={{ padding: '0.5rem' }}>Manufacturer</th>
                <th style={{ padding: '0.5rem' }}>Product</th>
                <th style={{ padding: '0.5rem' }}>Failure</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.gaps.map((g) => {
                const badge = g.failure_type ? FAILURE_BADGE[g.failure_type] : undefined
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
                    <td style={{ padding: '0.6rem 0.5rem', maxWidth: 300 }}>
                      <Link href={`/admin/knowledge-gaps/${g.id}`} style={{ color: 'var(--ds-text, #0f172a)', fontWeight: 600, textDecoration: 'none' }}>
                        {g.user_question}
                      </Link>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{g.manufacturerName ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>{g.systemName ?? '—'}</td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap' }}>
                      {g.failure_type && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge?.bg ?? '#f3f4f6', color: badge?.color ?? '#6b7280' }}>
                          {g.failure_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--ds-text-muted)' }}>{g.status}</td>
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
