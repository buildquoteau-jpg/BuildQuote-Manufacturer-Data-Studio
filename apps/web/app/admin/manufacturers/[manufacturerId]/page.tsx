import { StudioShell } from '../../../../components/studio/StudioShell'
import { StudioCard } from '../../../../components/studio/StudioCard'

type Props = {
  params: { manufacturerId: string }
}

export default function AdminManufacturerDetailPage({ params }: Props) {
  const { manufacturerId } = params

  return (
    <StudioShell role="admin" subtitle="Manufacturer detail">
      <div style={{ marginBottom: '1.25rem' }}>
        <a href="/admin/manufacturers" style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          ← All manufacturers
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Acme Aluminium</h1>
        <span className="studio-badge studio-badge-approved">active</span>
      </div>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Workspace ID: <code style={{ background: 'var(--ds-page-bg)', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.8rem' }}>{manufacturerId}</code>
        {' '}· Placeholder data — not connected to DB yet
      </p>

      <div className="studio-card-grid" style={{ marginBottom: '2rem' }}>
        <StudioCard
          icon="📄"
          title="Documents"
          description="3 source documents uploaded. Upload pipeline not connected."
          href={`/admin/manufacturers/${manufacturerId}`}
          disabled
        />
        <StudioCard
          icon="⚙️"
          title="Extraction Runs"
          description="2 runs completed. Extraction not connected."
          href={`/admin/manufacturers/${manufacturerId}`}
          disabled
        />
        <StudioCard
          icon="✅"
          title="Review Staged Data"
          description="4 staged systems, 12 components. Review workflow not connected."
          href={`/admin/manufacturers/${manufacturerId}`}
          disabled
        />
        <StudioCard
          icon="👁"
          title="Preview Public Page"
          description="Preview how this manufacturer's public page will look before publishing."
          href={`/admin/manufacturers/${manufacturerId}/preview`}
        />
        <StudioCard
          icon="🔲"
          title="Widget Preview"
          description="Preview the embeddable system card widget for this manufacturer."
          href={`/admin/manufacturers/${manufacturerId}/widget-preview`}
        />
      </div>

      <div className="studio-section">
        <div className="studio-section-heading">Publish status</div>
        <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          Production publish is BuildQuote-admin gated. No data has been published to production yet.
          The publish flow will appear here once review and RLS are in place.
        </div>
      </div>

      <div className="studio-section">
        <div className="studio-section-heading">Workspace members</div>
        <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          Member management will appear here once auth is wired. Admin can invite, suspend, and manage roles for this workspace.
        </div>
      </div>
    </StudioShell>
  )
}
