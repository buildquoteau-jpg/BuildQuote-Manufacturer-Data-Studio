'use client'

import { useState, useTransition } from 'react'
import {
  updateSystemVerification,
  type VerificationStatus,
} from '@/lib/studio-admin/system-verification-actions'

// ── Stage config ──────────────────────────────────────────────

const STAGES: { status: VerificationStatus; label: string; color: string; bg: string; activeBg: string }[] = [
  {
    status: 'pending_review',
    label: 'Data extracted',
    color: '#6b7280',
    bg: '#f3f4f6',
    activeBg: '#6b7280',
  },
  {
    status: 'in_review',
    label: 'In review',
    color: '#d97706',
    bg: '#fffbeb',
    activeBg: '#d97706',
  },
  {
    status: 'manufacturer_verified',
    label: 'Manufacturer verified',
    color: '#16a34a',
    bg: '#f0fdf4',
    activeBg: '#16a34a',
  },
]

// ── Props ─────────────────────────────────────────────────────

interface Props {
  systemId: string
  initialStatus: VerificationStatus
  initialNotes: string | null
}

// ── Component ─────────────────────────────────────────────────

export function AdminVerificationBar({ systemId, initialStatus, initialNotes }: Props) {
  const [status, setStatus] = useState<VerificationStatus>(initialStatus)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? '')
  const [isPending, startTransition] = useTransition()
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notesUnsaved = notes !== savedNotes

  function handleStatusClick(next: VerificationStatus) {
    if (next === status || isPending) return
    setError(null)
    setSaveMsg(null)
    const prevStatus = status
    setStatus(next)
    startTransition(async () => {
      const result = await updateSystemVerification(systemId, next, notes.trim() || null)
      if (!result.ok) {
        setStatus(prevStatus)
        setError(result.error)
      } else {
        setSavedNotes(notes)
      }
    })
  }

  function handleSaveNotes() {
    if (!notesUnsaved || isPending) return
    setError(null)
    setSaveMsg(null)
    startTransition(async () => {
      const result = await updateSystemVerification(systemId, status, notes.trim() || null)
      if (!result.ok) {
        setError(result.error)
      } else {
        setSavedNotes(notes)
        setSaveMsg('Saved')
        setTimeout(() => setSaveMsg(null), 2500)
      }
    })
  }

  const activeStage = STAGES.find(s => s.status === status) ?? STAGES[0]

  return (
    <div style={{
      borderTop: `2px solid ${activeStage.color}33`,
      padding: '1rem 1.25rem 1.1rem',
      background: 'var(--ds-page-bg)',
      borderRadius: '0 0 10px 10px',
    }}>
      {/* Label row */}
      <div style={{
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ds-text-faint)',
        marginBottom: '0.6rem',
      }}>
        Verification status
      </div>

      {/* Stage toggle */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {STAGES.map((stage, i) => {
          const isActive = stage.status === status
          const isPast = STAGES.findIndex(s => s.status === status) > i
          return (
            <button
              key={stage.status}
              onClick={() => handleStatusClick(stage.status)}
              disabled={isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.75rem',
                borderRadius: 99,
                border: `1.5px solid ${isActive || isPast ? stage.color : 'var(--ds-border)'}`,
                background: isActive ? stage.activeBg : isPast ? `${stage.color}18` : 'transparent',
                color: isActive ? '#fff' : isPast ? stage.color : 'var(--ds-text-muted)',
                fontSize: '0.78rem',
                fontWeight: isActive ? 700 : 500,
                cursor: isPending ? 'not-allowed' : 'pointer',
                opacity: isPending ? 0.7 : 1,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isActive ? '#fff' : isPast ? stage.color : 'var(--ds-border)',
                flexShrink: 0,
              }} />
              {stage.label}
            </button>
          )
        })}
      </div>

      {/* Reviewer notes */}
      <div style={{ marginTop: '0.9rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: 'var(--ds-text-sub)',
          marginBottom: '0.35rem',
        }}>
          Review notes
          {status !== 'in_review' && notes === '' && (
            <span style={{ fontWeight: 400, color: 'var(--ds-text-faint)', marginLeft: '0.4rem' }}>
              · set status to In review to add notes
            </span>
          )}
        </label>
        <textarea
          value={notes}
          onChange={e => { setNotes(e.target.value); setSaveMsg(null) }}
          placeholder="Log missing profiles, incorrect component details, or any changes needed…"
          rows={status === 'in_review' ? 4 : 2}
          style={{
            width: '100%',
            padding: '0.5rem 0.65rem',
            border: `1px solid ${notesUnsaved ? 'var(--ds-navy)' : 'var(--ds-border)'}`,
            borderRadius: 6,
            fontSize: '0.82rem',
            color: 'var(--ds-text)',
            background: 'var(--ds-page-bg)',
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
          <button
            onClick={handleSaveNotes}
            disabled={!notesUnsaved || isPending}
            style={{
              padding: '0.3rem 0.85rem',
              borderRadius: 6,
              border: '1.5px solid var(--ds-navy)',
              background: notesUnsaved && !isPending ? 'var(--ds-navy)' : 'transparent',
              color: notesUnsaved && !isPending ? '#fff' : 'var(--ds-text-faint)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: notesUnsaved && !isPending ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            {isPending ? 'Saving…' : 'Save notes'}
          </button>
          {saveMsg && (
            <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
              ✓ {saveMsg}
            </span>
          )}
          {error && (
            <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>
              ✗ {error}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
