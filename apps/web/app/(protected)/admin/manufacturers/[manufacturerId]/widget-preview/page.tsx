import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminManufacturerPreviewData } from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string }
}

export default async function AdminManufacturerWidgetPreviewPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerPreviewData(manufacturerId)

  // Graceful fallback if data load fails — still render the shell with an error notice
  const manufacturerName = result.ok ? result.manufacturer.name : 'Manufacturer'
  const systems = result.ok ? result.systems.slice(0, 3) : []

  return (
    <StudioShell role="admin" subtitle={`${manufacturerName} · Widget preview`}>
      <div style={{ marginBottom: '1.25rem' }}>
        <a
          href={`/admin/manufacturers/${manufacturerId}`}
          style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
        >
          ← {manufacturerName}
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
        <h1 style={{ fontSize: '1.25rem' }}>Widget preview</h1>
        <span className="studio-badge studio-badge-draft">Draft</span>
      </div>

      {!result.ok && (
        <div className="studio-warn" style={{ marginBottom: '1.25rem' }}>
          {result.error}
        </div>
      )}

      <div className="studio-info" style={{ marginBottom: '1.25rem' }}>
        This preview simulates how an embeddable system card widget would appear when a supplier
        or store embeds it on their site. Studio preview only — widget is not live or published.
      </div>

      {/* Widget container simulation */}
      <div
        style={{
          background: '#f8fafc',
          border: '2px dashed var(--ds-border)',
          borderRadius: 8,
          padding: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--ds-text-faint)',
            marginBottom: '0.75rem',
            textAlign: 'center',
          }}
        >
          Simulated supplier/store page — widget embed area
        </div>

        <div className="studio-preview-frame">
          <div className="studio-preview-bar">
            <span>🔲 BuildQuote Widget</span>
            <span style={{ marginLeft: '0.5rem' }}>{manufacturerName}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.6 }}>Not embedded · Preview only</span>
          </div>

          <div style={{ padding: '1rem' }}>
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--ds-text-muted)',
                marginBottom: '0.75rem',
              }}
            >
              {manufacturerName} system cards
            </div>

            {systems.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-faint)' }}>
                No staged systems available to preview yet.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {systems.map((sys) => (
                  <div key={sys.id} className="studio-system-card" style={{ fontSize: '0.85rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem', color: 'var(--ds-navy)' }}>
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
                          marginBottom: '0.6rem',
                        }}
                      >
                        {sys.category}
                      </div>
                    )}
                    <button
                      disabled
                      className="studio-btn studio-btn-primary"
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.3rem 0.6rem',
                        width: '100%',
                        justifyContent: 'center',
                      }}
                    >
                      Request quote
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: '0.75rem',
                textAlign: 'right',
                fontSize: '0.72rem',
                color: 'var(--ds-text-faint)',
              }}
            >
              Powered by BuildQuote
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          padding: '1rem 1.25rem',
          fontSize: '0.85rem',
          color: 'var(--ds-text-muted)',
        }}
      >
        <strong style={{ color: 'var(--ds-text-sub)' }}>Widget embed code</strong>
        <div
          style={{
            marginTop: '0.5rem',
            background: 'var(--ds-page-bg)',
            borderRadius: 6,
            padding: '0.65rem 0.75rem',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: 'var(--ds-text-faint)',
          }}
        >
          {'<script src="https://widget.buildquote.com.au/..."></script>'} — will be generated
          after publish
        </div>
      </div>
    </StudioShell>
  )
}
