import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminManufacturerDocuments } from '@/lib/studio-admin/manufacturer-workspace'
import type { AdminWorkspaceDocument } from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1_000_000) return ` · ${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return ` · ${Math.round(bytes / 1_000)} KB`
  return ` · ${bytes} B`
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoString
  }
}

const STATUS_BADGE: Record<string, string> = {
  extracted:  'approved',
  parsed:     'approved',
  approved:   'approved',
  uploaded:   'draft',
  extracting: 'draft',
  parsing:    'draft',
  failed:     'error',
  rejected:   'error',
}

function docBadgeClass(status: string): string {
  return `studio-badge studio-badge-${STATUS_BADGE[status] ?? 'draft'}`
}

function DocRow({ doc }: { doc: AdminWorkspaceDocument }) {
  return (
    <div
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
          {doc.documentType?.replace(/_/g, ' ') ?? 'unknown type'}
          {doc.documentDate ? ` · ${doc.documentDate}` : ''}
          {formatFileSize(doc.fileSizeBytes)}
          {' · Uploaded '}
          {formatDate(doc.uploadedAt)}
        </div>
      </div>
      <span className={docBadgeClass(doc.status)}>{doc.status}</span>
    </div>
  )
}

export default async function AdminManufacturerDocumentsPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerDocuments(manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="Documents">
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

  const { manufacturer: m, documents } = result

  return (
    <StudioShell role="admin" subtitle={`${m.name} · Documents`}>
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
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.35rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Documents</h1>
        <span
          className={`studio-badge studio-badge-${m.status === 'active' ? 'approved' : 'draft'}`}
        >
          {m.name}
        </span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem' }}>
        Source documents for this manufacturer workspace. Read-only admin support view.
      </p>

      <div className="studio-section" style={{ marginTop: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.65rem',
          }}
        >
          <div className="studio-section-heading" style={{ margin: 0 }}>
            Source documents
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {documents.length === 0 ? (
          <div
            style={{
              background: 'var(--ds-card-bg)',
              border: '1px solid var(--ds-border-soft)',
              borderRadius: 8,
              padding: '1.5rem',
              textAlign: 'center',
              color: 'var(--ds-text-muted)',
              fontSize: '0.875rem',
            }}
          >
            No source documents have been added for this workspace yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {documents.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: '1rem',
          fontSize: '0.78rem',
          color: 'var(--ds-text-faint)',
          paddingLeft: '0.25rem',
        }}
      >
        Storage paths and internal keys are not shown. Upload pipeline not active yet.
      </div>
    </StudioShell>
  )
}
