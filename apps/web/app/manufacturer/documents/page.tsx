import { StudioShell } from '../../../components/studio/StudioShell'

const DOCUMENT_TYPES = [
  { id: 'product_guide', label: 'Product Guide', desc: 'Main product specification document or catalogue' },
  { id: 'install_guide', label: 'Installation Guide', desc: 'Installation and fixing instructions' },
  { id: 'brochure', label: 'Brochure / Catalogue', desc: 'Marketing brochure or product range catalogue' },
]

const PLACEHOLDER_DOCS = [
  { name: 'Acme AlumaSeries Product Guide 2024.pdf', type: 'product_guide', status: 'extracted', date: '12 Apr 2025' },
  { name: 'SlidePro Installation Manual.pdf', type: 'install_guide', status: 'uploaded', date: '8 Apr 2025' },
]

export default function ManufacturerDocumentsPage() {
  return (
    <StudioShell role="manufacturer" subtitle="Documents">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Documents</h1>

      {/* Upload zone */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Upload a document</div>
        <div className="studio-upload-zone">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📎</div>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Upload pipeline not connected yet</p>
          <p style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Upload will be enabled once storage and auth are wired.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {DOCUMENT_TYPES.map((dt) => (
              <button
                key={dt.id}
                disabled
                className="studio-btn studio-btn-ghost"
                style={{ fontSize: '0.82rem' }}
                title={dt.desc}
              >
                {dt.label}
              </button>
            ))}
          </div>

          <button disabled className="studio-btn studio-btn-primary">
            Select file to upload — not connected
          </button>
        </div>
      </div>

      {/* Accepted types */}
      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--ds-text-faint)', paddingLeft: '0.25rem' }}>
        Accepted: PDF · Max 50 MB · Supported types: Product Guide, Installation Guide, Brochure/Catalogue
      </div>

      {/* Existing documents */}
      <div className="studio-section">
        <div className="studio-section-heading">Uploaded documents</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginBottom: '0.75rem' }}>
          Placeholder data — not connected to DB yet.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {PLACEHOLDER_DOCS.map((doc) => (
            <div key={doc.name} style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  📄 {doc.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                  {doc.type.replace('_', ' ')} · Uploaded {doc.date}
                </div>
              </div>
              <span className={`studio-badge studio-badge-${doc.status === 'extracted' ? 'approved' : 'draft'}`}>
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </StudioShell>
  )
}
