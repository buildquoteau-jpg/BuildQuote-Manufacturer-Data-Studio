'use client'

// Relationships panel — design doc §7.3/§10.3. Works with / Do not use with /
// Replaces / Replaced by, targeting either another of the manufacturer's own
// products, a named external product, or a generic class ("any membrane to
// AS/NZS 4200.1") — the pattern that lets compatibility be stated without
// naming a competitor's specific product.

import { useEffect, useState, useTransition } from 'react'
import {
  getSystemRelationships,
  addSystemRelationship,
  removeSystemRelationship,
  type SystemRelationship,
  type RelationTarget,
} from '@/lib/studio-manufacturer/relationship-actions'

const RELATION_LABELS: Record<SystemRelationship['relation'], string> = {
  compatible_with: 'Works with',
  incompatible_with: 'Do not use with',
  supersedes: 'Replaces',
  superseded_by: 'Replaced by',
  substitute_for: 'Substitute for',
  requires_system: 'Requires',
}

function targetLabel(r: SystemRelationship, ownSystems: { id: string; name: string }[]): string {
  if (r.targetStagedSystemId) return ownSystems.find((s) => s.id === r.targetStagedSystemId)?.name ?? '(own product)'
  if (r.targetExternal) return r.targetExternal.name + (r.targetExternal.kind === 'generic_class' ? ' (generic class)' : '')
  return '—'
}

export function RelationshipsSection({
  systemId, manufacturerId, ownSystems,
}: {
  systemId: string
  manufacturerId: string
  ownSystems: { id: string; name: string }[]
}) {
  const [relationships, setRelationships] = useState<SystemRelationship[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [relation, setRelation] = useState<SystemRelationship['relation']>('compatible_with')
  const [targetKind, setTargetKind] = useState<'internal' | 'external' | 'generic_class'>('internal')
  const [targetSystemId, setTargetSystemId] = useState('')
  const [targetName, setTargetName] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    getSystemRelationships(systemId, manufacturerId).then((res) => setRelationships(res.ok ? res.relationships : []))
  }, [systemId, manufacturerId])

  function remove(id: string) {
    setRelationships((prev) => (prev ?? []).filter((r) => r.id !== id))
    startTransition(async () => {
      const res = await removeSystemRelationship(id, manufacturerId)
      if (!res.ok) setError(res.error)
    })
  }

  function add() {
    let target: RelationTarget
    if (targetKind === 'internal') {
      if (!targetSystemId) return
      target = { kind: 'internal', stagedSystemId: targetSystemId }
    } else {
      if (!targetName.trim()) return
      target = { kind: targetKind, name: targetName.trim() }
    }
    startTransition(async () => {
      const res = await addSystemRelationship(systemId, manufacturerId, relation, target, null, reason.trim() || null)
      if (!res.ok) { setError(res.error); return }
      setRelationships((prev) => [...(prev ?? []), {
        id: res.id, relation,
        targetStagedSystemId: target.kind === 'internal' ? target.stagedSystemId : null,
        targetExternal: target.kind !== 'internal' ? { name: target.name, kind: target.kind } : null,
        note: null, reason: reason.trim() || null,
      }])
      setTargetSystemId(''); setTargetName(''); setReason(''); setAdding(false)
    })
  }

  if (relationships === null) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint, #9ca3af)', padding: '0.6rem 0' }}>Loading…</div>
  }

  return (
    <div>
      {relationships.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', padding: '0.6rem 0', borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
          <div>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#185D7A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{RELATION_LABELS[r.relation]}</span>
            <div style={{ fontSize: '0.85rem', color: 'var(--ds-text, #0f172a)', marginTop: '0.15rem' }}>{targetLabel(r, ownSystems)}</div>
            {r.reason && <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', marginTop: '0.1rem' }}>{r.reason}</div>}
          </div>
          <button type="button" onClick={() => remove(r.id)} disabled={pending}
            style={{ fontSize: '0.74rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Remove
          </button>
        </div>
      ))}
      {relationships.length === 0 && !adding && (
        <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>No relationships recorded.</div>
      )}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.6rem', padding: '0.7rem', border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 8 }}>
          <select value={relation} onChange={(e) => setRelation(e.target.value as SystemRelationship['relation'])}
            style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem' }}>
            {Object.entries(RELATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.8rem' }}>
            <label><input type="radio" checked={targetKind === 'internal'} onChange={() => setTargetKind('internal')} /> Own product</label>
            <label><input type="radio" checked={targetKind === 'external'} onChange={() => setTargetKind('external')} /> External product</label>
            <label><input type="radio" checked={targetKind === 'generic_class'} onChange={() => setTargetKind('generic_class')} /> Generic class</label>
          </div>

          {targetKind === 'internal' ? (
            <select value={targetSystemId} onChange={(e) => setTargetSystemId(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem' }}>
              <option value="">Choose a product…</option>
              {ownSystems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <input
              placeholder={targetKind === 'generic_class' ? 'e.g. Any membrane to AS/NZS 4200.1' : 'Product name'}
              value={targetName} onChange={(e) => setTargetName(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem' }}
            />
          )}

          <textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            style={{ padding: '0.35rem 0.5rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.84rem', resize: 'vertical' }} />

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" onClick={add} disabled={pending} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => setAdding(false)} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ marginTop: '0.6rem', fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          + Add relationship
        </button>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
