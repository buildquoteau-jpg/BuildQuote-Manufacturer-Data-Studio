// Studio-only internal preview — not a public customer-facing route.
// The future public manufacturer page (/manufacturers/[slug]) is customer-facing
// and will NOT require manufacturer login. This route is the Studio preview only.

import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContext,
  getManufacturerPreviewData,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioStatusBadge } from '@/components/studio/StudioStatusBadge'

export default async function ManufacturerPreviewPage() {
  const session = await getStudioSession()
  const ctx = resolveWorkspaceContext(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Preview">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Preview public page</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerPreviewData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Preview">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Preview public page</h1>
        <div className="studio-warn">Could not load preview data: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result

  return (
    <StudioShell role="manufacturer" subtitle="Preview">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Preview public page</h1>
        <span className="studio-badge studio-badge-draft">Studio only</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '0.75rem' }}>
        Private Studio preview only. Public manufacturer pages are published later by BuildQuote
        admin. Nothing shown here is live.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <StudioStatusBadge
          current="draft"
          note="— Approved and Published states require BuildQuote admin action."
        />
      </div>

      <div className="studio-preview-frame">
        <div className="studio-preview-bar">
          <span>🔍 Studio preview — not live</span>
          <span style={{ marginLeft: 'auto' }}>
            {manufacturer.status} · Not published
          </span>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Manufacturer header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.25rem',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid var(--ds-border-soft)',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                background: 'var(--ds-page-bg)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                flexShrink: 0,
              }}
            >
              🏭
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>
                {manufacturer.name}
              </h2>
              {manufacturer.description && (
                <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: 0 }}>
                  {manufacturer.description}
                </p>
              )}
              {manufacturer.websiteUrl && (
                <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', margin: '0.2rem 0 0' }}>
                  {manufacturer.websiteUrl}
                </p>
              )}
            </div>
          </div>

          {/* Systems */}
          <h3
            style={{
              fontSize: '0.85rem',
              color: 'var(--ds-text-sub)',
              fontWeight: 700,
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Systems
          </h3>

          {systems.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', marginBottom: '1.25rem' }}>
              No staged systems yet.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              {systems.map((sys) => (
                <div key={sys.id} className="studio-system-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.88rem', color: 'var(--ds-navy)' }}>
                      {sys.name}
                    </strong>
                    <span className="studio-badge studio-badge-draft">
                      {sys.verificationStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {sys.category && (
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--ds-text-muted)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      {sys.category}
                    </div>
                  )}
                  {sys.colours.length > 0 && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--ds-text-faint)',
                        marginBottom: '0.65rem',
                      }}
                    >
                      {sys.colours.join(', ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      disabled
                      className="studio-btn studio-btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    >
                      View system
                    </button>
                    <button
                      disabled
                      className="studio-btn studio-btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    >
                      Add to RFQ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div
            style={{
              background: 'var(--ds-page-bg)',
              borderRadius: 8,
              padding: '1rem',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--ds-text-muted)',
                marginBottom: '0.6rem',
              }}
            >
              Preview of public CTA — disabled in Studio preview.
            </p>
            <button disabled className="studio-btn studio-btn-primary" style={{ fontSize: '0.85rem' }}>
              Request quote — preview only
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
        To publish your page, all staged data must be verified and approved by BuildQuote admin.
        Production publish is not available from this screen.
      </div>
    </StudioShell>
  )
}
