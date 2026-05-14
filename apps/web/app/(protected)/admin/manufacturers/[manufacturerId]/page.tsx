import { redirect } from 'next/navigation'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioCard } from '@/components/studio/StudioCard'
import { getAdminManufacturerDetail } from '@/lib/studio-admin/manufacturers'

type Props = {
  params: { manufacturerId: string }
}

export default async function AdminManufacturerDetailPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerDetail(manufacturerId)

  if (!result.ok) {
    if (result.notFound) redirect('/admin/manufacturers')

    return (
      <StudioShell role="admin" subtitle="Manufacturer detail">
        <div style={{ marginBottom: '1.25rem' }}>
          <a href="/admin/manufacturers" style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
            ← All manufacturers
          </a>
        </div>
        <div className="studio-warn">
          Could not load manufacturer: {result.error}
        </div>
      </StudioShell>
    )
  }

  const { manufacturer: m } = result

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
          className={`studio-badge studio-badge-${
            m.status === 'active' ? 'approved' : 'draft'
          }`}
        >
          {m.status}
        </span>
      </div>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
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

      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '0.6rem',
          marginBottom: '1.75rem',
        }}
      >
        {[
          { label: 'Documents', value: m.documents.length },
          { label: 'Staged systems', value: m.systemCount },
          { label: 'Staged components', value: m.componentCount },
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
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-navy)', marginBottom: '0.1rem' }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-sub)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Workspace action cards */}
      <div className="studio-card-grid" style={{ marginBottom: '2rem' }}>
        <StudioCard
          icon="📄"
          title="Documents"
          description={`${m.documents.length} source document${m.documents.length !== 1 ? 's' : ''}. Upload pipeline not connected.`}
          href={`/admin/manufacturers/${manufacturerId}`}
          disabled
        />
        <StudioCard
          icon="⚙️"
          title="Extraction Runs"
          description="Extraction pipeline not connected to this view yet."
          href={`/admin/manufacturers/${manufacturerId}`}
          disabled
        />
        <StudioCard
          icon="✅"
          title="Review Staged Data"
          description={`${m.systemCount} system${m.systemCount !== 1 ? 's' : ''}, ${m.componentCount} component${m.componentCount !== 1 ? 's' : ''} staged. Review workflow not connected.`}
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

      {/* Source documents list */}
      <div className="studio-section">
        <div className="studio-section-heading">Source documents</div>
        {m.documents.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-faint)' }}>
            No documents uploaded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {m.documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border)',
                  borderRadius: 8,
                  padding: '0.8rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.15rem' }}>
                    📄 {doc.documentName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                    {doc.documentType?.replace('_', ' ') ?? 'unknown type'}
                    {' · '}
                    {new Date(doc.uploadedAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>
                <span
                  className={`studio-badge studio-badge-${
                    doc.status === 'approved' || doc.status === 'extracted'
                      ? 'approved'
                      : doc.status === 'failed' || doc.status === 'rejected'
                      ? 'draft'
                      : 'draft'
                  }`}
                >
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}
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
