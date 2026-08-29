'use client'

// Unknowns list (design doc §9.2 point 4, "unknowns become document
// requests") — a compact rollup of every fact currently marked unknown /
// not specified / not applicable across this system's sections, so a
// manufacturer can see everything outstanding without opening each
// accordion section individually. Each row still resolves the same way as
// any other fact — via that fact's own FactRow further down the page (✎ Fix
// / ✗ Not applicable / ? Don't know) — this is a jump-to-what's-missing
// index, not a second write path.

import { useState } from 'react'
import type { FactViewModel } from './factViewModel'

const RELEVANT_STATUSES = new Set(['unknown', 'not_specified', 'not_applicable'])

export function UnknownsSummary({ facts }: { facts: FactViewModel[] }) {
  const [open, setOpen] = useState(false)
  const unknowns = facts.filter((f) => RELEVANT_STATUSES.has(f.epistemicStatus))
  if (unknowns.length === 0) return null

  return (
    <div style={{
      border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10,
      padding: '0.8rem 1rem', marginBottom: '1rem',
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
        }}
      >
        <span style={{ fontSize: '0.7rem', color: '#92400e' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#92400e', flex: 1 }}>
          {unknowns.length} fact{unknowns.length === 1 ? '' : 's'} not known yet
        </span>
      </button>
      {open && (
        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {unknowns.map((f) => (
            <div key={`${f.predicate}-${f.sourceDocumentId ?? 'na'}`} style={{ fontSize: '0.8rem', color: '#78350f' }}>
              <strong>{f.label}</strong> — {f.epistemicStatus === 'not_applicable' ? 'marked not applicable' : 'not known'}.
              {f.epistemicStatus === 'unknown' && (
                <> Upload a document that covers this, or confirm it should stay unknown, in the row above.</>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
