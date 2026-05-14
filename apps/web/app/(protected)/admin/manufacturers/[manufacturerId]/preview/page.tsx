import { StudioShell } from '@/components/studio/StudioShell'
import { StudioStatusBadge } from '@/components/studio/StudioStatusBadge'

type Props = {
  params: { manufacturerId: string }
}

const PLACEHOLDER_SYSTEMS = [
  { name: 'AlumaSeries 50', category: 'Windows', profiles: 3, status: 'approved' },
  { name: 'AlumaSeries 65TH', category: 'Windows', profiles: 4, status: 'draft' },
  { name: 'SlidePro 80', category: 'Sliding Doors', profiles: 2, status: 'draft' },
]

export default function AdminManufacturerPreviewPage({ params }: Props) {
  const { manufacturerId } = params

  return (
    <StudioShell role="admin" subtitle="Public page preview">
      <div style={{ marginBottom: '1.25rem' }}>
        <a href={`/admin/manufacturers/${manufacturerId}`} style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          ← Manufacturer detail
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Public Page Preview</h1>
        <span className="studio-badge studio-badge-draft">Draft</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '1.25rem' }}>
        Studio preview only — this is not the live public page. No data has been published to production.
        Manufacturers and BuildQuote admin can preview here before any publish action.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <StudioStatusBadge
          current="draft"
          note="— Approved and Published states not yet reached."
        />
      </div>

      <div className="studio-preview-frame">
        <div className="studio-preview-bar">
          <span>🔍 Studio preview</span>
          <span style={{ marginLeft: 'auto' }}>Public manufacturer page — not live</span>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Manufacturer header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--ds-border-soft)' }}>
            <div style={{ width: 56, height: 56, background: 'var(--ds-page-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
              🏭
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', marginBottom: '0.2rem' }}>Acme Aluminium</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', margin: 0 }}>
                Manufacturer of premium aluminium window and door systems. ABN: 00 000 000 000
              </p>
            </div>
          </div>

          {/* System cards */}
          <h3 style={{ fontSize: '0.9rem', color: 'var(--ds-text-sub)', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Systems
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {PLACEHOLDER_SYSTEMS.map((sys) => (
              <div key={sys.name} className="studio-system-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ds-navy)' }}>{sys.name}</strong>
                  <span className={`studio-badge studio-badge-${sys.status}`}>{sys.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', marginBottom: '0.75rem' }}>
                  {sys.category} · {sys.profiles} profile{sys.profiles !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button disabled className="studio-btn studio-btn-ghost" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
                    View system
                  </button>
                  <button disabled className="studio-btn studio-btn-primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
                    Add to RFQ
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Colours */}
          <h3 style={{ fontSize: '0.9rem', color: 'var(--ds-text-sub)', fontWeight: 600, marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Colours / Finishes
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {['Anodised Silver', 'Monument', 'Surfmist', 'Basalt'].map((c) => (
              <span key={c} style={{ background: 'var(--ds-page-bg)', border: '1px solid var(--ds-border)', borderRadius: 4, padding: '0.25rem 0.6rem', fontSize: '0.8rem', color: 'var(--ds-text-sub)' }}>
                {c}
              </span>
            ))}
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)', alignSelf: 'center' }}>+ more (placeholder)</span>
          </div>

          {/* CTA */}
          <div style={{ background: 'var(--ds-page-bg)', borderRadius: 8, padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '0.75rem' }}>
              Interested in these systems? Request a quote from your supplier.
            </p>
            <button disabled className="studio-btn studio-btn-primary">
              Request quote — preview only
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
        Admin action: production publish is not available until data is approved and publish flow is implemented.
      </div>
    </StudioShell>
  )
}
