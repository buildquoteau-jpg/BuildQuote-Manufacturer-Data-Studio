import { redirect } from 'next/navigation'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioCard } from '@/components/studio/StudioCard'
import { getAdminManufacturerWorkspace } from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string }
}

export default async function AdminManufacturerDetailPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerWorkspace(manufacturerId)

  if (!result.ok) {
    if (result.forbidden) redirect('/admin/manufacturers')

    return (
      <StudioShell role="admin" subtitle="Manufacturer detail">
        <div style={{ marginBottom: '1.25rem' }}>
          <a href="/admin/manufacturers" style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
            ← All manufacturers
          </a>
        </div>
        <div className="studio-warn">Could not load manufacturer: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer: m, documentCount, systemCount, componentCount, profileCount, colourCount } = result

  return (
    <StudioShell role="admin" subtitle={m.name}>
      <div style={{ marginBottom: '1.25rem' }}>
        <a href="/admin/manufacturers" style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
          ← All manufacturers
        </a>
      </div>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.35rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>{m.name}</h1>
        <span
          className={`studio-badge studio-badge-${m.status === 'active' ? 'approved' : 'draft'}`}
        >
          {m.status}
        </span>
      </div>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
        <code
          style={{
            background: 'var(--ds-page-bg)',
            padding: '0.1rem 0.35rem',
            borderRadius: 4,
            fontSize: '0.78rem',
          }}
        >
          {m.slug}
        </code>
        {m.description && (
          <span style={{ marginLeft: '0.75rem' }}>{m.description}</span>
        )}
      </p>
      <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginBottom: '1.5rem' }}>
        BuildQuote admin support view for this manufacturer workspace.
      </p>

      <div className="studio-info" style={{ marginBottom: '1.5rem' }}>
        Read-only support workspace. Publishing and edits are not active yet.
      </div>

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '0.6rem',
          marginBottom: '1.75rem',
        }}
      >
        {[
          { label: 'Documents', value: documentCount },
          { label: 'Staged systems', value: systemCount },
          { label: 'Components', value: componentCount },
          { label: 'Profiles', value: profileCount },
          { label: 'Colours', value: colourCount },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: 'var(--ds-card-bg)',
              border: '1px solid var(--ds-border-soft)',
              borderRadius: 8,
              padding: '0.75rem 1rem',
            }}
          >
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--ds-navy)',
                marginBottom: '0.1rem',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-sub)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Workspace support navigation */}
      <div className="studio-card-grid" style={{ marginBottom: '2rem' }}>
        <StudioCard
          icon="📄"
          title="Documents"
          description={`${documentCount} source document${documentCount !== 1 ? 's' : ''}. View uploaded source documents for this workspace.`}
          href={`/admin/manufacturers/${manufacturerId}/documents`}
        />
        <StudioCard
          icon="✅"
          title="Review"
          description={`${systemCount} system${systemCount !== 1 ? 's' : ''}, ${componentCount} component${componentCount !== 1 ? 's' : ''} staged. Read-only review summary.`}
          href={`/admin/manufacturers/${manufacturerId}/review`}
        />
        <StudioCard
          icon="👁"
          title="Preview"
          description="Private admin preview of this manufacturer's public page and staged systems."
          href={`/admin/manufacturers/${manufacturerId}/preview`}
        />
        <StudioCard
          icon="🔲"
          title="Widget preview"
          description="Preview the embeddable system card widget for this manufacturer."
          href={`/admin/manufacturers/${manufacturerId}/widget-preview`}
        />
      </div>

      {/* Publish status */}
      <div className="studio-section">
        <div className="studio-section-heading">Publish status</div>
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
          Production publish is BuildQuote-admin gated. No data has been published to production
          yet. The publish flow will appear here once review and RLS are in place.
        </div>
      </div>

      {/* Workspace members */}
      <div className="studio-section">
        <div className="studio-section-heading">Workspace members</div>
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
          Member management will appear here once the invite flow is built. Admin can invite,
          suspend, and manage roles for this workspace.
        </div>
      </div>
    </StudioShell>
  )
}
