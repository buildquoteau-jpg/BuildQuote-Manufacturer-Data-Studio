import { StudioShell } from '@/components/studio/StudioShell'
import {
  getAdminDocumentDetail,
  type AdminDocumentChunk,
  type AdminDocumentExtractionRun,
} from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string; documentId: string }
}

function formatDate(isoString: string | null): string {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

const DOC_STATUS_BADGE: Record<string, string> = {
  extracted: 'approved',
  parsed: 'approved',
  approved: 'approved',
  uploaded: 'draft',
  extracting: 'draft',
  parsing: 'draft',
  needs_review: 'draft',
  failed: 'error',
  rejected: 'error',
}

const RUN_STATUS_BADGE: Record<string, string> = {
  completed: 'approved',
  running: 'draft',
  queued: 'draft',
  failed: 'error',
}

function badgeClass(map: Record<string, string>, status: string): string {
  return `studio-badge studio-badge-${map[status] ?? 'draft'}`
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        fontSize: '0.83rem',
        padding: '0.35rem 0',
        borderBottom: '1px solid var(--ds-border-soft)',
      }}
    >
      <span style={{ color: 'var(--ds-text-faint)', minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--ds-text-muted)' }}>{value}</span>
    </div>
  )
}

function ExtractionRunPanel({ run }: { run: AdminDocumentExtractionRun }) {
  return (
    <div
      style={{
        background: 'var(--ds-card-bg)',
        border: '1px solid var(--ds-border)',
        borderRadius: 8,
        padding: '0.9rem 1.1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.65rem',
          flexWrap: 'wrap',
          gap: '0.4rem',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {run.runType.replace(/_/g, ' ')}
        </span>
        <span className={badgeClass(RUN_STATUS_BADGE, run.status)}>{run.status}</span>
      </div>
      <MetaRow label="Tool" value={run.toolName ?? '—'} />
      <MetaRow label="Started" value={formatDate(run.startedAt)} />
      <MetaRow label="Completed" value={formatDate(run.completedAt)} />
      {run.errorMessage && (
        <div
          style={{
            marginTop: '0.65rem',
            fontSize: '0.8rem',
            color: 'var(--ds-text-muted)',
            background: 'var(--ds-warn-bg)',
            borderRadius: 4,
            padding: '0.4rem 0.6rem',
          }}
        >
          Error: {run.errorMessage}
        </div>
      )}
    </div>
  )
}

function ChunkCard({ chunk }: { chunk: AdminDocumentChunk }) {
  return (
    <div
      style={{
        background: 'var(--ds-card-bg)',
        border: '1px solid var(--ds-border)',
        borderRadius: 8,
        padding: '0.75rem 1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
          Chunk {chunk.chunkIndex}
        </span>
        {chunk.pageNumber !== null && (
          <span
            style={{
              fontSize: '0.73rem',
              color: 'var(--ds-text-faint)',
              background: 'var(--ds-border-soft)',
              borderRadius: 4,
              padding: '0.1rem 0.4rem',
            }}
          >
            page {chunk.pageNumber}
          </span>
        )}
        <span style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)', marginLeft: 'auto' }}>
          {chunk.charCount} chars
        </span>
      </div>
      {chunk.rawTextPreview ? (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--ds-text-muted)',
            margin: 0,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {chunk.rawTextPreview}
          {chunk.charCount > chunk.rawTextPreview.length && (
            <span style={{ color: 'var(--ds-text-faint)' }}> …</span>
          )}
        </p>
      ) : (
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint)', margin: 0 }}>
          No text content
        </p>
      )}
    </div>
  )
}

export default async function AdminDocumentDetailPage({ params }: Props) {
  const { manufacturerId, documentId } = params
  const result = await getAdminDocumentDetail(manufacturerId, documentId)

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="Document detail">
        <div style={{ marginBottom: '1.25rem' }}>
          <a
            href={`/admin/manufacturers/${manufacturerId}/documents`}
            style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
          >
            ← Documents
          </a>
        </div>
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer: m, document: doc, pageCount, chunkCount, chunks, latestRun } = result

  return (
    <StudioShell role="admin" subtitle={`${m.name} · ${doc.documentName}`}>
      {/* Breadcrumb */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          fontSize: '0.82rem',
          color: 'var(--ds-text-faint)',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <a
          href={`/admin/manufacturers/${manufacturerId}`}
          style={{ color: 'var(--ds-text-muted)' }}
        >
          {m.name}
        </a>
        <span>›</span>
        <a
          href={`/admin/manufacturers/${manufacturerId}/documents`}
          style={{ color: 'var(--ds-text-muted)' }}
        >
          Documents
        </a>
        <span>›</span>
        <span>{doc.documentName}</span>
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
        <h1 style={{ fontSize: '1.2rem' }}>📄 {doc.documentName}</h1>
        <span className={badgeClass(DOC_STATUS_BADGE, doc.status)}>{doc.status}</span>
      </div>
      <p style={{ fontSize: '0.83rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem' }}>
        Local extraction test · Read-only extracted chunks · Parser and verification writes come later
      </p>

      {/* Document metadata */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Document metadata</div>
        <div
          style={{
            background: 'var(--ds-card-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 8,
            padding: '0.75rem 1.1rem',
          }}
        >
          <MetaRow label="Document type" value={doc.documentType?.replace(/_/g, ' ') ?? '—'} />
          <MetaRow label="Document date" value={doc.documentDate ?? '—'} />
          <MetaRow label="File size" value={formatFileSize(doc.fileSizeBytes)} />
          <MetaRow label="Source" value={
            doc.storageProvider === 'local_only'
              ? 'Local extraction test — no source file storage connected yet'
              : doc.storageProvider
          } />
          <MetaRow label="Pages extracted" value={pageCount} />
          <MetaRow label="Chunks extracted" value={chunkCount} />
          <MetaRow
            label="Uploaded / created"
            value={formatDate(doc.uploadedAt)}
          />
          {doc.notes && <MetaRow label="Notes" value={doc.notes} />}
        </div>
      </div>

      {/* Extraction run */}
      {latestRun && (
        <div className="studio-section">
          <div className="studio-section-heading">Latest extraction run</div>
          <ExtractionRunPanel run={latestRun} />
        </div>
      )}

      {/* Chunk viewer */}
      <div className="studio-section">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.65rem',
            flexWrap: 'wrap',
            gap: '0.4rem',
          }}
        >
          <div className="studio-section-heading" style={{ margin: 0 }}>
            Extracted chunks
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
            {chunkCount} chunk{chunkCount !== 1 ? 's' : ''}
            {chunkCount > chunks.length ? ` (showing first ${chunks.length})` : ''}
          </span>
        </div>

        {chunks.length === 0 ? (
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
            No extracted chunks found yet.
            <br />
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)', display: 'block', marginTop: '0.4rem' }}>
              Run the local extraction script to populate this document with pages and chunks.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {chunks.map((chunk) => (
              <ChunkCard key={chunk.id} chunk={chunk} />
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: '1rem',
          fontSize: '0.77rem',
          color: 'var(--ds-text-faint)',
          paddingLeft: '0.25rem',
          lineHeight: 1.6,
        }}
      >
        Read-only extracted chunks · No source file storage is connected yet ·
        AI parser and staged catalogue writes come in a later chunk
      </div>
    </StudioShell>
  )
}
