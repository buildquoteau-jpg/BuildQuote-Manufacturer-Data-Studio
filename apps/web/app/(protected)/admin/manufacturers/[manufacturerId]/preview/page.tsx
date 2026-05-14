import { StudioShell } from '@/components/studio/StudioShell'
import { StudioStatusBadge } from '@/components/studio/StudioStatusBadge'
import { getAdminManufacturerPreviewData } from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string }
}

export default async function AdminManufacturerPreviewPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerPreviewData(manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="Public page preview">
        <div style={{ marginBottom: '1.25rem' }}>
          <a
            href={`/admin/manufacturers/${manufacturerId}`}
            style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
          >
            ← Manufacturer detail
          </a>
        </div>
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer: m, systems } = result

  return (
    <StudioShell role="admin" subtitle={`${m.name} · Preview`}>
      <div style={{ marginBottom: '1.25rem' }}>
        <a
          href={`/admin/manufacturers/${manufacturerId}`}
          style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
        >
          ← {m.name}
        </a>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Public page preview</h1>
        <span className="studio-badge studio-badge-draft">Admin preview</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '1.25rem' }}>
        Private admin preview only. Public manufacturer pages are published later by BuildQuote
        admin. Nothing shown here has been published to BuildQuote or RFQ.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <StudioStatusBadge
          current="draft"
          note="— Approved and Published states require BuildQuote admin action."
        />
      </div>

      <div className="studio-preview-frame">
        <div className="studio-preview-bar">
          <span>🔍 Admin preview — not live</span>
          <span style={{ marginLeft: 'auto' }}>
            {m.status} · Not published
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
                width: 56,
                height: 56,
                background: 'var(--ds-page-bg)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                flexShrink: 0,
              }}
            >
              🏭
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', marginBottom: '0.2rem' }}>{m.name}</h2>
              {m.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', margin: 0 }}>
                  {m.description}
                </p>
              )}
              {m.websiteUrl && (
                <p
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--ds-text-faint)',
                    margin: '0.2rem 0 0',
                  }}
                >
                  {m.websiteUrl}
                </p>
              )}
            </div>
          </div>

          {/* System cards */}
          <h3
            style={{
              fontSize: '0.9rem',
              color: 'var(--ds-text-sub)',
              fontWeight: 600,
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Systems
          </h3>

          {systems.length === 0 ? (
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--ds-text-muted)',
                marginBottom: '1.25rem',
              }}
            >
              No staged systems yet.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
                      marginBottom: '0.5rem',
                    }}
                  >
                    <strong style={{ fontSize: '0.9rem', color: 'var(--ds-navy)' }}>
                      {sys.name}
                    </strong>
                    <span className="studio-badge studio-badge-draft">
                      {sys.verificationStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {sys.category && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--ds-text-muted)',
                        marginBottom: sys.colours.length > 0 ? '0.4rem' : '0.75rem',
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
                        marginBottom: '0.75rem',
                      }}
                    >
                      {sys.colours.join(', ')}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      disabled
                      className="studio-btn studio-btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    >
                      View system
                    </button>
                    <button
                      disabled
                      className="studio-btn studio-btn-primary"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
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
                fontSize: '0.85rem',
                color: 'var(--ds-text-muted)',
                marginBottom: '0.75rem',
              }}
            >
              Preview of public CTA — disabled in Studio preview.
            </p>
            <button disabled className="studio-btn studio-btn-primary">
              Request quote — preview only
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
        Admin action: production publish is not available until data is approved and the publish
        flow is implemented.
      </div>
    </StudioShell>
  )
}
