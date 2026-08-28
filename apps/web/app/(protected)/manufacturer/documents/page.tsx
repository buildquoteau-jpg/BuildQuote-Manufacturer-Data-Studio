import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerDocuments,
  getManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { DocumentsClient } from './DocumentsClient'
import { DocumentListClient } from './DocumentListClient'

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
  const documents = result.ok ? result.documents : []
  const workspaceName = mfrResult.ok ? mfrResult.manufacturer.name : undefined

  return (
    <StudioShell role="manufacturer" workspaceName={workspaceName} subtitle="Documents">
      <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>Documents</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', margin: '0 0 1.5rem', maxWidth: 640, lineHeight: 1.6 }}>
        Upload your catalogues, installation guides, technical data sheets and brochures here —
        this is the source material BuildQuote reads to build your System Cards and the underlying
        product facts (what an AI agent will know about each product, with page-level evidence).
        A document isn&apos;t tied to one product; the same install guide can support several
        System Cards. After upload a document sits as <strong>Uploaded</strong> until BuildQuote
        processes it (Queued → Extracting → In Review → Approved) — this page doesn&apos;t edit
        product data directly; that happens once extraction is done, in{' '}
        <a href="/manufacturer/cms" style={{ fontWeight: 600 }}>Products</a>.
      </p>

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

        <DocumentListClient documents={documents} manufacturerId={ctx.manufacturerId} />
      </div>
    </StudioShell>
  )
}
