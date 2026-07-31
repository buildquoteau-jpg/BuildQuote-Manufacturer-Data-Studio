'use client'

// Stockists — the closing screen. Apex PLUS genuinely has no stockists yet
// — shown honestly, not hidden or fabricated.
//
// The selection summary is a real materials-list table (# / profile & specs
// / SKU / UOM / QTY) matching BuildQuote's actual Materials List export —
// Melia pointed at that exact screenshot directly. Selecting a profile or
// component on an earlier screen already puts it on this list; there's no
// separate "add" step, since the tap itself is the add. Share lives in the
// shared bottom bar on this screen (see SystemCardV2Experience.tsx) rather
// than a second button here, so there's exactly one closing action.

import type { SystemCardSystem, SystemCardStockist } from '@/components/system-card-renderer/types'
import { useSelection } from './SelectionContext'
import styles from './RevealsBody.module.css'

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

type Row = { name: string; spec: string | null; sku: string | null; uom: string | null }

export function StockistsReveal({ system, stockists }: {
  system: SystemCardSystem
  stockists: SystemCardStockist[]
}) {
  const { colourName, profileNames, componentIds } = useSelection()

  const profileRows: Row[] = system.system_profiles
    .filter(p => profileNames.includes(p.profile_name ?? ''))
    .map(p => ({
      name: p.profile_name ?? p.name ?? 'Profile',
      // Prefer the complete length/width/thickness combo — p.dimensions is
      // a legacy short string that drops length (same bug Melia caught on
      // the Choose screen).
      spec: [p.length_mm && `${p.length_mm}mm`, p.width_mm && `${p.width_mm}mm`, p.thickness_mm && `${p.thickness_mm}mm`].filter(Boolean).join(' × ') || p.dimensions,
      sku: p.product_code,
      uom: p.uom,
    }))

  const componentRows: Row[] = system.system_components
    .filter(c => componentIds.includes(c.id))
    .map(c => ({
      name: c.components?.name ?? 'Component',
      spec: c.components?.description ?? null,
      sku: c.components?.sku ?? null,
      uom: c.components?.uom ?? null,
    }))

  const rows = [...profileRows, ...componentRows]

  return (
    <>
      <div className={styles.specGroup}>
        <p className={styles.specGroupLabel}>Your materials list</p>
        {colourName && <p className={styles.selectionColourNote}>Colour: {colourName}</p>}
        {rows.length === 0 ? (
          <p className={styles.emptyState}>Select a profile or component to add it here.</p>
        ) : (
          <div className={styles.specTableScroll}>
            <table className={styles.specTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Profile &amp; specs</th>
                  <th>SKU</th>
                  <th>UOM</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td className={styles.specTableNum}>{i + 1}</td>
                    <td className={styles.specTableName}>
                      {r.name}
                      {r.spec && <span className={styles.specTableSub}>{r.spec}</span>}
                    </td>
                    <td>{r.sku ?? '—'}</td>
                    <td>{r.uom ?? '—'}</td>
                    <td>1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stockists.length === 0 ? (
        <p className={styles.emptyState}><PinIcon /> No local stockists listed yet.</p>
      ) : (
        <div className={styles.resourceList}>
          {stockists.map(s => (
            <div key={s.id} className={styles.resourceRow}>
              {(s.suburb || s.state) && <span className={styles.resourceMeta}>{[s.suburb, s.state].filter(Boolean).join(', ')}</span>}
              <span className={styles.resourceLabel}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
