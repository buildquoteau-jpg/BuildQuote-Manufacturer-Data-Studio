import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContext,
  getManufacturerDocuments,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import type { ManufacturerDocument } from '@/lib/studio-manufacturer/workspace'

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1_000_000) return ` · ${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return ` · ${Math.round(bytes / 1_000)} KB`
  return ` · ${bytes} B`
}

function formatDocType(type: string | null): string {
  if (!type) return ''
  return type.replace(/_/g, ' ')
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
  extracted: 'approved',
  parsed:    'approved',
  approved:  'approved',
  uploaded:  'draft',
  extracting: 'draft',
  parsing:   'draft',
  failed:    'error',
  rejected:  'error',
}

function docBadgeClass(status: string): string {
  return `studio-badge studio-badge-${STATUS_BADGE[status] ?? 'draft'}`
}

const DOCUMENT_TYPES = [
  { id: 'product_guide', label: 'Product Guide' },
  { id: 'installation_guide', label: 'Installation Guide' },
  { id: 'brochure', label: 'Brochure / Catalogue' },
]

export default async function ManufacturerDocumentsPage() {
  const session = await getStudioSession()
  const ctx = resolveWorkspaceContext(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Documents">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Documents</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerDocuments(ctx.manufacturerId)
  const documents: ManufacturerDocument[] = result.ok ? result.documents : []

  return (
    <StudioShell role="manufacturer" subtitle="Documents">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Documents</h1>

      {/* Upload zone — not connected yet */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Upload a document</div>
        <div className="studio-upload-zone">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📎</div>
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            Upload pipeline coming later
          </p>
          <p style={{ fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Document upload will be enabled once storage and auth are wired.
          </p>

          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '1.25rem',
            }}
          >
            {DOCUMENT_TYPES.map((dt) => (
              <button
                key={dt.id}
                disabled
                className="studio-btn studio-btn-ghost"
                style={{ fontSize: '0.82rem' }}
              >
                {dt.label}
              </button>
            ))}
          </div>

          <button disabled className="studio-btn studio-btn-primary">
            Select file to upload — coming later
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: '0.75rem',
          fontSize: '0.8rem',
          color: 'var(--ds-text-faint)',
          paddingLeft: '0.25rem',
        }}
      >
        Accepted: PDF · Max 50 MB · Supported types: Product Guide, Installation Guide,
        Brochure/Catalogue
      </div>

      {/* Source documents */}
      <div className="studio-section">
        <div className="studio-section-heading">Source documents</div>

        {result.ok === false && (
          <div className="studio-warn" style={{ marginBottom: '0.75rem' }}>
            Could not load documents: {result.error}
          </div>
        )}

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                style={{
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border)',
                  borderRadius: 8,
                  padding: '0.9rem 1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div
                    style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}
                  >
                    📄 {doc.documentName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                    {formatDocType(doc.documentType)}
                    {doc.documentDate ? ` · ${doc.documentDate}` : ''}
                    {formatFileSize(doc.fileSizeBytes)}
                    {' · Uploaded '}
                    {formatDate(doc.uploadedAt)}
                  </div>
                </div>
                <span className={docBadgeClass(doc.status)}>{doc.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  )
}
