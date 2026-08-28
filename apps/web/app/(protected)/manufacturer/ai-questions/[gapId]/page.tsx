import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getKnowledgeGap } from '@/lib/studio-manufacturer/knowledge-gap-actions'
import { explanationForFailureType, type FailureType } from '@/lib/knowledge/askPipeline'
import { StudioShell } from '@/components/studio/StudioShell'
import { KnowledgeGapResolutionForm } from '@/components/workspace/KnowledgeGapResolutionForm'

export const dynamic = 'force-dynamic'

// Knowledge Gap detail / resolution workspace (design doc addendum §18).
// Sections in order: the builder's question verbatim, the product, a plain-
// English interpretation (never raw JSON — §17's "don't make the
// manufacturer read raw technical logs"), what we already know, available
// documentation, why we're asking, and the response form.

export default async function KnowledgeGapDetailPage({
  params,
}: {
  params: Promise<{ gapId: string }>
}) {
  const { gapId } = await params
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="AI Questions">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const result = await getKnowledgeGap(gapId, ctx.manufacturerId)
  if (!result.ok) {
    if (result.error === 'Not found.') notFound()
    return (
      <StudioShell role="manufacturer" subtitle="AI Questions">
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }
  const gap = result.gap

  const verificationResult = gap.staged_system_id ? await getManufacturerVerificationData(ctx.manufacturerId) : null
  const system = verificationResult?.ok ? verificationResult.systems.find((s) => s.id === gap.staged_system_id) : undefined

  const isResolved = gap.status === 'RESOLVED' || gap.status === 'PUBLISHED' || gap.status === 'ESCALATED'
  const docs = [
    system?.tech_data_url ? { label: 'Technical data sheet', url: system.tech_data_url } : null,
    system?.design_guide_url ? { label: 'Design guide', url: system.design_guide_url } : null,
    ...(system?.install_guide_urls ?? []).map((g) => ({ label: g.label || 'Installation guide', url: g.url })),
  ].filter((d): d is { label: string; url: string } => d !== null)

  return (
    <StudioShell role="manufacturer" subtitle="AI Questions">
      <Link href="/manufacturer/ai-questions" style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', textDecoration: 'none' }}>
        ← All AI Questions
      </Link>

      <h1 style={{ fontSize: '1.15rem', margin: '0.6rem 0 1.3rem' }}>Builder question</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(280px, 360px)', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.3rem' }}>
          <section>
            <p style={{
              fontSize: '1.05rem', fontWeight: 700, padding: '0.9rem 1.1rem', background: 'var(--ds-surface, rgba(255,255,255,0.03))',
              border: '1px solid var(--ds-border)', borderRadius: 10, margin: 0,
            }}>
              &ldquo;{gap.user_question}&rdquo;
            </p>
            {gap.repeat_count > 1 && (
              <p style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600, margin: '0.5rem 0 0' }}>
                {gap.repeat_count} builders have asked a similar question.
              </p>
            )}
          </section>

          {gap.normalised_question && gap.normalised_question.keywords.length > 0 && (
            <section>
              <SectionLabel>Question interpretation</SectionLabel>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <Tag>{gap.normalised_question.questionType}</Tag>
                {gap.normalised_question.keywords.slice(0, 8).map((k) => <Tag key={k} muted>{k}</Tag>)}
              </div>
            </section>
          )}

          <section>
            <SectionLabel>Why we&apos;re asking you</SectionLabel>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted, #6b7280)', margin: 0, lineHeight: 1.6 }}>
              {gap.missing_information || (gap.failure_type ? explanationForFailureType(gap.failure_type as FailureType) : 'The current verified product information does not contain a definitive answer.')}
            </p>
          </section>

          {docs.length > 0 && (
            <section>
              <SectionLabel>Available documentation</SectionLabel>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {docs.map((d) => (
                  <a key={d.url} href={d.url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: '0.8rem', fontWeight: 600, color: '#185D7A', textDecoration: 'none',
                    border: '1.5px solid #185D7A', borderRadius: 20, padding: '0.35rem 0.8rem',
                  }}>
                    {d.label} ↗
                  </a>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionLabel>{isResolved ? 'Response' : 'Manufacturer response'}</SectionLabel>
            {isResolved ? (
              <div style={{ padding: '0.9rem 1.1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', margin: '0 0 0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {gap.status === 'ESCALATED' ? 'Escalated for technical review' : (gap.resolution_type ?? 'Resolved').replace(/_/g, ' ')}
                </p>
                {gap.manufacturer_response?.answer && (
                  <p style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.6 }}>{gap.manufacturer_response.answer}</p>
                )}
              </div>
            ) : (
              <KnowledgeGapResolutionForm gapId={gap.id} manufacturerId={ctx.manufacturerId} />
            )}
          </section>
        </div>

        <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div style={{ padding: '0.9rem 1rem', background: 'var(--ds-surface, rgba(255,255,255,0.03))', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
            <SectionLabel>Product</SectionLabel>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{gap.systemName ?? 'Not identified'}</p>
            {gap.staged_system_id && (
              <Link href={`/manufacturer/workspace/${gap.staged_system_id}`} style={{ fontSize: '0.8rem', fontWeight: 600, color: '#185D7A', textDecoration: 'none' }}>
                Open in workspace →
              </Link>
            )}
          </div>
        </div>
      </div>
    </StudioShell>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ds-text-faint, #9ca3af)', margin: '0 0 0.5rem' }}>
      {children}
    </p>
  )
}

function Tag({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{
      fontSize: '0.76rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20,
      background: muted ? '#f3f4f6' : '#eff6ff', color: muted ? '#4b5563' : '#1d4ed8',
    }}>
      {children}
    </span>
  )
}
