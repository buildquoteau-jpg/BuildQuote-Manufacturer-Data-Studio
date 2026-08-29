'use client'

// Spreadsheet-style systems table (design doc addendum 3 §C5). Name is
// inline-editable and saves on blur through the same field_verifications
// path every other text field on a system uses — no new write path needed.
// "+ Add system" creates the row with its typed name directly (createBlankSystem
// extended to accept one) and lands the manufacturer straight in that
// system's guided setup flow, matching "list it, then click in and set it up."

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createBlankSystem, upsertFieldVerification } from '@/lib/studio-manufacturer/verification-actions'

export type SystemRow = {
  id: string
  name: string
  photosCount: number
  linksCount: number
  documentsCount: number
  setupStatus: 'not_started' | 'in_progress' | 'ready_to_verify'
}

const STATUS_LABEL: Record<SystemRow['setupStatus'], { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not started', color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  in_progress: { label: 'In progress', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  ready_to_verify: { label: 'Ready to verify', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
}

export function SystemsTable({
  manufacturerId,
  initialRows,
}: {
  manufacturerId: string
  initialRows: SystemRow[]
}) {
  const [rows, setRows] = useState(initialRows)
  const [newName, setNewName] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function renameRow(id: string, name: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
  }

  function saveRename(id: string, name: string) {
    upsertFieldVerification(id, manufacturerId, 'name', null, name, 'edited', null).then((res) => {
      if (!res.ok) setError(res.error)
    })
  }

  function addSystem() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const res = await createBlankSystem(manufacturerId, name)
      if (!res.ok) { setError(res.error); return }
      setNewName('')
      router.push(`/manufacturer/systems/${res.id}/setup`)
    })
  }

  return (
    <div style={{ marginTop: '1.25rem' }}>
      {error && (
        <div style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: '0.6rem' }}>{error}</div>
      )}

      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={rowGridStyle('header')}>
          <div style={headerCellStyle}>System name</div>
          <div style={headerCellStyle}>Photos</div>
          <div style={headerCellStyle}>Links</div>
          <div style={headerCellStyle}>Documents</div>
          <div style={headerCellStyle}>Setup status</div>
          <div style={headerCellStyle} />
        </div>

        {rows.length === 0 && (
          <div style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
            No systems yet — add your first one below.
          </div>
        )}

        {rows.map((r) => {
          const status = STATUS_LABEL[r.setupStatus]
          return (
            <div key={r.id} style={rowGridStyle('body')}>
              <input
                value={r.name}
                onChange={(e) => renameRow(r.id, e.target.value)}
                onBlur={(e) => saveRename(r.id, e.target.value)}
                placeholder="System name"
                style={nameInputStyle}
              />
              <div style={cellStyle}>{r.photosCount}</div>
              <div style={cellStyle}>{r.linksCount}</div>
              <div style={cellStyle}>{r.documentsCount}</div>
              <div style={cellStyle}>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, color: status.color, background: status.bg,
                  borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
                }}>
                  {status.label}
                </span>
              </div>
              <div style={{ ...cellStyle, justifyContent: 'flex-end' }}>
                <Link href={`/manufacturer/systems/${r.id}/setup`} style={openLinkStyle}>
                  Open →
                </Link>
              </div>
            </div>
          )
        })}

        <div style={{ ...rowGridStyle('body'), background: 'var(--ds-surface, rgba(255,255,255,0.02))' }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSystem() }}
            placeholder="+ Add a system (e.g. Axon Cladding)"
            disabled={pending}
            style={nameInputStyle}
          />
          <div style={cellStyle} />
          <div style={cellStyle} />
          <div style={cellStyle} />
          <div style={cellStyle} />
          <div style={{ ...cellStyle, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={addSystem}
              disabled={pending || !newName.trim()}
              style={{
                fontSize: '0.78rem', fontWeight: 700, color: '#fff', background: '#185D7A',
                border: 'none', borderRadius: 8, padding: '6px 14px',
                cursor: pending || !newName.trim() ? 'default' : 'pointer',
                opacity: pending || !newName.trim() ? 0.6 : 1,
              }}
            >
              {pending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function rowGridStyle(kind: 'header' | 'body'): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 2fr) 80px 80px 110px 160px 100px',
    alignItems: 'center',
    gap: '0.6rem',
    padding: kind === 'header' ? '0.55rem 0.9rem' : '0.4rem 0.9rem',
    borderBottom: '1px solid var(--ds-border)',
    background: kind === 'header' ? 'var(--ds-surface, rgba(255,255,255,0.03))' : undefined,
  }
}

const headerCellStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--ds-text-faint)',
}

const cellStyle: React.CSSProperties = {
  fontSize: '0.85rem', display: 'flex', alignItems: 'center', minHeight: 34,
}

const nameInputStyle: React.CSSProperties = {
  boxSizing: 'border-box', width: '100%', padding: '7px 8px', borderRadius: 6,
  border: '1px solid transparent', background: 'transparent',
  color: 'inherit', fontSize: '0.88rem', fontWeight: 600, outline: 'none',
}

const openLinkStyle: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#185D7A', textDecoration: 'none', whiteSpace: 'nowrap',
}
