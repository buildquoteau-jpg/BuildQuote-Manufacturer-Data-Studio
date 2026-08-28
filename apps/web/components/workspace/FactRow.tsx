'use client'

// The atomic unit of the System Workspace (design doc §7.4/§9.3): one fact,
// its status stamp, its evidence, and (unless readOnly) the five actions a
// manufacturer can take on it. Same row for a BAL rating, a dimension, an
// installation step or a warranty term — one component, one code path.

import { useState, useTransition } from 'react'
import type { ClaimType, EpistemicStatus, TrustLevel } from '@/lib/knowledge/vocabulary'
import {
  verifyAssertion,
  correctAssertion,
  markAssertionNotApplicable,
  markAssertionUnknown,
  disputeAssertion,
} from '@/lib/studio-manufacturer/assertion-actions'

const STATUS_STYLES: Record<EpistemicStatus, { bg: string; border: string; text: string; label: string }> = {
  manufacturer_verified: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', label: 'Manufacturer verified' },
  manufacturer_corrected: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', label: 'Corrected + verified' },
  buildquote_checked: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'BuildQuote checked' },
  unverified: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', label: 'Extracted, unverified' },
  stale: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', label: 'Stale — needs re-check' },
  unknown: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', label: 'Unknown' },
  not_specified: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', label: 'Not specified' },
  not_applicable: { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280', label: 'Not applicable' },
  disputed: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', label: 'Disputed' },
  superseded: { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af', label: 'Superseded' },
}

function StatusStamp({ status }: { status: EpistemicStatus }) {
  const s = STATUS_STYLES[status]
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export type FactRowProps = {
  label: string
  predicate: string
  claimType: ClaimType
  value: string
  rawValue: unknown
  origin: string
  epistemicStatus: EpistemicStatus
  trustLevel?: TrustLevel
  sourceLine?: string | null
  quote?: string | null
  conditions?: string[]
  systemId: string
  manufacturerId: string
  readOnly?: boolean
  onChanged?: () => void
}

export function FactRow({
  label, predicate, claimType, value, rawValue, origin, epistemicStatus,
  sourceLine, quote, conditions, systemId, manufacturerId, readOnly, onChanged,
}: FactRowProps) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'fixing'>('idle')
  const [fixValue, setFixValue] = useState(value)
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) setError(res.error ?? 'Something went wrong.')
      else { setMode('idle'); onChanged?.() }
    })
  }

  return (
    <div style={{ padding: '0.8rem 0', borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-text, #0f172a)' }}>{label}</div>
        <StatusStamp status={epistemicStatus} />
      </div>
      <div style={{ fontSize: '0.88rem', color: 'var(--ds-text, #0f172a)', marginTop: '0.15rem' }}>{value || '—'}</div>
      {conditions && conditions.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', marginTop: '0.2rem' }}>
          {conditions.join(' ')}
        </div>
      )}
      {sourceLine && (
        <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint, #9ca3af)', marginTop: '0.25rem' }}>
          📄 {sourceLine}
        </div>
      )}
      {quote && (
        <div style={{
          fontSize: '0.78rem', color: 'var(--ds-text-muted, #4b5563)', marginTop: '0.3rem',
          padding: '0.5rem 0.7rem', background: '#f8fafc', borderLeft: '3px solid var(--ds-brand, #185D7A)', borderRadius: 2,
        }}>
          &ldquo;{quote}&rdquo;
        </div>
      )}

      {!readOnly && (
        <>
          {mode === 'idle' ? (
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <ActionButton label="✓ Correct" disabled={pending}
                onClick={() => run(() => verifyAssertion(systemId, manufacturerId, predicate, claimType, rawValue, origin))} />
              <ActionButton label="✎ Fix" disabled={pending} onClick={() => setMode('fixing')} />
              <ActionButton label="✗ Not applicable" disabled={pending}
                onClick={() => run(() => markAssertionNotApplicable(systemId, manufacturerId, predicate, claimType, rawValue, origin, null))} />
              <ActionButton label="? Don't know" disabled={pending}
                onClick={() => run(() => markAssertionUnknown(systemId, manufacturerId, predicate, claimType, rawValue, origin, null))} />
              <ActionButton label="⚑ Dispute" tone="danger" disabled={pending}
                onClick={() => run(() => disputeAssertion(systemId, manufacturerId, predicate, claimType, rawValue, origin, null))} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center' }}>
              <input
                value={fixValue}
                onChange={(e) => setFixValue(e.target.value)}
                style={{ flex: 1, minWidth: 120, padding: '0.4rem 0.6rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 6, fontSize: '0.85rem' }}
              />
              <ActionButton label="Save" tone="primary" disabled={pending}
                onClick={() => run(() => correctAssertion(systemId, manufacturerId, predicate, claimType, rawValue, fixValue, origin))} />
              <ActionButton label="Cancel" disabled={pending} onClick={() => { setMode('idle'); setFixValue(value) }} />
            </div>
          )}
          {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.35rem' }}>{error}</div>}
        </>
      )}
    </div>
  )
}

function ActionButton({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled?: boolean; tone?: 'primary' | 'danger' }) {
  const palette = tone === 'primary'
    ? { bg: '#185D7A', border: '#185D7A', text: '#fff' }
    : tone === 'danger'
      ? { bg: '#fff', border: '#fecaca', text: '#b91c1c' }
      : { bg: '#fff', border: '#d1d5db', text: '#374151' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.3rem 0.6rem', borderRadius: 6, border: `1.5px solid ${palette.border}`,
        background: palette.bg, color: palette.text, fontSize: '0.78rem', fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
