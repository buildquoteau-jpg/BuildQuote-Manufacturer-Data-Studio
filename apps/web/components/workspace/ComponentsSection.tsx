'use client'

// Components & accessories — design doc §7.3, replaces VerificationGrid's
// Components block. Role-based grouping (required/optional/accessory) isn't
// available from getManufacturerVerificationData yet (staged_system_
// components.role isn't selected there) — flat list for now, a small,
// separate follow-up once that query is extended.

import { useState, useTransition } from 'react'
import {
  addMissingComponent,
  updateComponent,
  unlinkComponent,
  linkExistingComponent,
  getManufacturerComponents,
} from '@/lib/studio-manufacturer/verification-actions'
import type { VerificationSystemComponent } from '@/lib/studio-manufacturer/workspace'

export function ComponentsSection({
  systemId, manufacturerId, initialComponents,
}: {
  systemId: string
  manufacturerId: string
  initialComponents: VerificationSystemComponent[]
}) {
  const [components, setComponents] = useState(initialComponents)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', sku: '' })
  const [linking, setLinking] = useState(false)
  const [existing, setExisting] = useState<{ id: string; name: string; sku: string | null; description: string | null }[] | null>(null)

  function rename(id: string, field: 'name' | 'sku', value: string) {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
    startTransition(async () => {
      const res = await updateComponent(id, manufacturerId, { [field]: value || null })
      if (!res.ok) setError(res.error)
    })
  }

  function remove(id: string) {
    setComponents((prev) => prev.filter((c) => c.id !== id))
    startTransition(async () => {
      const res = await unlinkComponent(id, systemId, manufacturerId)
      if (!res.ok) setError(res.error)
    })
  }

  function addRow() {
    if (!draft.name.trim()) return
    startTransition(async () => {
      const res = await addMissingComponent(systemId, manufacturerId, { name: draft.name.trim(), sku: draft.sku.trim() || undefined })
      if (!res.ok) { setError(res.error); return }
      setComponents((prev) => [...prev, {
        id: res.id, name: draft.name.trim(), sku: draft.sku || null, description: null,
        category: null, uom: null, supplier_pack_qty: null, supplier_pack_uom: null,
        sort_order: components.length, procurement_route: null,
      }])
      setDraft({ name: '', sku: '' })
      setAdding(false)
    })
  }

  async function openLinkExisting() {
    setLinking(true)
    if (!existing) {
      const res = await getManufacturerComponents(manufacturerId)
      setExisting(res.ok ? res.components : [])
    }
  }

  function pickExisting(componentId: string) {
    const found = existing?.find((c) => c.id === componentId)
    startTransition(async () => {
      const res = await linkExistingComponent(systemId, componentId, manufacturerId)
      if (!res.ok) { setError(res.error); return }
      if (found) setComponents((prev) => [...prev, { ...found, category: null, uom: null, supplier_pack_qty: null, supplier_pack_uom: null, sort_order: components.length, procurement_route: null }])
      setLinking(false)
    })
  }

  return (
    <div>
      {components.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
          <input defaultValue={c.name} onBlur={(e) => rename(c.id, 'name', e.target.value)}
            style={{ flex: 2, padding: '0.32rem 0.5rem', border: '1px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem' }} />
          <input defaultValue={c.sku ?? ''} placeholder="SKU" onBlur={(e) => rename(c.id, 'sku', e.target.value)}
            style={{ flex: 1, padding: '0.32rem 0.5rem', border: '1px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem' }} />
          <button type="button" onClick={() => remove(c.id)} disabled={pending}
            style={{ fontSize: '0.74rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Remove
          </button>
        </div>
      ))}
      {components.length === 0 && !adding && (
        <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>No components yet.</div>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
          <input placeholder="Name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            style={{ flex: 2, padding: '0.35rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }} />
          <input placeholder="SKU" value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
            style={{ flex: 1, padding: '0.35rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }} />
          <button type="button" onClick={addRow} disabled={pending} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {linking && (
        <div style={{ marginTop: '0.6rem' }}>
          {existing === null ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint, #9ca3af)' }}>Loading…</div>
          ) : existing.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint, #9ca3af)' }}>No other components in this workspace yet.</div>
          ) : (
            <select onChange={(e) => e.target.value && pickExisting(e.target.value)} defaultValue=""
              style={{ padding: '0.35rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }}>
              <option value="" disabled>Choose a component…</option>
              {existing.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ''}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setLinking(false)} style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {!adding && !linking && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem' }}>
          <button type="button" onClick={() => setAdding(true)} style={{ fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            + Add new component
          </button>
          <button type="button" onClick={openLinkExisting} style={{ fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            + Reuse existing
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
