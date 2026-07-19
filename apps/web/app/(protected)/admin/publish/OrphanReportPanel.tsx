'use client'

import { useState, useTransition } from 'react'
import { getOrphanReport, type PublishedManufacturer } from '@/lib/studio-admin/publish-actions'
import type { OrphanReport, OrphanRow } from '@/lib/studio-admin/publish'

const SECTIONS: { key: 'systems' | 'systemProfiles' | 'systemColours' | 'components'; label: string }[] = [
  { key: 'systems', label: 'Systems' },
  { key: 'systemProfiles', label: 'Profiles' },
  { key: 'systemColours', label: 'Colours' },
  { key: 'components', label: 'Components' },
]

function OrphanList({ label, rows }: { label: string; rows: OrphanRow[] }) {
  if (rows.length === 0) return null
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
        {label} ({rows.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map((r) => (
          <div key={r.id} style={{
            display: 'flex', justifyContent: 'space-between', gap: '10px',
            padding: '5px 10px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca',
          }}>
            <span style={{ fontSize: '12px', color: '#0f172a' }}>{r.label}</span>
            <span style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'monospace' }}>{r.id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OrphanReportPanel({ manufacturers }: { manufacturers: PublishedManufacturer[] }) {
  const [manufacturerId, setManufacturerId] = useState(manufacturers[0]?.id ?? '')
  const [report, setReport] = useState<OrphanReport | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCheck() {
    if (!manufacturerId) return
    startTransition(async () => {
      const res = await getOrphanReport(manufacturerId)
      setReport(res)
    })
  }

  if (manufacturers.length === 0) return null

  return (
    <div style={{
      background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 10,
      padding: '16px', marginTop: '1.5rem',
    }}>
      <h2 style={{ fontSize: '0.95rem', marginBottom: '0.3rem' }}>Orphaned production rows</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', marginBottom: '0.85rem', maxWidth: '640px' }}>
        Publishing never deletes production rows — if a system, profile, colour, or component is deleted
        or renamed in Data Studio after it was published, the production row it created stays behind with
        no staging counterpart. This is a read-only check for that; nothing is ever deleted here.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={manufacturerId}
          onChange={(e) => { setManufacturerId(e.target.value); setReport(null) }}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', minWidth: '220px' }}
        >
          {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button type="button" onClick={handleCheck} disabled={pending || !manufacturerId}
          style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #185D7A', background: '#fff', color: '#185D7A', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Checking…' : 'Check for orphans'}
        </button>
      </div>

      {report && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
          {!report.ok ? (
            <div style={{ fontSize: '12px', color: '#dc2626' }}>{report.error}</div>
          ) : report.productionManufacturerId === null ? (
            <div style={{ fontSize: '12px', color: 'var(--ds-text-muted)' }}>
              {report.manufacturerName} has never been published — nothing to check.
            </div>
          ) : report.totalOrphans === 0 ? (
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
              No orphaned rows for {report.manufacturerName}.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', marginBottom: '10px' }}>
                {report.totalOrphans} orphaned row{report.totalOrphans !== 1 ? 's' : ''} for {report.manufacturerName}
              </div>
              {SECTIONS.map((s) => <OrphanList key={s.key} label={s.label} rows={report[s.key]} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
