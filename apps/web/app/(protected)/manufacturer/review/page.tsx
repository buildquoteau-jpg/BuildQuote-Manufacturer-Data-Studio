import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { VerificationGrid } from './VerificationGrid'

export const dynamic = 'force-dynamic'

export default async function ManufacturerReviewPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Verify systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Verify your systems</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Verify systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Verify your systems</h1>
        <div className="studio-warn">Could not load systems: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result
  const verifiedCount = systems.filter(s => s.verification_status === 'manufacturer_verified').length
  const inReviewCount = systems.filter(s => s.verification_status === 'in_review').length
  const pendingCount  = systems.filter(s => s.verification_status === 'pending_review').length

  return (
    <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Verify systems`}>
      <style>{`
        .studio-preview-cta { transition: background 0.15s, transform 0.15s; }
        .studio-preview-cta:hover { background: #134a63 !important; transform: translateY(-1px); }
      `}</style>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
          <h1 style={{ fontSize: '1.25rem' }}>Verify your systems</h1>
          <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint)' }}>
            {systems.length} system{systems.length !== 1 ? 's' : ''}
          </span>
          <a
            href={`/studio/showroom/${ctx.manufacturerId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="studio-preview-cta"
            style={{
              marginLeft: 'auto', fontSize: '0.85rem', fontWeight: 700,
              color: '#fff', textDecoration: 'none',
              background: '#185D7A', padding: '0.5rem 1rem',
              borderRadius: '8px', boxShadow: '0 2px 6px rgba(24,93,122,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            👁 Preview how your system cards will appear →
          </a>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 0.9rem' }}>
          Review each product system card below — check every field, correct errors, and mark the card verified when you are happy with it.
          Verified cards are reviewed by BuildQuote before publishing.
        </p>

        {/* Progress bar */}
        {systems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, maxWidth: 340 }}>
              <div style={{ height: 6, background: 'var(--ds-border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((verifiedCount / systems.length) * 100)}%`,
                  background: '#16a34a',
                  borderRadius: 99,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
              {verifiedCount > 0 && (
                <span style={{ color: '#16a34a', fontWeight: 600 }}>
                  {verifiedCount} verified
                </span>
              )}
              {inReviewCount > 0 && (
                <span style={{ color: '#d97706', fontWeight: 600 }}>
                  {inReviewCount} in review
                </span>
              )}
              {pendingCount > 0 && (
                <span style={{ color: 'var(--ds-text-faint)', fontWeight: 600 }}>
                  {pendingCount} not started
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {systems.length === 0 ? (
        <div className="studio-info">
          No staged systems found for your workspace yet. Contact BuildQuote admin if you expect to see systems here.
        </div>
      ) : (
        <VerificationGrid
          manufacturerId={ctx.manufacturerId}
          manufacturerName={manufacturer.name}
          systems={systems}
        />
      )}
    </StudioShell>
  )
}
