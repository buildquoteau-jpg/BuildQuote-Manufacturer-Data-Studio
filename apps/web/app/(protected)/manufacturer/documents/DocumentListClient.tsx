'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  archiveDocument,
  supersedeDocument,
  deleteDocument,
} from '@/lib/studio-manufacturer/document-actions'
import { OpenDocumentButton } from '@/components/studio/OpenDocumentButton'

export type DocItem = {
  id: string
  documentName: string
  documentType: string | null
  documentDate: string | null
  status: string
  uploadedAt: string
  fileSizeBytes: number | null
  uploaderName: string | null
}

interface Props {
  documents: DocItem[]
  manufacturerId: string
}

// ─── Formatting ───────────────────────────────────────────────────────────────

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  uploaded:   { bg: '#e2e8f0', color: '#475569' },
  extracting: { bg: '#dbeafe', color: '#1d4ed8' },
  parsing:    { bg: '#dbeafe', color: '#1d4ed8' },
  extracted:  { bg: '#dcfce7', color: '#166534' },
  parsed:     { bg: '#dcfce7', color: '#166534' },
  approved:   { bg: '#dcfce7', color: '#166534' },
  failed:     { bg: '#fee2e2', color: '#991b1b' },
  rejected:   { bg: '#fee2e2', color: '#991b1b' },
  superseded: { bg: '#fef3c7', color: '#92400e' },
  archived:   { bg: '#f1f5f9', color: '#94a3b8' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: '#e2e8f0', color: '#64748b' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '0.2rem 0.6rem', borderRadius: 99,
      fontSize: '0.72rem', fontWeight: 700,
      letterSpacing: '0.02em', textTransform: 'uppercase',
      background: s.bg, color: s.color,
    }}>
      {status}
    </span>
  )
}

// ─── Action menu ──────────────────────────────────────────────────────────────

interface MenuProps {
  docId: string
  status: string
  manufacturerId: string
  onDone: () => void
}

function DocMenu({ docId, status, manufacturerId, onDone }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setActionError(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        setActionError((result as { error: string }).error)
        return
      }
      setOpen(false)
      setConfirmDelete(false)
      onDone()
    })
  }

  const canArchive = status !== 'archived' && status !== 'superseded'
  const canSupersede = status !== 'archived' && status !== 'superseded'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen((v) => !v); setConfirmDelete(false); setActionError(null) }}
        disabled={isPending}
        aria-label="Document actions"
        title="Document actions"
        style={{
          background: 'none',
          border: '1px solid var(--ds-border)',
          borderRadius: 6,
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isPending ? 'default' : 'pointer',
          color: 'var(--ds-text-muted)',
          fontSize: '1.1rem',
          lineHeight: 1,
          opacity: isPending ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        ⋮
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          minWidth: 170, zIndex: 50, overflow: 'hidden',
        }}>
          {actionError && (
            <div style={{
              padding: '0.5rem 0.8rem',
              fontSize: '0.73rem', color: '#991b1b',
              borderBottom: '1px solid var(--ds-border-soft)',
            }}>
              {actionError}
            </div>
          )}

          {confirmDelete ? (
            <div style={{ padding: '0.7rem 0.85rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-sub)', marginBottom: '0.6rem' }}>
                Permanently delete?
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => runAction(() => deleteDocument(docId, manufacturerId))}
                  disabled={isPending}
                  style={{
                    flex: 1, padding: '0.3rem 0.5rem', borderRadius: 4,
                    border: 'none', background: '#dc2626', color: '#fff',
                    fontSize: '0.75rem', fontWeight: 600,
                    cursor: isPending ? 'default' : 'pointer',
                  }}
                >
                  {isPending ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '0.3rem 0.6rem', borderRadius: 4,
                    border: '1px solid var(--ds-border)', background: 'none',
                    color: 'var(--ds-text-muted)', fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {canArchive && (
                <MenuItem
                  label="Archive"
                  color="var(--ds-text-sub)"
                  onClick={() => runAction(() => archiveDocument(docId, manufacturerId))}
                  disabled={isPending}
                />
              )}
              {canSupersede && (
                <MenuItem
                  label="Supersede"
                  color="#92400e"
                  onClick={() => runAction(() => supersedeDocument(docId, manufacturerId))}
                  disabled={isPending}
                />
              )}
              {(canArchive || canSupersede) && (
                <div style={{ borderTop: '1px solid var(--ds-border-soft)' }} />
              )}
              <MenuItem
                label="Delete"
                color="#dc2626"
                onClick={() => setConfirmDelete(true)}
                disabled={isPending}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label, onClick, disabled, color,
}: { label: string; onClick: () => void; disabled?: boolean; color: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%',
        padding: '0.55rem 0.85rem',
        background: 'none', border: 'none',
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--ds-text-faint)' : color,
        fontSize: '0.83rem', fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--ds-page-bg)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'none'
      }}
    >
      {label}
    </button>
  )
}

// ─── Single row ───────────────────────────────────────────────────────────────

function DocRow({ doc, manufacturerId, onDone }: { doc: DocItem; manufacturerId: string; onDone: () => void }) {
  const dimmed = doc.status === 'archived' || doc.status === 'superseded'
  return (
    <div style={{
      background: 'var(--ds-card-bg)',
      border: '1px solid var(--ds-border)',
      borderRadius: 8,
      padding: '0.9rem 1.1rem',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '0.5rem',
      opacity: dimmed ? 0.7 : 1,
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
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
        <OpenDocumentButton documentId={doc.id} manufacturerId={manufacturerId} variant="link" />
        <StatusBadge status={doc.status} />
        <DocMenu docId={doc.id} status={doc.status} manufacturerId={manufacturerId} onDone={onDone} />
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function DocumentListClient({ documents, manufacturerId }: Props) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)

  const activeDocs = documents.filter((d) => d.status !== 'archived')
  const archivedDocs = documents.filter((d) => d.status === 'archived')

  return (
    <div>
      {activeDocs.length === 0 ? (
        <div style={{
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8, padding: '1.5rem',
          textAlign: 'center',
          color: 'var(--ds-text-muted)', fontSize: '0.875rem',
        }}>
          No active documents. Upload one above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {activeDocs.map((doc) => (
            <DocRow key={doc.id} doc={doc} manufacturerId={manufacturerId} onDone={() => router.refresh()} />
          ))}
        </div>
      )}

      {archivedDocs.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--ds-text-muted)',
              fontSize: '0.8rem', fontWeight: 600, padding: '0.25rem 0',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}
          >
            <span style={{ fontSize: '0.6rem' }}>{showArchived ? '▼' : '▶'}</span>
            Archived ({archivedDocs.length})
          </button>

          {showArchived && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
              {archivedDocs.map((doc) => (
                <DocRow key={doc.id} doc={doc} manufacturerId={manufacturerId} onDone={() => router.refresh()} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
