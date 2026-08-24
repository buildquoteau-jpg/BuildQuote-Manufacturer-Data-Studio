'use client'

// The flagship "one attribute model" section (design doc §6.1): typed
// ratings and freeform custom attributes render as identical rows — a BAL
// rating and a warranty period are the same kind of thing now. Replaces
// VerificationGrid's "Technical attributes" block AND the separate custom-
// attributes editor with one list.

import { useState, useTransition } from 'react'
import { FactRow } from './FactRow'
import type { FactViewModel } from './factViewModel'
import { setCustomAttributes } from '@/lib/studio-manufacturer/verification-actions'

export function AttributesSection({
  systemId,
  manufacturerId,
  attributeFacts,
  customAttributes,
  onCustomAttributesChanged,
}: {
  systemId: string
  manufacturerId: string
  attributeFacts: FactViewModel[]
  customAttributes: { label: string; value: string }[]
  onCustomAttributesChanged: (next: { label: string; value: string }[]) => void
}) {
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function persist(next: { label: string; value: string }[]) {
    setError(null)
    startTransition(async () => {
      const res = await setCustomAttributes(systemId, manufacturerId, next)
      if (!res.ok) setError(res.error)
      else onCustomAttributesChanged(next)
    })
  }

  function addCustom() {
    if (!newLabel.trim() || !newValue.trim()) return
    persist([...customAttributes, { label: newLabel.trim(), value: newValue.trim() }])
    setNewLabel('')
    setNewValue('')
    setAdding(false)
  }

  function removeCustom(i: number) {
    persist(customAttributes.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {attributeFacts.map((f) => (
        <FactRow
          key={f.predicate}
          label={f.label}
          predicate={f.predicate}
          claimType={f.claimType}
          value={f.value}
          rawValue={f.rawValue}
          origin={f.origin}
          epistemicStatus={f.epistemicStatus}
          sourceLine={f.sourceLine}
          systemId={systemId}
          manufacturerId={manufacturerId}
        />
      ))}

      {/* Custom attributes — freeform facts with no dedicated column. Same
          row idiom, no dedicated status model yet (they're manufacturer-
          authored directly, so they start as manufacturer_supplied /
          unverified until the backfill assigns a proper claimType — see
          buildSystemKnowledge.ts's note on this). */}
      {customAttributes.map((attr, i) => (
        <div key={i} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--ds-border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-text, #0f172a)' }}>{attr.label}</div>
            <div style={{ fontSize: '0.88rem', color: 'var(--ds-text, #0f172a)' }}>{attr.value}</div>
          </div>
          <button type="button" onClick={() => removeCustom(i)} disabled={pending}
            style={{ fontSize: '0.75rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Remove
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: '0.4rem', padding: '0.7rem 0', alignItems: 'center' }}>
          <input placeholder="Label (e.g. Warranty)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
            style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }} />
          <input placeholder="Value (e.g. 25 years)" value={newValue} onChange={(e) => setNewValue(e.target.value)}
            style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }} />
          <button type="button" onClick={addCustom} disabled={pending}
            style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            Add
          </button>
          <button type="button" onClick={() => setAdding(false)}
            style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          style={{ marginTop: '0.6rem', fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          + Add attribute
        </button>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
