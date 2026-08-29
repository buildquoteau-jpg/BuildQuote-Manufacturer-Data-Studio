'use client'

// Stockists — the closing screen. The materials-list preview and "Add to
// shopping list" action that used to live in this tab moved to
// MaterialsListBar, rendered always-visible outside the accordion (see
// useMaterialsListRows.ts for the shared row-building logic both use).
// This tab now holds only the local stockist list.

import type { SystemCardStockist } from '@/components/system-card-renderer/types'
import styles from './RevealsBody.module.css'

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

export function StockistsReveal({ stockists }: {
  stockists: SystemCardStockist[]
}) {
  if (stockists.length === 0) {
    return <p className={styles.emptyState}><PinIcon /> No local stockists listed yet.</p>
  }

  return (
    <div className={styles.resourceList}>
      {stockists.map(s => (
        <div key={s.id} className={styles.resourceRow}>
          {(s.suburb || s.state) && <span className={styles.resourceMeta}>{[s.suburb, s.state].filter(Boolean).join(', ')}</span>}
          <span className={styles.resourceLabel}>{s.name}</span>
        </div>
      ))}
    </div>
  )
}
