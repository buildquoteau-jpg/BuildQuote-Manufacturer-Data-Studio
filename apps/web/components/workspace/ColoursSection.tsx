'use client'

// Colours & finishes — design doc §7.3, replaces VerificationGrid's Colours
// block AND the separate trip to /manufacturer/assets to find a swatch: the
// AssetSlotControl (upload/import/pick) lives right on each colour row.

import { useState, useTransition } from 'react'
import {
  addMissingColour,
  updateColour,
  updateColourSwatchAsset,
  removeColour,
} from '@/lib/studio-manufacturer/verification-actions'
import { AssetSlotControl, type SlotAsset, type SlotPick } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'
import type { VerificationSystemColour } from '@/lib/studio-manufacturer/workspace'

export function ColoursSection({
  systemId, manufacturerId, initialColours, pickerAssets, onChanged,
}: {
  systemId: string
  manufacturerId: string
  initialColours: VerificationSystemColour[]
  pickerAssets: SlotAsset[]
  onChanged?: (count: number) => void
}) {
  const [colours, setColours] = useState(initialColours)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  function rename(id: string, value: string) {
    setColours((prev) => prev.map((c) => (c.id === id ? { ...c, colour_name: value } : c)))
    startTransition(async () => {
      const res = await updateColour(id, systemId, manufacturerId, { colour_name: value })
      if (!res.ok) setError(res.error)
    })
  }

  function pickSwatch(colourId: string, pick: SlotPick) {
    setColours((prev) => prev.map((c) => (c.id === colourId ? { ...c, image_asset_id: pick.assetId, image_url: pick.publicUrl } : c)))
    startTransition(async () => {
      const res = await updateColourSwatchAsset(colourId, systemId, manufacturerId, pick.assetId, pick.publicUrl)
      if (!res.ok) setError(res.error)
    })
  }

  function clearSwatch(colourId: string) {
    setColours((prev) => prev.map((c) => (c.id === colourId ? { ...c, image_asset_id: null } : c)))
    startTransition(async () => {
      const res = await updateColourSwatchAsset(colourId, systemId, manufacturerId, null, null)
      if (!res.ok) setError(res.error)
    })
  }

  function remove(id: string) {
    setColours((prev) => {
      const next = prev.filter((c) => c.id !== id)
      onChanged?.(next.length)
      return next
    })
    startTransition(async () => {
      const res = await removeColour(id, systemId, manufacturerId)
      if (!res.ok) setError(res.error)
    })
  }

  function addRow() {
    if (!newName.trim()) return
    startTransition(async () => {
      const res = await addMissingColour(systemId, manufacturerId, { colour_name: newName.trim() })
      if (!res.ok) { setError(res.error); return }
      setColours((prev) => {
        const next = [...prev, { id: res.id, colour_name: newName.trim(), sku_suffix: null, image_url: null, image_asset_id: null, is_stocked: true }]
        onChanged?.(next.length)
        return next
      })
      setNewName('')
      setAdding(false)
    })
  }

  return (
    <div>
      {colours.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start', padding: '0.7rem 0', borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
          <div style={{ width: 96, flexShrink: 0 }}>
            <AssetSlotControl
              manufacturerId={manufacturerId}
              uploadAssetType="thumbnail"
              pickerAssetTypes={['thumbnail', 'product']}
              assets={pickerAssets}
              currentAssetId={c.image_asset_id}
              onPick={(pick) => pickSwatch(c.id, pick)}
              onClear={() => clearSwatch(c.id)}
              quickImportUrl={c.image_url}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              defaultValue={c.colour_name}
              onBlur={(e) => rename(c.id, e.target.value)}
              style={{ width: '100%', padding: '0.35rem 0.5rem', border: '1px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600 }}
            />
            <button type="button" onClick={() => remove(c.id)} disabled={pending}
              style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {colours.length === 0 && !adding && (
        <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>No colours yet.</div>
      )}

      {adding ? (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
          <input placeholder="Colour name" value={newName} onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1, padding: '0.35rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }} />
          <button type="button" onClick={addRow} disabled={pending} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ marginTop: '0.6rem', fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          + Add colour
        </button>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
