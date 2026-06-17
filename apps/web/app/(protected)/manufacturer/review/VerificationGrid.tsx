'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { SystemCard } from '@/components/system-card/SystemCard'
import type { SystemCardData } from '@/components/system-card/SystemCard'
import type { VerificationSystem, VerificationSystemProfile, VerificationSystemColour, VerificationSystemComponent } from '@/lib/studio-manufacturer/workspace'
import {
  upsertFieldVerification,
  clearFieldVerification,
  markSystemVerified,
  setSystemInReview,
  reopenSystem,
  saveSystemNotes,
  addMissingProfile,
  updateProfile,
  addMissingColour,
  updateColour,
  addMissingComponent,
  updateComponent,
  getManufacturerComponents,
  linkExistingComponent,
  updateSystemImageCrop,
  type FieldVerificationStatus,
} from '@/lib/studio-manufacturer/verification-actions'
import { SubmitForPublication } from './SubmitForPublication'

// ─── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, { bg: string; color: string }> = {
  'Cladding':                      { bg: '#dbeafe', color: '#1e40af' },
  'Flooring':                      { bg: '#d1fae5', color: '#065f46' },
  'Decking':                       { bg: '#d1fae5', color: '#065f46' },
  'Waterproofing':                 { bg: '#e0f2fe', color: '#0369a1' },
  'Interior Linings':              { bg: '#ede9fe', color: '#5b21b6' },
  'Soffit & Eaves':                { bg: '#fce7f3', color: '#9d174d' },
  'Pergolas & Outdoor Structures': { bg: '#fef3c7', color: '#92400e' },
  'Roofing':                       { bg: '#fee2e2', color: '#991b1b' },
  'Wall System':                   { bg: '#f3f4f6', color: '#374151' },
  'Weatherboard':                  { bg: '#fff7ed', color: '#9a3412' },
}

const BAL_OPTIONS = ['12.5', '29', '40', 'FZ', 'All levels']

// ─── Per-field state ──────────────────────────────────────────────────────────

type FieldState = {
  status: 'approved' | 'edited' | 'flagged' | null
  verifiedValue: string | null
  notes: string | null
}
type FieldStateMap = Record<string, FieldState>

// ─── System tile ──────────────────────────────────────────────────────────────

