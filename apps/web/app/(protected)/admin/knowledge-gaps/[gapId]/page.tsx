import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StudioShell } from '@/components/studio/StudioShell'
import { getKnowledgeGapAsStaff } from '@/lib/studio-manufacturer/knowledge-gap-actions'
import { explanationForFailureType, type FailureType } from '@/lib/knowledge/askPipeline'
import { AdminGapTriageForm } from '@/components/workspace/AdminGapTriageForm'

export const dynamic = 'force-dynamic'

export default async function AdminKnowledgeGapDetailPage({
  params,
}: {
  params: Promise<{ gapId: string }>
}) {
  const { gapId } = await params
  const result = await getKnowledgeGapAsStaff(gapId)
  if (!result.ok) {
    if (result.error === 'Not found.') notFound()
    return (
      <StudioShell role="admin" subtitle="AI Knowledge Gaps">
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }
  const gap = result.gap

  return (
    <StudioShell role="admin" subtitle="AI Knowledge Gaps">
      <Link href="/admin/knowledge-gaps" style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', textDecoration: 'none' }}>
        ← All knowledge gaps
      </Link>

      <h1 style={{ fontSize: '1.15rem', margin: '0.6rem 0 1.3rem' }}>{gap.manufacturerName ?? 'Unknown manufacturer'} — {gap.systemName ?? 'Unidentified product'}</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxWidth: 640 }}>
        <p style={{
          fontSize: '1rem', fontWeight: 700, padding: '0.9rem 1.1rem', background: 'var(--ds-surface, rgba(255,255,255,0.03))',
          border: '1px solid var(--ds-border)', borderRadius: 10, margin: 0,
        }}>
          &ldquo;{gap.user_question}&rdquo;
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
          <div><strong>Failure type:</strong> {gap.failure_type ?? '—'}</div>
          <div><strong>Status:</strong> {gap.status}</div>
          <div><strong>Repeated:</strong> {gap.repeat_count}×</div>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted, #6b7280)', lineHeight: 1.6 }}>
          {gap.missing_information || (gap.failure_type ? explanationForFailureType(gap.failure_type as FailureType) : '')}
        </p>

        {gap.staged_system_id && (
          <Link href={`/manufacturer/workspace/${gap.staged_system_id}`} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#185D7A', textDecoration: 'none' }}>
            Open product in workspace →
          </Link>
        )}

        {gap.manufacturer_response?.answer && (
          <div style={{ padding: '0.9rem 1.1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', margin: '0 0 0.4rem', textTransform: 'uppercase' }}>
              Manufacturer response ({gap.resolution_type})
            </p>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>{gap.manufacturer_response.answer}</p>
          </div>
        )}

        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-text-faint, #9ca3af)', margin: '0 0 0.5rem' }}>
            BuildQuote triage
          </p>
          <AdminGapTriageForm gapId={gap.id} />
        </div>
      </div>
    </StudioShell>
  )
}
