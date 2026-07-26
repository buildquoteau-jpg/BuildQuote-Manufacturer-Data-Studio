'use client'

// Manufacturer link library manager — reusable named {label, url} buttons
// (e.g. a decking calculator) that get attached to system cards via the
// custom-document editors on Verify systems / System Cards, without
// retyping the same URL on every system.

import { useState, useTransition } from 'react'
import {
  addLinkLibraryEntry,
  updateLinkLibraryEntry,
  deleteLinkLibraryEntry,
} from '@/lib/studio-manufacturer/link-library-actions'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

export function LinkLibraryManager({
  manufacturerId,
  initialLinks,
}: {
  manufacturerId: string
  initialLinks: LinkLibraryEntry[]
}) {
  const [links, setLinks] = useState(initialLinks)
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')

  function handleAdd() {
    if (!newLabel.trim() || !newUrl.trim()) return
    setErr(null)
    startTransition(async () => {
      const res = await addLinkLibraryEntry(manufacturerId, newLabel, newUrl)
      if (!res.ok) { setErr(res.error); return }
      setLinks(prev => [res.entry, ...prev])
      setNewLabel(''); setNewUrl(''); setAdding(false)
    })
  }

  function handleEdit(id: string, field: 'label' | 'url', value: string) {
    const trimmed = value.trim()
    const entry = links.find(l => l.id === id)
    if (!entry || !trimmed || entry[field] === trimmed) return
    const next = { ...entry, [field]: trimmed }
    setLinks(prev => prev.map(l => l.id === id ? next : l))
    startTransition(async () => {
      const res = await updateLinkLibraryEntry(manufacturerId, id, next.label, next.url)
      if (!res.ok) setErr(res.error)
    })
  }

  function handleDelete(id: string) {
    setLinks(prev => prev.filter(l => l.id !== id))
    startTransition(async () => {
      const res = await deleteLinkLibraryEntry(manufacturerId, id)
      if (!res.ok) setErr(res.error)
    })
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>Link Library</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1rem', maxWidth: 720 }}>
        Reusable named link buttons — a calculator, a warranty page, a sustainability report — that
        you can attach to any System Card from the "Additional documents" section on{' '}
        <a href="/manufacturer/review" style={{ color: 'var(--ds-teal)' }}>Verify systems</a> or{' '}
        <a href="/manufacturer/cms" style={{ color: 'var(--ds-teal)' }}>Asset picker</a>{' '}
        without retyping the URL each time.
      </p>

      {err && <div className="studio-warn" style={{ marginBottom: '0.75rem' }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 640 }}>
        {links.length === 0 && !adding && (
          <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint)', fontStyle: 'italic' }}>
            No saved links yet.
          </div>
        )}
        {links.map(l => (
          <div key={l.id} style={{
            display: 'flex', gap: '0.5rem', alignItems: 'center',
            border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.5rem 0.6rem',
          }}>
            <div style={{ flex: '0 0 34%', minWidth: 0 }}>
              <input
                defaultValue={l.label}
                onBlur={e => handleEdit(l.id, 'label', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                defaultValue={l.url}
                onBlur={e => handleEdit(l.id, 'url', e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem', color: '#185D7A', fontFamily: 'inherit' }}
              />
            </div>
            <button
              type="button"
              onClick={() => handleDelete(l.id)}
              disabled={pending}
              title="Delete"
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff',
                color: '#6b7280', cursor: pending ? 'not-allowed' : 'pointer', fontSize: '13px', flexShrink: 0,
              }}
            >✕</button>
          </div>
        ))}

        {adding ? (
          <div style={{ border: '1.5px solid #185D7A', background: '#eef6fa', borderRadius: 8, padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Button title, e.g. Decking calculator"
              autoFocus style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'inherit' }} />
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://…"
              style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" onClick={handleAdd} disabled={pending || !newLabel.trim() || !newUrl.trim()}
                style={{ padding: '5px 14px', borderRadius: 6, background: '#185D7A', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: pending || !newLabel.trim() || !newUrl.trim() ? 0.5 : 1 }}>
                Save
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewLabel(''); setNewUrl('') }}
                style={{ padding: '5px 12px', borderRadius: 6, background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '0.78rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            style={{
              alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 7,
              border: '1.5px dashed var(--ds-border)', background: 'transparent',
              color: 'var(--ds-text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            }}>
            + Add link
          </button>
        )}
      </div>
    </div>
  )
}
