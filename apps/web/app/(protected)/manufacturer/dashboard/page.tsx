import { StudioShell } from '@/components/studio/StudioShell'
import { StudioCard } from '@/components/studio/StudioCard'

export default function ManufacturerDashboardPage() {
  return (
    <StudioShell role="manufacturer" subtitle="Acme Aluminium">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>Dashboard</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Welcome to BuildQuote Data Studio. Manage your product data, review extractions, and preview your public page.
      </p>

      <div className="studio-card-grid">
        <StudioCard
          icon="📄"
          title="Documents"
          description="Upload product guides, install guides, and brochures for extraction."
          href="/manufacturer/documents"
        />
        <StudioCard
          icon="⚙️"
          title="Extraction Runs"
          description="View AI extraction run results from your uploaded documents."
          disabled
          href="/manufacturer/dashboard"
        />
        <StudioCard
          icon="✅"
          title="Review Staged Data"
          description="Verify extracted systems, profiles, components, and colours."
          href="/manufacturer/review"
        />
        <StudioCard
          icon="👁"
          title="Preview Public Page"
          description="See how your manufacturer page and system cards will look before publish."
          href="/manufacturer/preview"
        />
        <StudioCard
          icon="❓"
          title="Help & Support"
          description="Contact BuildQuote or find guides on uploading and reviewing your data."
          href="/manufacturer/help"
        />
      </div>

      <div className="studio-section">
        <div className="studio-section-heading">Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Documents', value: '3', note: 'uploaded' },
            { label: 'Extraction runs', value: '2', note: 'completed' },
            { label: 'Staged systems', value: '4', note: 'pending review' },
            { label: 'Components', value: '12', note: 'pending review' },
            { label: 'Publish status', value: '—', note: 'not published' },
          ].map((stat) => (
            <div key={stat.label} style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ds-navy)', marginBottom: '0.15rem' }}>{stat.value}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-sub)' }}>{stat.label}</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)' }}>{stat.note}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '0.5rem' }}>
          Placeholder counts — not connected to DB yet.
        </p>
      </div>
    </StudioShell>
  )
}