function SystemTile({ system, onClick }: { system: VerificationSystem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const category = system.category ?? 'Unknown'
  const catStyle = CATEGORY_COLOURS[category] ?? { bg: '#f3f4f6', color: '#374151' }
  const profileCount = system.profiles.length

  const isVerified = system.verification_status === 'manufacturer_verified'
  const isInReview = system.verification_status === 'in_review'

  const statusLabel = isVerified ? 'Verified' : isInReview ? 'In review' : 'Not started'
  const statusColor = isVerified ? '#16a34a' : isInReview ? '#d97706' : '#9ca3af'
  const statusBg    = isVerified ? '#f0fdf4' : isInReview ? '#fffbeb' : '#f9fafb'
  const statusBorder= isVerified ? '#bbf7d0' : isInReview ? '#fde68a' : '#e5e7eb'

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%',
        background: '#ffffff',
        border: isVerified ? '1.5px solid #16a34a' : hovered ? '1.5px solid #185D7A' : '1px solid #d1d5db',
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        boxShadow: hovered ? '0 8px 28px rgba(24,93,122,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        opacity: isVerified ? 0.85 : 1,
      }}
    >
      <div style={{
        height: '180px', flexShrink: 0, position: 'relative',
        ...(system.hero_image_url
          ? { backgroundImage: `url(${system.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: `${system.hero_image_position_x ?? 50}% ${system.hero_image_position_y ?? 50}%` }
          : { background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)' }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!system.hero_image_url && (
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
            {system.product_code ?? system.name}
          </span>
        )}
        <span style={{
          position: 'absolute', top: '10px', left: '10px',
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: catStyle.bg, color: catStyle.color,
          padding: '3px 8px', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          {category}
        </span>
        {isVerified && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '10px', fontWeight: 700,
            background: '#16a34a', color: '#fff',
            padding: '3px 8px', borderRadius: '20px',
          }}>
            Verified
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 style={{
          margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
        }}>
          {system.name}
        </h3>
        {system.description && (
          <p style={{
            margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {system.description}
          </p>
        )}
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
          {profileCount > 0 ? `${profileCount} profile${profileCount !== 1 ? 's' : ''}` : 'No profiles'}
        </div>
      </div>
      <div style={{
        margin: '10px 14px 14px', padding: '6px 10px',
        background: statusBg, border: `1px solid ${statusBorder}`, borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
        <span style={{ fontSize: '11px', color: '#185D7A', fontWeight: 600 }}>
          {isVerified ? 'Re-open' : 'Open to verify'} →
        </span>
      </div>
    </button>
  )
}

// ─── Action buttons (shared) ──────────────────────────────────────────────────

function ActionButtons({
  status,
  pending,
  onApprove,
  onToggleEdit,
  onToggleFlag,
  activeAction,
}: {
  status: FieldState['status']
  pending: boolean
  onApprove: () => void
  onToggleEdit: () => void
  onToggleFlag: () => void
  activeAction: 'approve' | 'edit' | 'flag' | null
}) {
  if (pending) return <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
  return (
    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
      <button type="button" title={status === 'approved' ? 'Remove approval' : 'Mark as correct'} onClick={onApprove}
        style={{
          width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
          border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
          background: status === 'approved' ? '#16a34a' : '#fff',
          color: status === 'approved' ? '#fff' : '#6b7280',
          fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✓</button>
      <button type="button" title="Edit value" onClick={onToggleEdit}
        style={{
          width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
          border: `1.5px solid ${status === 'edited' || activeAction === 'edit' ? '#185D7A' : '#d1d5db'}`,
          background: status === 'edited' || activeAction === 'edit' ? '#eef6fa' : '#fff',
          color: status === 'edited' || activeAction === 'edit' ? '#185D7A' : '#6b7280',
          fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✏</button>
      <button type="button" title="Flag for review" onClick={onToggleFlag}
        style={{
          width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
          border: `1.5px solid ${status === 'flagged' || activeAction === 'flag' ? '#dc2626' : '#d1d5db'}`,
          background: status === 'flagged' || activeAction === 'flag' ? '#fef2f2' : '#fff',
          color: status === 'flagged' || activeAction === 'flag' ? '#dc2626' : '#6b7280',
          fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>⚑</button>
    </div>
  )
}

// ─── Standard text field row ──────────────────────────────────────────────────

function FieldRow({
  label, fieldName, currentValue, fieldState, systemId, manufacturerId,
  isUrl, onStateChange,
}: {
  label: string
  fieldName: string
  currentValue: string | null
  fieldState: FieldState | null
  systemId: string
  manufacturerId: string
  isUrl?: boolean
  onStateChange: (fieldName: string, state: FieldState | null) => void
}) {
  const statusToAction = (s: FieldVerificationStatus | null): 'approve' | 'edit' | 'flag' | null =>
    s === 'approved' ? 'approve' : s === 'edited' ? 'edit' : s === 'flagged' ? 'flag' : null
  const [activeAction, setActiveAction] = useState<'approve' | 'edit' | 'flag' | null>(statusToAction(fieldState?.status ?? null))
  const [editValue, setEditValue] = useState(fieldState?.verifiedValue ?? currentValue ?? '')
  const [flagNote,  setFlagNote]  = useState(fieldState?.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  const status = fieldState?.status ?? null
  const statusColor = status === 'approved' ? '#16a34a' : status === 'edited' ? '#185D7A' : status === 'flagged' ? '#dc2626' : '#d1d5db'
  const statusBg    = status === 'approved' ? '#f0fdf4' : status === 'edited' ? '#eef6fa' : status === 'flagged' ? '#fef2f2' : 'transparent'
  const displayValue = status === 'edited' ? fieldState?.verifiedValue : currentValue

  function handleApprove() {
    setErrorMsg(null)
    if (status === 'approved') {
      startTransition(async () => {
        const res = await clearFieldVerification(systemId, manufacturerId, fieldName)
        if (!res.ok) { setErrorMsg(res.error); return }
        setActiveAction(null)
        onStateChange(fieldName, null)
      })
      return
    }
    setActiveAction('approve')
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, currentValue, currentValue, 'approved', null)
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'approved', verifiedValue: currentValue, notes: null })
    })
  }

  function handleSaveEdit() {
    if (!editValue.trim()) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, currentValue, editValue.trim(), 'edited', null)
      if (!res.ok) { setErrorMsg(res.error); return }
      setActiveAction(null)
      onStateChange(fieldName, { status: 'edited', verifiedValue: editValue.trim(), notes: null })
    })
  }

  function handleSaveFlag() {
    setErrorMsg(null); setActiveAction('flag')
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, currentValue, null, 'flagged', flagNote.trim() || null)
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'flagged', verifiedValue: null, notes: flagNote.trim() || null })
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${statusColor}`, background: statusBg, padding: '10px 12px', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            {label}
            {status === 'edited'  && <span style={{ marginLeft: '6px', color: '#185D7A', fontWeight: 700 }}>EDITED</span>}
            {status === 'flagged' && <span style={{ marginLeft: '6px', color: '#dc2626', fontWeight: 700 }}>FLAGGED</span>}
          </div>
          {displayValue ? (
            isUrl
              ? <div style={{ fontSize: '12px', color: '#185D7A', wordBreak: 'break-all', lineHeight: 1.4 }}>{displayValue}</div>
              : <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4 }}>{displayValue}</div>
          ) : (
            <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>Empty — paste value below to fill</div>
          )}
        </div>
        <ActionButtons status={status} pending={pending} activeAction={activeAction}
          onApprove={handleApprove}
          onToggleEdit={() => setActiveAction(activeAction === 'edit' ? null : 'edit')}
          onToggleFlag={() => setActiveAction(activeAction === 'flag' ? null : 'flag')}
        />
      </div>
      {activeAction === 'edit' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
            placeholder={isUrl ? 'Paste URL here…' : `Enter correct ${label.toLowerCase()}…`}
            style={{ flex: 1, padding: '6px 8px', border: '1.5px solid #185D7A', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
            autoFocus />
          <button type="button" onClick={handleSaveEdit} disabled={pending || !editValue.trim()}
            style={{ padding: '6px 12px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !editValue.trim() ? 0.5 : 1 }}>
            Save
          </button>
        </div>
      )}
      {activeAction === 'flag' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input type="text" value={flagNote} onChange={e => setFlagNote(e.target.value)}
            placeholder="Describe what needs fixing…"
            style={{ flex: 1, padding: '6px 8px', border: '1.5px solid #dc2626', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
            autoFocus />
          <button type="button" onClick={handleSaveFlag} disabled={pending}
            style={{ padding: '6px 12px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
            Flag
          </button>
        </div>
      )}
      {errorMsg && <div style={{ marginTop: '4px', fontSize: '11px', color: '#dc2626' }}>{errorMsg}</div>}
    </div>
  )
}

// ─── Boolean toggle field row (true / null) ───────────────────────────────────

function BoolToggleFieldRow({
  label, fieldName, currentValue, fieldState, systemId, manufacturerId, onStateChange,
}: {
  label: string
  fieldName: string
  currentValue: boolean | null
  fieldState: FieldState | null
  systemId: string
  manufacturerId: string
  onStateChange: (fieldName: string, state: FieldState | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]    = useState<string | null>(null)
  const status = fieldState?.status ?? null

  // Effective value: if edited, use verifiedValue; else use currentValue
  const effectiveStr = status === 'edited' ? fieldState?.verifiedValue : (currentValue === true ? 'true' : null)
  const isTrue = effectiveStr === 'true'

  const statusColor = status === 'approved' ? '#16a34a' : status === 'edited' ? '#185D7A' : status === 'flagged' ? '#dc2626' : '#d1d5db'
  const statusBg    = status === 'approved' ? '#f0fdf4' : status === 'edited' ? '#eef6fa' : status === 'flagged' ? '#fef2f2' : 'transparent'

  function toggle(newVal: boolean | null) {
    setErrorMsg(null)
    const newStrVal = newVal === true ? 'true' : null
    startTransition(async () => {
      const res = await upsertFieldVerification(
        systemId, manufacturerId, fieldName,
        currentValue === true ? 'true' : null,
        newStrVal,
        'edited',
        null,
      )
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'edited', verifiedValue: newStrVal, notes: null })
    })
  }

  function handleApprove() {
    setErrorMsg(null)
    if (status === 'approved') {
      startTransition(async () => {
        const res = await clearFieldVerification(systemId, manufacturerId, fieldName)
        if (!res.ok) { setErrorMsg(res.error); return }
        onStateChange(fieldName, null)
      })
      return
    }
    const strVal = currentValue === true ? 'true' : null
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, strVal, strVal, 'approved', null)
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'approved', verifiedValue: strVal, notes: null })
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${statusColor}`, background: statusBg, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            {label}
            {status === 'edited'  && <span style={{ marginLeft: '6px', color: '#185D7A', fontWeight: 700 }}>EDITED</span>}
          </div>
          {/* Toggle buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => toggle(true)} disabled={pending}
              style={{
                padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                border: `1.5px solid ${isTrue ? '#16a34a' : '#d1d5db'}`,
                background: isTrue ? '#16a34a' : '#fff',
                color: isTrue ? '#fff' : '#6b7280',
                cursor: 'pointer', transition: 'all 0.12s',
              }}>
              Yes
            </button>
            <button type="button" onClick={() => toggle(null)} disabled={pending}
              style={{
                padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                border: `1.5px solid ${!isTrue ? '#6b7280' : '#d1d5db'}`,
                background: !isTrue ? '#6b7280' : '#fff',
                color: !isTrue ? '#fff' : '#9ca3af',
                cursor: 'pointer', transition: 'all 0.12s',
              }}>
              Not set
            </button>
          </div>
        </div>
        {/* Approve / flag */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {pending
            ? <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
            : (
              <button type="button" title={status === 'approved' ? 'Remove approval' : 'Mark as correct'} onClick={handleApprove}
                style={{
                  width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                  border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
                  background: status === 'approved' ? '#16a34a' : '#fff',
                  color: status === 'approved' ? '#fff' : '#6b7280',
                  fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✓</button>
            )
          }
        </div>
      </div>
      {errorMsg && <div style={{ marginTop: '4px', fontSize: '11px', color: '#dc2626' }}>{errorMsg}</div>}
    </div>
  )
}

// ─── BAL rating dropdown field row ────────────────────────────────────────────

function BALFieldRow({
  fieldName, currentValue, fieldState, systemId, manufacturerId, onStateChange,
}: {
  fieldName: string
  currentValue: string | null
  fieldState: FieldState | null
  systemId: string
  manufacturerId: string
  onStateChange: (fieldName: string, state: FieldState | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]    = useState<string | null>(null)
  const status = fieldState?.status ?? null
  const effectiveValue = status === 'edited' ? fieldState?.verifiedValue : currentValue

  const statusColor = status === 'approved' ? '#16a34a' : status === 'edited' ? '#185D7A' : '#d1d5db'
  const statusBg    = status === 'approved' ? '#f0fdf4' : status === 'edited' ? '#eef6fa' : 'transparent'

  function handleSelect(val: string) {
    setErrorMsg(null)
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, currentValue, val || null, 'edited', null)
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'edited', verifiedValue: val || null, notes: null })
    })
  }

  function handleApprove() {
    setErrorMsg(null)
    if (status === 'approved') {
      startTransition(async () => {
        const res = await clearFieldVerification(systemId, manufacturerId, fieldName)
        if (!res.ok) { setErrorMsg(res.error); return }
        onStateChange(fieldName, null)
      })
      return
    }
    startTransition(async () => {
      const res = await upsertFieldVerification(systemId, manufacturerId, fieldName, currentValue, currentValue, 'approved', null)
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'approved', verifiedValue: currentValue, notes: null })
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${statusColor}`, background: statusBg, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            BAL Rating
            {status === 'edited' && <span style={{ marginLeft: '6px', color: '#185D7A', fontWeight: 700 }}>EDITED</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {/* None option */}
            <button type="button" onClick={() => handleSelect('')} disabled={pending}
              style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                border: `1.5px solid ${!effectiveValue ? '#6b7280' : '#d1d5db'}`,
                background: !effectiveValue ? '#6b7280' : '#fff',
                color: !effectiveValue ? '#fff' : '#9ca3af',
                cursor: 'pointer',
              }}>
              Not set
            </button>
            {BAL_OPTIONS.map(opt => (
              <button key={opt} type="button" onClick={() => handleSelect(opt)} disabled={pending}
                style={{
                  padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                  border: `1.5px solid ${effectiveValue === opt ? '#185D7A' : '#d1d5db'}`,
                  background: effectiveValue === opt ? '#185D7A' : '#fff',
                  color: effectiveValue === opt ? '#fff' : '#374151',
                  cursor: 'pointer',
                }}>
                BAL-{opt}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {pending
            ? <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
            : (
              <button type="button" title={status === 'approved' ? 'Remove approval' : 'Mark as correct'} onClick={handleApprove}
                style={{
                  width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                  border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
                  background: status === 'approved' ? '#16a34a' : '#fff',
                  color: status === 'approved' ? '#fff' : '#6b7280',
                  fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>✓</button>
            )
          }
        </div>
      </div>
      {errorMsg && <div style={{ marginTop: '4px', fontSize: '11px', color: '#dc2626' }}>{errorMsg}</div>}
    </div>
  )
}

// ─── Image crop adjuster ──────────────────────────────────────────────────────

function CropAdjuster({
  imageUrl, positionX, positionY, systemId, manufacturerId, onChange,
}: {
  imageUrl: string | null
  positionX: number
  positionY: number
  systemId: string
  manufacturerId: string
  onChange: (x: number, y: number) => void
}) {
  const [x, setX] = useState(positionX)
  const [y, setY] = useState(positionY)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!imageUrl) return null

  function handleChange(newX: number, newY: number) {
    setX(newX); setY(newY)
    onChange(newX, newY)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSaving(true)
      await updateSystemImageCrop(systemId, manufacturerId, newX, newY)
      setSaving(false)
    }, 600)
  }

  return (
    <div style={{ borderRadius: '8px', border: '1px solid #d1d5db', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Image crop position</span>
        {saving && <span style={{ fontWeight: 400, color: '#9ca3af' }}>saving…</span>}
      </div>
      {/* Preview */}
      <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px', background: '#f0f4f8' }}>
        <img src={imageUrl} alt="crop preview" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x}% ${y}%`, display: 'block' }} />
      </div>
      {/* X slider */}
      <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
        Horizontal — {x === 50 ? 'centre' : x < 50 ? `left ${x}%` : `right ${x}%`}
        <input type="range" min={0} max={100} value={x} onChange={e => handleChange(Number(e.target.value), y)}
          style={{ display: 'block', width: '100%', marginTop: '4px', accentColor: '#185D7A' }} />
      </label>
      {/* Y slider */}
      <label style={{ display: 'block', fontSize: '11px', color: '#6b7280' }}>
        Vertical — {y === 50 ? 'centre' : y < 50 ? `top ${y}%` : `bottom ${y}%`}
        <input type="range" min={0} max={100} value={y} onChange={e => handleChange(x, Number(e.target.value))}
          style={{ display: 'block', width: '100%', marginTop: '4px', accentColor: '#185D7A' }} />
      </label>
    </div>
  )
}

// ─── Field section heading ────────────────────────────────────────────────────

function FieldSection({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155' }}>
          {label}
        </div>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Inline profile editor ────────────────────────────────────────────────────

function ProfileItem({
  profile, systemId, manufacturerId, onUpdated,
}: {
  profile: VerificationSystemProfile
  systemId: string
  manufacturerId: string
  onUpdated: (id: string, data: Partial<VerificationSystemProfile>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(profile.profile_name ?? '')
  const [code,    setCode]    = useState(profile.product_code ?? '')
  const [len,     setLen]     = useState(profile.length_mm != null ? String(profile.length_mm) : '')
  const [width,   setWidth]   = useState(profile.width_mm != null ? String(profile.width_mm) : '')
  const [thick,   setThick]   = useState(profile.thickness_mm != null ? String(profile.thickness_mm) : '')
  const [uom,     setUom]     = useState(profile.uom ?? '')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]     = useState<string | null>(null)

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateProfile(profile.id, systemId, manufacturerId, {
        profile_name:  name.trim() || undefined,
        product_code:  code.trim() || null,
        length_mm:     len   ? parseFloat(len)   : null,
        width_mm:      width ? parseFloat(width)  : null,
        thickness_mm:  thick ? parseFloat(thick) : null,
        uom:           uom.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(profile.id, {
        profile_name: name.trim(),
        product_code: code.trim() || null,
        length_mm:    len   ? parseFloat(len)  : null,
        width_mm:     width ? parseFloat(width) : null,
        thickness_mm: thick ? parseFloat(thick) : null,
        uom:          uom.trim() || null,
      })
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{profile.profile_name}</div>
          <div style={{ color: '#6b7280', marginTop: '2px' }}>
            {[profile.product_code, profile.dimensions,
              profile.length_mm ? `${profile.length_mm}mm` : null,
              profile.width_mm  ? `${profile.width_mm}mm`  : null,
              profile.thickness_mm ? `${profile.thickness_mm}mm thick` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button type="button" onClick={() => setEditing(true)}
          style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#6b7280', cursor: 'pointer', flexShrink: 0, marginLeft: '8px' }}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Name
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Product code / SKU
          <input value={code} onChange={e => setCode(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Length (mm)
          <input type="number" value={len} onChange={e => setLen(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Width (mm)
          <input type="number" value={width} onChange={e => setWidth(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Thickness (mm)
          <input type="number" value={thick} onChange={e => setThick(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          UOM
          <input value={uom} onChange={e => setUom(e.target.value)} placeholder="e.g. LENGTH, SHT"
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
      </div>
      {err && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={handleSave} disabled={pending || !name.trim()}
          style={{ padding: '5px 14px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Add new profile form ─────────────────────────────────────────────────────

function AddProfileForm({
  systemId, manufacturerId, onAdded, onCancel,
}: {
  systemId: string
  manufacturerId: string
  onAdded: (profile: VerificationSystemProfile) => void
  onCancel: () => void
}) {
  const [name,    setName]  = useState('')
  const [code,    setCode]  = useState('')
  const [len,     setLen]   = useState('')
  const [width,   setWidth] = useState('')
  const [thick,   setThick] = useState('')
  const [uom,     setUom]   = useState('')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]   = useState<string | null>(null)

  function handleAdd() {
    if (!name.trim()) return
    setErr(null)
    startTransition(async () => {
      const res = await addMissingProfile(systemId, manufacturerId, {
        profile_name: name.trim(),
        product_code: code.trim() || undefined,
        length_mm: len ? parseFloat(len) : null,
        width_mm: width ? parseFloat(width) : null,
        thickness_mm: thick ? parseFloat(thick) : null,
        uom: uom.trim() || undefined,
      })
      if (!res.ok) { setErr(res.error); return }
      onAdded({
        id: res.id,
        profile_name: name.trim(),
        product_code: code.trim() || null,
        dimensions: null,
        length_mm: len ? parseFloat(len) : null,
        height_mm: null,
        width_mm: width ? parseFloat(width) : null,
        thickness_mm: thick ? parseFloat(thick) : null,
        uom: uom.trim() || null,
        supplier_pack_qty: null,
        supplier_pack_uom: null,
        sort_order: null,
      })
    })
  }

  return (
    <div style={{ padding: '10px', background: '#fffbeb', border: '1.5px solid #d97706', borderRadius: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Add missing profile / variant
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Name *
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 137mm × 23mm Square"
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
            autoFocus />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Product code / SKU
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. XG137SQ"
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Length (mm)
          <input type="number" value={len} onChange={e => setLen(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Width (mm)
          <input type="number" value={width} onChange={e => setWidth(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Thickness (mm)
          <input type="number" value={thick} onChange={e => setThick(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          UOM
          <input value={uom} onChange={e => setUom(e.target.value)} placeholder="LENGTH, SHT, EA…"
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
      </div>
      {err && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={handleAdd} disabled={pending || !name.trim()}
          style={{ padding: '5px 14px', borderRadius: '6px', background: '#d97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !name.trim() ? 0.5 : 1 }}>
          {pending ? 'Adding…' : 'Add profile'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Colour item ──────────────────────────────────────────────────────────────

function ColourItem({
  colour, systemId, manufacturerId, onUpdated,
}: {
  colour: VerificationSystemColour
  systemId: string
  manufacturerId: string
  onUpdated: (id: string, data: Partial<VerificationSystemColour>) => void
}) {
  const [editing, setEditing]   = useState(false)
  const [name,    setName]      = useState(colour.colour_name)
  const [suffix,  setSuffix]    = useState(colour.sku_suffix ?? '')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]       = useState<string | null>(null)

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateColour(colour.id, systemId, manufacturerId, {
        colour_name: name.trim() || undefined,
        sku_suffix: suffix.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(colour.id, { colour_name: name.trim(), sku_suffix: suffix.trim() || null })
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '99px', fontSize: '11px', color: '#374151' }}>
        {colour.colour_name}
        {colour.sku_suffix && <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{colour.sku_suffix}</span>}
        <button type="button" onClick={() => setEditing(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '10px', padding: '0 2px', lineHeight: 1 }}>
          ✏
        </button>
      </span>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '8px', padding: '6px 10px' }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Colour name"
        style={{ width: '120px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
      <input value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="SKU suffix"
        style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
      {err && <span style={{ fontSize: '11px', color: '#dc2626' }}>{err}</span>}
      <button type="button" onClick={handleSave} disabled={pending || !name.trim()}
        style={{ padding: '4px 10px', borderRadius: '5px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
        {pending ? '…' : 'Save'}
      </button>
      <button type="button" onClick={() => setEditing(false)}
        style={{ padding: '4px 8px', borderRadius: '5px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
        ×
      </button>
    </div>
  )
}

// ─── Add colour form ──────────────────────────────────────────────────────────

function AddColourForm({
  systemId, manufacturerId, onAdded, onCancel,
}: {
  systemId: string
  manufacturerId: string
  onAdded: (colour: VerificationSystemColour) => void
  onCancel: () => void
}) {
  const [name,    setName]   = useState('')
  const [suffix,  setSuffix] = useState('')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]    = useState<string | null>(null)

  function handleAdd() {
    if (!name.trim()) return
    setErr(null)
    startTransition(async () => {
      const res = await addMissingColour(systemId, manufacturerId, { colour_name: name.trim(), sku_suffix: suffix.trim() || undefined })
      if (!res.ok) { setErr(res.error); return }
      onAdded({ id: res.id, colour_name: name.trim(), sku_suffix: suffix.trim() || null, is_stocked: true })
    })
  }

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#fffbeb', border: '1.5px solid #d97706', borderRadius: '8px', padding: '6px 10px' }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Colour / finish name *"
        style={{ flex: 1, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
        autoFocus />
      <input value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="SKU suffix"
        style={{ width: '90px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
      {err && <span style={{ fontSize: '11px', color: '#dc2626' }}>{err}</span>}
      <button type="button" onClick={handleAdd} disabled={pending || !name.trim()}
        style={{ padding: '4px 12px', borderRadius: '5px', background: '#d97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !name.trim() ? 0.5 : 1 }}>
        {pending ? '…' : 'Add'}
      </button>
      <button type="button" onClick={onCancel}
        style={{ padding: '4px 8px', borderRadius: '5px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
        ×
      </button>
    </div>
  )
}

// ─── Component item ───────────────────────────────────────────────────────────

function ComponentItem({
  component, manufacturerId, onUpdated,
}: {
  component: VerificationSystemComponent
  manufacturerId: string
  onUpdated: (id: string, data: Partial<VerificationSystemComponent>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(component.name)
  const [sku,     setSku]     = useState(component.sku ?? '')
  const [desc,    setDesc]    = useState(component.description ?? '')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]     = useState<string | null>(null)

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateComponent(component.id, manufacturerId, {
        name: name.trim() || undefined,
        sku: sku.trim() || null,
        description: desc.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(component.id, { name: name.trim(), sku: sku.trim() || null, description: desc.trim() || null })
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', color: '#374151', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600 }}>{component.name}</div>
          {component.description && <div style={{ color: '#6b7280', marginTop: '2px' }}>{component.description}</div>}
          {component.sku && <code style={{ fontSize: '11px', color: '#4b5563' }}>{component.sku}</code>}
        </div>
        <button type="button" onClick={() => setEditing(true)}
          style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#6b7280', cursor: 'pointer', flexShrink: 0, marginLeft: '8px' }}>
          Edit
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '8px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Name *
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          SKU / MFR part number
          <input value={sku} onChange={e => setSku(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
        </label>
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          Description
          <input value={desc} onChange={e => setDesc(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        </label>
      </div>
      {err && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={handleSave} disabled={pending || !name.trim()}
          style={{ padding: '5px 14px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Add component form (search-first, create as fallback) ───────────────────

type ExistingComp = { id: string; name: string; sku: string | null; description: string | null }

function AddComponentForm({
  systemId, manufacturerId, alreadyLinkedIds, onAdded, onCancel,
}: {
  systemId: string
  manufacturerId: string
  alreadyLinkedIds: Set<string>
  onAdded: (component: VerificationSystemComponent) => void
  onCancel: () => void
}) {
  const [mode,       setMode]       = useState<'search' | 'create'>('search')
  const [query,      setQuery]      = useState('')
  const [existing,   setExisting]   = useState<ExistingComp[]>([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState<ExistingComp | null>(null)
  const [pending,    startTransition] = useTransition()
  const [err,        setErr]        = useState<string | null>(null)

  // New-component fields
  const [name, setName] = useState('')
  const [sku,  setSku]  = useState('')
  const [desc, setDesc] = useState('')

  // Load existing components on mount
  useState(() => {
    getManufacturerComponents(manufacturerId).then(res => {
      if (res.ok) setExisting(res.components)
      setLoading(false)
    })
  })

  const filtered = existing.filter(c => {
    if (alreadyLinkedIds.has(c.id)) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.sku ?? '').toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q)
    )
  })

  function handleLink() {
    if (!selected) return
    setErr(null)
    startTransition(async () => {
      const res = await linkExistingComponent(systemId, selected.id, manufacturerId)
      if (!res.ok) { setErr(res.error); return }
      onAdded({
        id: selected.id, name: selected.name, sku: selected.sku,
        description: selected.description, category: null, uom: null,
        supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
        procurement_route: null,
      })
    })
  }

  function handleCreate() {
    if (!name.trim()) return
    setErr(null)
    startTransition(async () => {
      const res = await addMissingComponent(systemId, manufacturerId, {
        name: name.trim(), sku: sku.trim() || undefined, description: desc.trim() || undefined,
      })
      if (!res.ok) { setErr(res.error); return }
      onAdded({
        id: res.id, name: name.trim(), sku: sku.trim() || null,
        description: desc.trim() || null, category: null, uom: null,
        supplier_pack_qty: null, supplier_pack_uom: null, sort_order: null,
        procurement_route: null,
      })
    })
  }

  return (
    <div style={{ padding: '10px', background: '#fffbeb', border: '1.5px solid #d97706', borderRadius: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Add component / accessory
        </div>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button type="button" onClick={() => setMode('search')}
            style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', background: mode === 'search' ? '#d97706' : '#fff', color: mode === 'search' ? '#fff' : '#6b7280', border: mode === 'search' ? 'none' : '1px solid #d1d5db' }}>
            Search existing
          </button>
          <button type="button" onClick={() => setMode('create')}
            style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', background: mode === 'create' ? '#d97706' : '#fff', color: mode === 'create' ? '#fff' : '#6b7280', border: mode === 'create' ? 'none' : '1px solid #d1d5db' }}>
            Create new
          </button>
        </div>
      </div>

      {mode === 'search' ? (
        <>
          <input
            value={query} onChange={e => { setQuery(e.target.value); setSelected(null) }}
            placeholder="Search by name or SKU…"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1.5px solid #d97706', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', marginBottom: '8px', outline: 'none' }}
          />
          {loading ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', padding: '6px 0' }}>Loading components…</div>
          ) : filtered.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#9ca3af', padding: '6px 0' }}>
              {query ? 'No match — ' : 'All components already linked — '}
              <button type="button" onClick={() => setMode('create')}
                style={{ background: 'none', border: 'none', color: '#d97706', fontWeight: 700, cursor: 'pointer', fontSize: '12px', padding: 0 }}>
                create a new one instead
              </button>
            </div>
          ) : (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
              {filtered.map(c => (
                <button key={c.id} type="button" onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                    border: `1.5px solid ${selected?.id === c.id ? '#d97706' : '#e5e7eb'}`,
                    background: selected?.id === c.id ? '#fef3c7' : '#fff',
                    transition: 'all 0.1s',
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                    {[c.sku, c.description].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          )}
          {err && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={handleLink} disabled={pending || !selected}
              style={{ padding: '5px 14px', borderRadius: '6px', background: '#d97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !selected ? 0.5 : 1 }}>
              {pending ? 'Linking…' : 'Link to this system'}
            </button>
            <button type="button" onClick={onCancel}
              style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
              Name *
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Snap-LOC Clip 137mm"
                style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
                autoFocus />
            </label>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
              SKU / MFR part number
              <input value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. KSL137N"
                style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
            </label>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
              Description
              <input value={desc} onChange={e => setDesc(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
            </label>
          </div>
          {err && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '6px' }}>{err}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={handleCreate} disabled={pending || !name.trim()}
              style={{ padding: '5px 14px', borderRadius: '6px', background: '#d97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !name.trim() ? 0.5 : 1 }}>
              {pending ? 'Creating…' : 'Create & link'}
            </button>
            <button type="button" onClick={onCancel}
              style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add button ───────────────────────────────────────────────────────────────

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#185D7A' : '#eef6fa',
        border: '1.5px solid #185D7A',
        borderRadius: '6px',
        padding: '4px 12px',
        fontSize: '11px',
        fontWeight: 700,
        color: hovered ? '#fff' : '#185D7A',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '5px',
        transition: 'background 0.15s, color 0.15s',
        flexShrink: 0,
      }}>
      <span style={{ fontSize: '14px', lineHeight: 1, marginTop: '-1px' }}>+</span> {label}
    </button>
  )
}

// ─── Expanded card view (modal) ───────────────────────────────────────────────

function ExpandedCardView({
  system: initialSystem,
  manufacturerId,
  manufacturerName,
  onClose,
  onStatusChange,
  onSystemFieldUpdate,
}: {
  system: VerificationSystem
  manufacturerId: string
  manufacturerName: string
  onClose: () => void
  onStatusChange: (systemId: string, newStatus: string, reviewerNotes: string | null) => void
  onSystemFieldUpdate: (systemId: string, fieldName: string, value: string) => void
}) {
  const [system, setSystem] = useState(initialSystem)
  const [fieldStates, setFieldStates]   = useState<FieldStateMap>({})
  const [initials,    setInitials]      = useState('')
  const [notes,       setNotes]         = useState(initialSystem.notes ?? '')
  const [notesSaving, setNotesSaving]   = useState(false)
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyMsg, setVerifyMsg]       = useState<string | null>(null)
  const [verifyErr, setVerifyErr]       = useState<string | null>(null)

  // Resizable panel
  const [leftWidth, setLeftWidth] = useState(440)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, width: 440 })

  function onDragHandleMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragStart.current = { x: e.clientX, width: leftWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return
      const delta = ev.clientX - dragStart.current.x
      const next = Math.min(680, Math.max(280, dragStart.current.width + delta))
      setLeftWidth(next)
    }
    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Panel state for add-forms
  const [showAddProfile,   setShowAddProfile]   = useState(false)
  const [showAddColour,    setShowAddColour]     = useState(false)
  const [showAddComponent, setShowAddComponent] = useState(false)

  const isVerified = system.verification_status === 'manufacturer_verified'

  // Mark system in_review when opened
  useEffect(() => {
    if (initialSystem.verification_status === 'pending_review') {
      setSystemInReview(initialSystem.id, manufacturerId).then((res) => {
        if (res.ok) onStatusChange(initialSystem.id, 'in_review', null)
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFieldChange(fieldName: string, state: FieldState | null) {
    setFieldStates(prev => {
      if (state === null) { const next = { ...prev }; delete next[fieldName]; return next }
      return { ...prev, [fieldName]: state }
    })
    if (state?.status === 'edited' && state.verifiedValue !== null) {
      setSystem(prev => ({ ...prev, [fieldName]: state.verifiedValue }))
      onSystemFieldUpdate(system.id, fieldName, state.verifiedValue)
    }
  }

  async function persistNotes() {
    if (notes === (initialSystem.notes ?? '')) return
    setNotesSaving(true)
    await saveSystemNotes(system.id, manufacturerId, notes)
    setNotesSaving(false)
  }

  function handleMarkVerified() {
    if (!initials.trim()) return
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      await persistNotes()
      const res = await markSystemVerified(system.id, manufacturerId, initials.trim())
      if (!res.ok) { setVerifyErr(res.error); return }
      const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' })
      setVerifyMsg('Marked as verified!')
      onStatusChange(system.id, 'manufacturer_verified', `Verified by ${initials.trim().toUpperCase()} on ${dateStr}`)
      setTimeout(() => onClose(), 1200)
    })
  }

  async function handleComeBackLater() {
    await persistNotes()
    onClose()
  }

  function handleReopen() {
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      const res = await reopenSystem(system.id, manufacturerId)
      if (!res.ok) { setVerifyErr(res.error); return }
      setSystem(prev => ({ ...prev, verification_status: 'in_review', reviewer_notes: null }))
      onStatusChange(system.id, 'in_review', null)
    })
  }

  // Local state updaters for sub-lists
  function updateProfileLocal(id: string, data: Partial<VerificationSystemProfile>) {
    setSystem(prev => ({ ...prev, profiles: prev.profiles.map(p => p.id === id ? { ...p, ...data } : p) }))
  }
  function addProfileLocal(profile: VerificationSystemProfile) {
    setSystem(prev => ({ ...prev, profiles: [...prev.profiles, profile] }))
    setShowAddProfile(false)
  }
  function updateColourLocal(id: string, data: Partial<VerificationSystemColour>) {
    setSystem(prev => ({ ...prev, colours: prev.colours.map(c => c.id === id ? { ...c, ...data } : c) }))
  }
  function addColourLocal(colour: VerificationSystemColour) {
    setSystem(prev => ({ ...prev, colours: [...prev.colours, colour] }))
    setShowAddColour(false)
  }
  function updateComponentLocal(id: string, data: Partial<VerificationSystemComponent>) {
    setSystem(prev => ({ ...prev, components: prev.components.map(c => c.id === id ? { ...c, ...data } : c) }))
  }
  function addComponentLocal(component: VerificationSystemComponent) {
    setSystem(prev => ({ ...prev, components: [...prev.components, component] }))
    setShowAddComponent(false)
  }

  const [cropX, setCropX] = useState(system.hero_image_position_x ?? 50)
  const [cropY, setCropY] = useState(system.hero_image_position_y ?? 50)

  // Build SystemCardData
  const cardData: SystemCardData = {
    name:               system.name,
    manufacturer_name:  manufacturerName,
    category:           system.category,
    subcategory:        system.subcategory,
    description:        system.description,
    hero_image_url:     system.hero_image_url,
    hero_image_position_x: cropX,
    hero_image_position_y: cropY,
    bal_rating:         system.bal_rating,
    fire_rating:        system.fire_rating,
    moisture_resistant: system.moisture_resistant,
    acoustic_rating:    system.acoustic_rating,
    structural_grade:   system.structural_grade,
    australian_made:    system.australian_made,
    notes:              system.notes,
    source_url:         system.source_url,
    install_guide_urls: system.install_guide_urls,
    design_guide_url:   system.design_guide_url,
    profiles: system.profiles.map(p => ({
      product_code: p.product_code, profile_name: p.profile_name,
      dimensions: p.dimensions, length_mm: p.length_mm,
      height_mm: p.height_mm, width_mm: p.width_mm, thickness_mm: p.thickness_mm,
      uom: p.uom, supplier_pack_qty: p.supplier_pack_qty,
      supplier_pack_uom: p.supplier_pack_uom, sort_order: p.sort_order,
    })),
    components: system.components.map(c => ({
      sku: c.sku, name: c.name, description: c.description, category: c.category,
      uom: c.uom, supplier_pack_qty: c.supplier_pack_qty,
      supplier_pack_uom: c.supplier_pack_uom, sort_order: c.sort_order,
      procurement_route: c.procurement_route,
    })),
    colours: system.colours.map(c => ({
      colour_name: c.colour_name, sku_suffix: c.sku_suffix, is_stocked: c.is_stocked,
    })),
  }

  const fieldRowProps = (label: string, fieldName: string, opts?: { isUrl?: boolean }) => ({
    label, fieldName,
    currentValue: String((system as any)[fieldName] ?? '') || null,
    fieldState: fieldStates[fieldName] ?? null,
    systemId: system.id, manufacturerId,
    isUrl: opts?.isUrl,
    onStateChange: handleFieldChange,
  })

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, backdropFilter: 'blur(2px)' }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: '16px', zIndex: 101,
        background: '#f8fafc', borderRadius: '16px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '8px', padding: '4px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', gap: '4px' }}>
            ← Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{system.name}</div>
            {system.category && <div style={{ fontSize: '12px', color: '#6b7280' }}>{system.category}</div>}
          </div>
          {isVerified ? (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '20px' }}>Verified</span>
          ) : (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '20px' }}>
              {system.verification_status === 'in_review' ? 'In review' : 'Not started'}
            </span>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af', padding: '4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Body — two columns (resizable) */}
        <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
          {/* Left: system card preview */}
          <div style={{ flex: `0 0 ${leftWidth}px`, minWidth: '280px', maxWidth: '680px', overflowY: 'auto', padding: '20px', background: '#f0f4f8' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Final card preview
            </div>
            <SystemCard data={cardData} />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={onDragHandleMouseDown}
            style={{
              width: '6px', flexShrink: 0, cursor: 'col-resize',
              background: 'transparent',
              borderLeft: '1px solid #e5e7eb',
              borderRight: '1px solid #e5e7eb',
              position: 'relative',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#cbd5e1' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            title="Drag to resize"
          >
            {/* Grip dots */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', gap: '4px',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#94a3b8' }} />
              ))}
            </div>
          </div>

          {/* Right: field editor */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
              Verify each field — tick if correct, edit if wrong, flag if unsure
            </div>

            {/* Product identity */}
            <FieldSection label="Product identity">
              <FieldRow {...fieldRowProps('System name', 'name')} />
              <FieldRow {...fieldRowProps('Category', 'category')} />
              {system.subcategory && <FieldRow {...fieldRowProps('Subcategory', 'subcategory')} />}
              {system.product_code && <FieldRow {...fieldRowProps('Product code', 'product_code')} />}
              <FieldRow {...fieldRowProps('Description', 'description')} />
            </FieldSection>

            {/* Images & resources */}
            <FieldSection label="Images & resources">
              <FieldRow {...fieldRowProps('Hero image URL', 'hero_image_url', { isUrl: true })} />
              <CropAdjuster
                imageUrl={system.hero_image_url}
                positionX={cropX}
                positionY={cropY}
                systemId={system.id}
                manufacturerId={manufacturerId}
                onChange={(x, y) => { setCropX(x); setCropY(y) }}
              />
              {system.website_url  && <FieldRow {...fieldRowProps('Manufacturer website', 'website_url', { isUrl: true })} />}
              {system.source_url   && <FieldRow {...fieldRowProps('Product page URL', 'source_url', { isUrl: true })} />}
              {(system.install_guide_urls ?? []).length > 0
                ? (system.install_guide_urls ?? []).map((g, i) => (
                    <FieldRow key={i} {...fieldRowProps(`Install guide${(system.install_guide_urls?.length ?? 0) > 1 ? ` ${i + 1}` : ''} URL`, 'install_guide_urls', { isUrl: true })}
                      currentValue={g.url}
                    />
                  ))
                : (
                  <FieldRow
                    label="Install guide URL" fieldName="install_guide_urls" currentValue={null}
                    fieldState={fieldStates['install_guide_urls'] ?? null}
                    systemId={system.id} manufacturerId={manufacturerId} isUrl
                    onStateChange={handleFieldChange}
                  />
                )
              }
              {system.tech_data_url
                ? <FieldRow {...fieldRowProps('Technical data URL', 'tech_data_url', { isUrl: true })} />
                : (
                  <FieldRow
                    label="Technical data URL" fieldName="tech_data_url" currentValue={null}
                    fieldState={fieldStates['tech_data_url'] ?? null}
                    systemId={system.id} manufacturerId={manufacturerId} isUrl
                    onStateChange={handleFieldChange}
                  />
                )
              }
              {system.design_guide_url
                ? <FieldRow {...fieldRowProps('Design guide URL', 'design_guide_url', { isUrl: true })} />
                : (
                  <FieldRow
                    label="Design guide URL" fieldName="design_guide_url" currentValue={null}
                    fieldState={fieldStates['design_guide_url'] ?? null}
                    systemId={system.id} manufacturerId={manufacturerId} isUrl
                    onStateChange={handleFieldChange}
                  />
                )
              }
            </FieldSection>

            {/* Technical attributes */}
            <FieldSection label="Technical attributes">
              <BoolToggleFieldRow
                label="Australian made" fieldName="australian_made"
                currentValue={system.australian_made}
                fieldState={fieldStates['australian_made'] ?? null}
                systemId={system.id} manufacturerId={manufacturerId}
                onStateChange={handleFieldChange}
              />
              <BoolToggleFieldRow
                label="Moisture resistant" fieldName="moisture_resistant"
                currentValue={system.moisture_resistant}
                fieldState={fieldStates['moisture_resistant'] ?? null}
                systemId={system.id} manufacturerId={manufacturerId}
                onStateChange={handleFieldChange}
              />
              <BoolToggleFieldRow
                label="Acoustic rated" fieldName="acoustic_rating"
                currentValue={system.acoustic_rating ? true : null}
                fieldState={fieldStates['acoustic_rating'] ?? null}
                systemId={system.id} manufacturerId={manufacturerId}
                onStateChange={handleFieldChange}
              />
              <BALFieldRow
                fieldName="bal_rating"
                currentValue={system.bal_rating}
                fieldState={fieldStates['bal_rating'] ?? null}
                systemId={system.id} manufacturerId={manufacturerId}
                onStateChange={handleFieldChange}
              />
              {system.fire_rating     && <FieldRow {...fieldRowProps('Fire rating (FRL)', 'fire_rating')} />}
              {system.structural_grade && <FieldRow {...fieldRowProps('Structural grade', 'structural_grade')} />}
            </FieldSection>

            {/* Profiles */}
            <FieldSection
              label={`Profiles (${system.profiles.length})`}
              action={<AddButton label="Add profile / variant" onClick={() => { setShowAddProfile(true); setShowAddColour(false); setShowAddComponent(false) }} />}
            >
              {system.profiles.map(p => (
                <ProfileItem key={p.id} profile={p} systemId={system.id} manufacturerId={manufacturerId} onUpdated={updateProfileLocal} />
              ))}
              {system.profiles.length === 0 && !showAddProfile && (
                <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>No profiles — add one using the button above.</div>
              )}
              {showAddProfile && (
                <AddProfileForm systemId={system.id} manufacturerId={manufacturerId} onAdded={addProfileLocal} onCancel={() => setShowAddProfile(false)} />
              )}
            </FieldSection>

            {/* Colours */}
            <FieldSection
              label={`Colours & finishes (${system.colours.length})`}
              action={<AddButton label="Add colour / finish" onClick={() => { setShowAddColour(true); setShowAddProfile(false); setShowAddComponent(false) }} />}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {system.colours.map(c => (
                  <ColourItem key={c.id} colour={c} systemId={system.id} manufacturerId={manufacturerId} onUpdated={updateColourLocal} />
                ))}
              </div>
              {system.colours.length === 0 && !showAddColour && (
                <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>No colours recorded.</div>
              )}
              {showAddColour && (
                <AddColourForm systemId={system.id} manufacturerId={manufacturerId} onAdded={addColourLocal} onCancel={() => setShowAddColour(false)} />
              )}
            </FieldSection>

            {/* Components */}
            <FieldSection
              label={`Components & accessories (${system.components.length})`}
              action={<AddButton label="Add component / accessory" onClick={() => { setShowAddComponent(true); setShowAddProfile(false); setShowAddColour(false) }} />}
            >
              {system.components.map(c => (
                <ComponentItem key={c.id} component={c} manufacturerId={manufacturerId} onUpdated={updateComponentLocal} />
              ))}
              {system.components.length === 0 && !showAddComponent && (
                <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>No components recorded — add one using the button above.</div>
              )}
              {showAddComponent && (
                <AddComponentForm
                  systemId={system.id} manufacturerId={manufacturerId}
                  alreadyLinkedIds={new Set(system.components.map(c => c.id))}
                  onAdded={addComponentLocal} onCancel={() => setShowAddComponent(false)}
                />
              )}
            </FieldSection>

            {/* Notes */}
            <FieldSection label="Notes">
              <div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={persistNotes}
                  placeholder="Any notes about this system — missing info, things to check, context for the BuildQuote team…"
                  rows={4}
                  style={{
                    width: '100%', padding: '8px 10px',
                    border: '1.5px solid #e2e8f0', borderRadius: '8px',
                    fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.5,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                    color: '#374151',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#185D7A' }}
                />
                {notesSaving && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>Saving notes…</div>}
              </div>
            </FieldSection>

            <div style={{ height: 1, background: '#e2e8f0', margin: '20px 0' }} />

            {/* Verify footer */}
            {isVerified ? (
              <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', marginBottom: '6px' }}>This system is verified</div>
                {system.reviewer_notes && (
                  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px' }}>{system.reviewer_notes}</div>
                )}
                <button onClick={handleReopen} disabled={verifyPending}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #6b7280', background: '#fff', color: '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: verifyPending ? 0.5 : 1 }}>
                  Re-open for editing
                </button>
                {verifyErr && <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626' }}>{verifyErr}</div>}
              </div>
            ) : (
              <div style={{ padding: '16px', background: '#fff', border: '1.5px solid #185D7A', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Mark as verified</div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Once you have checked every field above and are satisfied the card is correct, enter your initials and submit. If you need to gather more information first, save and come back later.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text" value={initials}
                    onChange={e => setInitials(e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="Initials" maxLength={5}
                    style={{ width: '80px', padding: '8px 10px', border: '1.5px solid #185D7A', borderRadius: '6px', fontSize: '14px', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={handleMarkVerified}
                    disabled={verifyPending || !initials.trim()}
                    style={{ flex: 1, padding: '8px 16px', borderRadius: '6px', background: verifyPending || !initials.trim() ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: verifyPending || !initials.trim() ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                    {verifyPending ? 'Saving…' : 'Submit — verified and ready for BuildQuote review'}
                  </button>
                </div>
                {/* Come back later */}
                <button
                  onClick={handleComeBackLater}
                  style={{ marginTop: '8px', width: '100%', padding: '8px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                  Save notes & come back later
                </button>
                {verifyMsg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>{verifyMsg}</div>}
                {verifyErr && <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{verifyErr}</div>}
              </div>
            )}

            <div style={{ height: 40 }} />
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main grid ────────────────────────────────────────────────────────────────

export function VerificationGrid({
  manufacturerId,
  manufacturerName,
  systems: initialSystems,
}: {
  manufacturerId: string
  manufacturerName: string
  systems: VerificationSystem[]
}) {
  const [systems,    setSystems]    = useState(initialSystems)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const expandedSystem = systems.find(s => s.id === expandedId) ?? null

  function handleStatusChange(systemId: string, newStatus: string, reviewerNotes: string | null) {
    setSystems(prev => prev.map(s =>
      s.id === systemId ? { ...s, verification_status: newStatus, reviewer_notes: reviewerNotes } : s,
    ))
  }

  function handleSystemFieldUpdate(systemId: string, fieldName: string, value: string) {
    setSystems(prev => prev.map(s =>
      s.id === systemId ? { ...s, [fieldName]: value } : s,
    ))
  }

  const statusOrder = { pending_review: 0, in_review: 1, manufacturer_verified: 2 }
  const sorted = [...systems].sort((a, b) =>
    (statusOrder[a.verification_status as keyof typeof statusOrder] ?? 0) -
    (statusOrder[b.verification_status as keyof typeof statusOrder] ?? 0),
  )
  const unverified = sorted.filter(s => s.verification_status !== 'manufacturer_verified')
  const verified   = sorted.filter(s => s.verification_status === 'manufacturer_verified')

  return (
    <>
      <style>{`
        .vgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        @media (min-width: 900px)  { .vgrid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1280px) { .vgrid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>

      {unverified.length > 0 && (
        <div className="vgrid" style={{ marginBottom: verified.length > 0 ? '28px' : 0 }}>
          {unverified.map(system => (
            <SystemTile key={system.id} system={system} onClick={() => setExpandedId(system.id)} />
          ))}
        </div>
      )}

      {verified.length > 0 && (
        <>
          {unverified.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                {verified.length} verified
              </span>
              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
            </div>
          )}
          <div className="vgrid">
            {verified.map(system => (
              <SystemTile key={system.id} system={system} onClick={() => setExpandedId(system.id)} />
            ))}
          </div>
        </>
      )}

      {expandedSystem && (
        <ExpandedCardView
          system={expandedSystem}
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          onClose={() => setExpandedId(null)}
          onStatusChange={handleStatusChange}
          onSystemFieldUpdate={handleSystemFieldUpdate}
        />
      )}

      <SubmitForPublication
        manufacturerId={manufacturerId}
        verifiedCount={verified.length}
        totalCount={systems.length}
      />
    </>
  )
}
