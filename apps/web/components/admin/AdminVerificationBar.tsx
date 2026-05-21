'use client'

import { useState, useTransition } from 'react'
import {
  updateSystemVerification,
  updateSystemAttributes,
  type VerificationStatus,
  type SystemAttributes,
} from '@/lib/studio-admin/system-verification-actions'

// ── BAL rating options (AS 3959) ──────────────────────────────

const BAL_OPTIONS = [
  { value: '',               label: '— None —' },
  { value: 'BAL 12.5',      label: 'BAL 12.5' },
  { value: 'BAL 19',        label: 'BAL 19' },
  { value: 'BAL 29',        label: 'BAL 29' },
  { value: 'BAL 40',        label: 'BAL 40' },
  { value: 'BAL-FZ',        label: 'BAL-FZ' },
  { value: 'All BAL levels', label: 'All BAL levels' },
]

// ── Stage config ──────────────────────────────────────────────

const STAGES: { status: VerificationStatus; label: string; color: string; activeBg: string }[] = [
  { status: 'pending_review',       label: 'Data extracted',       color: '#6b7280', activeBg: '#6b7280' },
  { status: 'in_review',            label: 'In review',            color: '#d97706', activeBg: '#d97706' },
  { status: 'manufacturer_verified', label: 'Manufacturer verified', color: '#16a34a', activeBg: '#16a34a' },
]

// ── Props ─────────────────────────────────────────────────────

interface Props {
  systemId: string
  initialStatus: VerificationStatus
  initialNotes: string | null
  initialBalRating: string | null
  initialFireRating: string | null
  initialAcousticRating: string | null
  initialMoistureResistant: boolean
  initialStructuralGrade: string | null
  initialAustralianMade: boolean
}

// ── Shared input style ────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.35rem 0.5rem',
  border: '1px solid var(--ds-border)',
  borderRadius: 6,
  fontSize: '0.82rem',
  color: 'var(--ds-text)',
  background: 'var(--ds-card-bg)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

// ── Component ─────────────────────────────────────────────────

