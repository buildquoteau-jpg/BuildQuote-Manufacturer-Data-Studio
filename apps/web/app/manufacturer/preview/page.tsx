import { StudioShell } from '../../../components/studio/StudioShell'
import { StudioStatusBadge } from '../../../components/studio/StudioStatusBadge'

const PLACEHOLDER_SYSTEMS = [
  { name: 'AlumaSeries 50', category: 'Windows', profiles: 3, status: 'draft' },
  { name: 'AlumaSeries 65TH', category: 'Windows', profiles: 4, status: 'draft' },
  { name: 'SlidePro 80', category: 'Sliding Doors', profiles: 2, status: 'draft' },
]

export default function ManufacturerPreviewPage() {
  return (
    <StudioShell role="manufacturer" subtitle="Preview">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Preview Public Page</h1>
        <span className="studio-badge studio-badge-draft">Draft</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '0.75rem' }}>
        This is a Studio-only preview. Your public manufacturer page is not live yet.
        Nothing shown here has been published to BuildQuote or RFQ.
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
          <span style={{ marginLeft: 'auto' }}>Draft · Not published</span>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--ds-border-soft)' }}>
            <div style={{ width: 52, height: 52, background: 'var(--ds-page-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>
              🏭
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>Acme Aluminium</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: 0 }}>
                Premium aluminium window and door systems. Placeholder — not your live data yet.
              </p>
            </div>
          </div>

          {/* Systems */}
          <h3 style={{ fontSize: '0.85rem', color: 'var(--ds-text-sub)', fontWeight: 700, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Systems
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {PLACEHOLDER_SYSTEMS.map((sys) => (
              <div key={sys.name} className="studio-system-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.88rem', color: 'var(--ds-navy)' }}>{sys.name}</strong>
                  <span className="studio-badge studio-badge-draft">{sys.status}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginBottom: '0.65rem' }}>
                  {sys.category} · {sys.profiles} profiles
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button disabled className="studio-btn studio-btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}>
                    View system
                  </button>
                  <button disabled className="studio-btn studio-btn-primary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}>
                    Add to RFQ
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Colours */}
          <h3 style={{ fontSize: '0.85rem', color: 'var(--ds-text-sub)', fontWeight: 700, marginBottom: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Colours / Finishes
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {['Anodised Silver', 'Monument', 'Surfmist', 'Basalt'].map((c) => (
              <span key={c} style={{ background: 'var(--ds-page-bg)', border: '1px solid var(--ds-border)', borderRadius: 4, padding: '0.22rem 0.55rem', fontSize: '0.78rem', color: 'var(--ds-text-sub)' }}>
                {c}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div style={{ background: 'var(--ds-page-bg)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '0.6rem' }}>
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
