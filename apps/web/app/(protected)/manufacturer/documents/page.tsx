import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerDocuments,
  getManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import type { ManufacturerDocument } from '@/lib/studio-manufacturer/workspace'
import { DocumentsClient } from './DocumentsClient'
import { OpenDocumentButton } from '@/components/studio/OpenDocumentButton'

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

export default async function ManufacturerDocumentsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

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

  const [result, mfrResult] = await Promise.all([
    getManufacturerDocuments(ctx.manufacturerId),
    getManufacturerInfo(ctx.manufacturerId),
  ])
  const documents: ManufacturerDocument[] = result.ok ? result.documents : []
  const workspaceName = mfrResult.ok ? mfrResult.manufacturer.name : undefined

  return (
    <StudioShell role="manufacturer" workspaceName={workspaceName} subtitle="Documents">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Documents</h1>

      {/* Upload zone */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Upload a document</div>
        <DocumentsClient manufacturerId={ctx.manufacturerId} />
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.8rem',
            color: 'var(--ds-text-faint)',
          }}
        >
          Accepted: PDF, CSV, XLSX, PNG, JPG · Max 50 MB
        </div>
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
                    {doc.documentName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                    {formatDocType(doc.documentType)}
                    {doc.documentDate ? ` · ${doc.documentDate}` : ''}
                    {formatFileSize(doc.fileSizeBytes)}
                    {' · Uploaded '}
                    {formatDate(doc.uploadedAt)}
                    {doc.uploaderName ? ` by ${doc.uploaderName}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <OpenDocumentButton documentId={doc.id} manufacturerId={ctx.manufacturerId} variant="link" />
                  <span className={docBadgeClass(doc.status)}>{doc.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  )
}