export function AdminVerificationBar({
  systemId,
  initialStatus,
  initialNotes,
  initialBalRating,
  initialFireRating,
  initialAcousticRating,
  initialMoistureResistant,
  initialStructuralGrade,
  initialAustralianMade,
}: Props) {
  // Verification state
  const [status, setStatus]       = useState<VerificationStatus>(initialStatus)
  const [notes, setNotes]         = useState(initialNotes ?? '')
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? '')
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [verifyErr, setVerifyErr] = useState<string | null>(null)

  // Attribute state
  const [balRating,         setBalRating]         = useState(initialBalRating ?? '')
  const [fireRating,        setFireRating]        = useState(initialFireRating ?? '')
  const [acousticRating,    setAcousticRating]    = useState(initialAcousticRating ?? '')
  const [moistureResistant, setMoistureResistant] = useState(initialMoistureResistant)
  const [structuralGrade,   setStructuralGrade]   = useState(initialStructuralGrade ?? '')
  const [australianMade,    setAustralianMade]    = useState(initialAustralianMade)
  const [attrPending, startAttrTransition] = useTransition()
  const [attrMsg, setAttrMsg] = useState<string | null>(null)
  const [attrErr, setAttrErr] = useState<string | null>(null)

  const notesUnsaved = notes !== savedNotes
  const activeStage  = STAGES.find(s => s.status === status) ?? STAGES[0]

  // ── Verification handlers ────────────────────────────────────

  function handleStatusClick(next: VerificationStatus) {
    if (next === status || verifyPending) return
    setVerifyErr(null); setVerifyMsg(null)
    const prev = status; setStatus(next)
    startVerifyTransition(async () => {
      const result = await updateSystemVerification(systemId, next, notes.trim() || null)
      if (!result.ok) { setStatus(prev); setVerifyErr(result.error) }
      else setSavedNotes(notes)
    })
  }

  function handleSaveNotes() {
    if (!notesUnsaved || verifyPending) return
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      const result = await updateSystemVerification(systemId, status, notes.trim() || null)
      if (!result.ok) { setVerifyErr(result.error) }
      else { setSavedNotes(notes); setVerifyMsg('Saved'); setTimeout(() => setVerifyMsg(null), 2500) }
    })
  }

  // ── Attribute save handler ───────────────────────────────────

  function handleSaveAttributes() {
    if (attrPending) return
    setAttrErr(null); setAttrMsg(null)
    const attrs: SystemAttributes = {
      bal_rating:         balRating || null,
      fire_rating:        fireRating || null,
      acoustic_rating:    acousticRating || null,
      moisture_resistant: moistureResistant,
      structural_grade:   structuralGrade || null,
      australian_made:    australianMade,
    }
    startAttrTransition(async () => {
      const result = await updateSystemAttributes(systemId, attrs)
      if (!result.ok) { setAttrErr(result.error) }
      else { setAttrMsg('Saved'); setTimeout(() => setAttrMsg(null), 2500) }
    })
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={{
      borderTop: `2px solid ${activeStage.color}33`,
      background: 'var(--ds-page-bg)',
      borderRadius: '0 0 10px 10px',
    }}>

      {/* ── System attributes ── */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--ds-border-soft)' }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ds-text-faint)', marginBottom: '0.75rem',
        }}>
          System attributes
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 1rem' }}>

          {/* BAL rating */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-sub)', marginBottom: '0.25rem' }}>
              BAL rating
            </label>
            <select
              value={balRating}
              onChange={e => setBalRating(e.target.value)}
              style={{ ...inputStyle }}
            >
              {BAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Structural grade */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-sub)', marginBottom: '0.25rem' }}>
              Structural grade
            </label>
            <input
              type="text"
              value={structuralGrade}
              onChange={e => setStructuralGrade(e.target.value)}
              placeholder="e.g. F17, MGP10"
              style={inputStyle}
            />
          </div>

          {/* Fire rating */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-sub)', marginBottom: '0.25rem' }}>
              Fire rating (FRL)
            </label>
            <input
              type="text"
              value={fireRating}
              onChange={e => setFireRating(e.target.value)}
              placeholder="e.g. 90/90/90"
              style={inputStyle}
            />
          </div>

          {/* Acoustic rating */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-sub)', marginBottom: '0.25rem' }}>
              Acoustic rating
            </label>
            <input
              type="text"
              value={acousticRating}
              onChange={e => setAcousticRating(e.target.value)}
              placeholder="e.g. Rw 35"
              style={inputStyle}
            />
          </div>

        </div>

        {/* Checkboxes row */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, color: 'var(--ds-text-sub)' }}>
            <input
              type="checkbox"
              checked={moistureResistant}
              onChange={e => setMoistureResistant(e.target.checked)}
              style={{ accentColor: '#185D7A', width: 15, height: 15 }}
            />
            Moisture resistant
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, color: 'var(--ds-text-sub)' }}>
            <input
              type="checkbox"
              checked={australianMade}
              onChange={e => setAustralianMade(e.target.checked)}
              style={{ accentColor: '#185D7A', width: 15, height: 15 }}
            />
            Australian made
          </label>
        </div>

        {/* Save attributes row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button
            onClick={handleSaveAttributes}
            disabled={attrPending}
            style={{
              padding: '0.3rem 0.85rem',
              borderRadius: 6,
              border: '1.5px solid var(--ds-navy)',
              background: attrPending ? 'transparent' : 'var(--ds-navy)',
              color: attrPending ? 'var(--ds-text-faint)' : '#fff',
              fontSize: '0.78rem', fontWeight: 600,
              cursor: attrPending ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {attrPending ? 'Saving…' : 'Save attributes'}
          </button>
          {attrMsg && <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>✓ {attrMsg}</span>}
          {attrErr && <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>✗ {attrErr}</span>}
        </div>
      </div>

      {/* ── Verification status ── */}
      <div style={{ padding: '1rem 1.25rem 1.1rem' }}>
        <div style={{
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ds-text-faint)', marginBottom: '0.6rem',
        }}>
          Verification status
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {STAGES.map((stage, i) => {
            const isActive = stage.status === status
            const isPast   = STAGES.findIndex(s => s.status === status) > i
            return (
              <button
                key={stage.status}
                onClick={() => handleStatusClick(stage.status)}
                disabled={verifyPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.3rem 0.75rem', borderRadius: 99,
                  border: `1.5px solid ${isActive || isPast ? stage.color : 'var(--ds-border)'}`,
                  background: isActive ? stage.activeBg : isPast ? `${stage.color}18` : 'transparent',
                  color: isActive ? '#fff' : isPast ? stage.color : 'var(--ds-text-muted)',
                  fontSize: '0.78rem', fontWeight: isActive ? 700 : 500,
                  cursor: verifyPending ? 'not-allowed' : 'pointer',
                  opacity: verifyPending ? 0.7 : 1,
                  transition: 'all 0.15s ease', whiteSpace: 'nowrap',
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
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-sub)', marginBottom: '0.35rem' }}>
            Review notes
            {status !== 'in_review' && notes === '' && (
              <span style={{ fontWeight: 400, color: 'var(--ds-text-faint)', marginLeft: '0.4rem' }}>
                · set status to In review to add notes
              </span>
            )}
          </label>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); setVerifyMsg(null) }}
            placeholder="Log missing profiles, incorrect component details, or any changes needed…"
            rows={status === 'in_review' ? 4 : 2}
            style={{
              ...inputStyle,
              border: `1px solid ${notesUnsaved ? 'var(--ds-navy)' : 'var(--ds-border)'}`,
              resize: 'vertical', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
            <button
              onClick={handleSaveNotes}
              disabled={!notesUnsaved || verifyPending}
              style={{
                padding: '0.3rem 0.85rem', borderRadius: 6,
                border: '1.5px solid var(--ds-navy)',
                background: notesUnsaved && !verifyPending ? 'var(--ds-navy)' : 'transparent',
                color: notesUnsaved && !verifyPending ? '#fff' : 'var(--ds-text-faint)',
                fontSize: '0.78rem', fontWeight: 600,
                cursor: notesUnsaved && !verifyPending ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
              }}
            >
              {verifyPending ? 'Saving…' : 'Save notes'}
            </button>
            {verifyMsg && <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>✓ {verifyMsg}</span>}
            {verifyErr && <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>✗ {verifyErr}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
