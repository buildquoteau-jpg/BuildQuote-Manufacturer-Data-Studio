'use client'

import { useState, useEffect, useTransition, useCallback, useRef } from 'react'
import { SystemCard } from '@/components/system-card/SystemCard'
import type { SystemCardData } from '@/components/system-card/SystemCard'
import type { VerificationSystem, VerificationSystemProfile, VerificationSystemColour, VerificationSystemComponent } from '@/lib/studio-manufacturer/workspace'
import type { ManufacturerAsset } from '@/lib/studio-manufacturer/assets'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'
import { addLinkLibraryEntry } from '@/lib/studio-manufacturer/link-library-actions'
import { LinkLibraryPicker } from '@/components/studio/LinkLibraryPicker'
import {
  upsertFieldVerification,
  clearFieldVerification,
  markSystemVerified,
  setSystemInReview,
  reopenSystem,
  saveSystemNotes,
  addMissingProfile,
  updateProfile,
  removeProfile,
  addMissingColour,
  updateColour,
  removeColour,
  addMissingComponent,
  updateComponent,
  unlinkComponent,
  getManufacturerComponents,
  linkExistingComponent,
  updateSystemImageCrop,
  updateSystemHeroAsset,
  setInstallGuideUrls,
  setCustomDocumentLinks,
  setCustomAttributes,
  createBlankSystem,
  linkSourceDocument,
  getManufacturerSourceDocuments,
  archiveSystem,
  deleteSystem,
  type FieldVerificationStatus,
} from '@/lib/studio-manufacturer/verification-actions'
import { SubmitForPublication } from './SubmitForPublication'
import { AssetSlotControl, type SlotAsset, type SlotPick } from '../profile/AssetSlotControl'

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

function SystemTile({ system, assets, onClick }: { system: VerificationSystem; assets: ManufacturerAsset[]; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const category = system.category ?? 'Unknown'
  const catStyle = CATEGORY_COLOURS[category] ?? { bg: '#f3f4f6', color: '#374151' }
  const profileCount = system.profiles.length

  // Prefer the linked asset's image over hero_image_url — that field can be
  // stale or wrong (e.g. accidentally holding an unrelated document link)
  // even when a correct asset is linked. Same precedence as the crop tool
  // and card preview in ExpandedCardView.
  const linkedHeroAsset = system.hero_image_asset_id
    ? assets.find(a => a.id === system.hero_image_asset_id) ?? null
    : null
  const tileImageUrl = linkedHeroAsset?.displayUrl ?? linkedHeroAsset?.publicUrl ?? system.hero_image_url

  const isVerified = system.verification_status === 'manufacturer_verified'
  const isInReview = system.verification_status === 'in_review'
  const isLive = !!system.production_system_id && !!system.last_published_at

  // Live system that was re-opened for editing — needs re-verify before re-publish
  const isLiveInReview = isLive && isInReview

  // Unsent edits — verified but updated_at is newer than last_submitted_at
  const hasUpdateReady = isLive && isVerified && (
    !system.last_submitted_at || new Date(system.updated_at) > new Date(system.last_submitted_at)
  )
  // Submitted to BuildQuote, awaiting admin re-publish (last_submitted_at > last_published_at)
  const isSubmittedForUpdate = !hasUpdateReady && isLive && isVerified &&
    !!system.last_submitted_at &&
    new Date(system.last_submitted_at) > new Date(system.last_published_at!)
  // First-time submit (never been live yet)
  const isSubmittedNew = !isLive && isVerified && !!system.last_submitted_at
  const isSubmitted = isSubmittedForUpdate || isSubmittedNew

  const statusLabel = hasUpdateReady ? 'Update ready'
    : isSubmitted ? 'Submitted'
    : isLiveInReview ? 'Editing (live)'
    : isVerified ? 'Verified'
    : isInReview ? 'In review'
    : 'Not started'
  const statusColor = hasUpdateReady ? '#b45309'
    : isSubmitted ? '#2563eb'
    : isLiveInReview ? '#b45309'
    : isVerified ? '#16a34a'
    : isInReview ? '#d97706'
    : '#9ca3af'
  const statusBg    = hasUpdateReady ? '#fffbeb'
    : isSubmitted ? '#eff6ff'
    : isLiveInReview ? '#fffbeb'
    : isVerified ? '#f0fdf4'
    : isInReview ? '#fffbeb'
    : '#f9fafb'
  const statusBorder = hasUpdateReady ? '#fde68a'
    : isSubmitted ? '#bfdbfe'
    : isLiveInReview ? '#fde68a'
    : isVerified ? '#bbf7d0'
    : isInReview ? '#fde68a'
    : '#e5e7eb'

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%',
        background: '#ffffff',
        border: hasUpdateReady ? '1.5px solid #f59e0b' : isLiveInReview ? '1.5px solid #f59e0b' : isSubmitted ? '1.5px solid #3b82f6' : isVerified ? '1.5px solid #16a34a' : hovered ? '1.5px solid #185D7A' : '1px solid #d1d5db',
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        boxShadow: hovered ? '0 8px 28px rgba(24,93,122,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        opacity: isVerified ? 0.85 : 1,
      }}
    >
      <div style={{
        height: '180px', flexShrink: 0, position: 'relative',
        ...(tileImageUrl
          ? { backgroundImage: `url(${tileImageUrl})`, backgroundSize: 'cover', backgroundPosition: `${system.hero_image_position_x ?? 50}% ${system.hero_image_position_y ?? 50}%` }
          : { background: 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)' }),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!tileImageUrl && (
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
        {(isVerified || isLive) && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '10px', fontWeight: 700,
            background: hasUpdateReady ? '#f59e0b' : isLiveInReview ? '#f59e0b' : isSubmitted ? '#3b82f6' : isLive ? '#0d9488' : '#16a34a',
            color: '#fff',
            padding: '3px 8px', borderRadius: '20px',
          }}>
            {hasUpdateReady ? '↑ Update ready' : isLiveInReview ? '✎ Editing' : isSubmitted ? '● Submitted' : isLive ? '● Live' : 'Verified'}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
          {isLive && !isVerified && (
            <span style={{ fontSize: '10px', color: '#0d9488', fontWeight: 600 }}>● Live on BuildQuote</span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: '#185D7A', fontWeight: 600 }}>
          {isVerified ? (hasUpdateReady ? 'Review →' : 'Open to make changes →') : 'Open to verify →'}
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
  isUrl, multiline, onStateChange,
}: {
  label: string
  fieldName: string
  currentValue: string | null
  fieldState: FieldState | null
  systemId: string
  manufacturerId: string
  isUrl?: boolean
  multiline?: boolean
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
              : <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{displayValue}</div>
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
        multiline ? (
          <div style={{ marginTop: '8px' }}>
            <textarea value={editValue} onChange={e => setEditValue(e.target.value)}
              placeholder={`Enter correct ${label.toLowerCase()}…`}
              rows={5}
              style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #185D7A', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4, resize: 'vertical', boxSizing: 'border-box' }}
              autoFocus />
            <button type="button" onClick={handleSaveEdit} disabled={pending || !editValue.trim()}
              style={{ marginTop: '6px', padding: '6px 12px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !editValue.trim() ? 0.5 : 1 }}>
              Save
            </button>
          </div>
        ) : (
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
        )
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
  imageUrl, positionX, positionY, zoom: initialZoom, systemId, manufacturerId, onChange,
}: {
  imageUrl: string | null
  positionX: number
  positionY: number
  zoom: number
  systemId: string
  manufacturerId: string
  onChange: (x: number, y: number, zoom: number) => void
}) {
  const [x, setX] = useState(positionX)
  const [y, setY] = useState(positionY)
  const [zoom, setZoom] = useState(initialZoom)
  const [savedX, setSavedX] = useState(positionX)
  const [savedY, setSavedY] = useState(positionY)
  const [savedZoom, setSavedZoom] = useState(initialZoom)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  if (!imageUrl) return null

  const dirty = x !== savedX || y !== savedY || zoom !== savedZoom

  function handleChange(newX: number, newY: number, newZoom: number) {
    setX(newX); setY(newY); setZoom(newZoom)
    onChange(newX, newY, newZoom)
  }

  async function handleSave() {
    setSaving(true)
    await updateSystemImageCrop(systemId, manufacturerId, x, y, zoom)
    setSaving(false)
    setSavedX(x); setSavedY(y); setSavedZoom(zoom)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1500)
  }

  return (
    <div style={{ borderRadius: '8px', border: '1px solid #d1d5db', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Image crop position</span>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '4px', border: 'none', cursor: dirty && !saving ? 'pointer' : 'default',
            background: justSaved ? '#16a34a' : dirty ? '#185D7A' : '#e5e7eb',
            color: dirty || justSaved ? '#fff' : '#9ca3af',
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Saving…' : justSaved ? 'Saved ✓' : 'Save position'}
        </button>
      </div>
      {/* Preview — matches system card dimensions: 220px tall × ~360px wide */}
      <div style={{ width: '100%', maxWidth: '360px', height: '220px', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px', background: '#f0f4f8' }}>
        <img src={imageUrl} alt="crop preview" style={{
          width: '100%', height: '100%', objectFit: 'cover',
          objectPosition: `${x}% ${y}%`, display: 'block',
          transform: zoom > 1 ? `scale(${zoom})` : undefined,
          transformOrigin: `${x}% ${y}%`,
        }} />
      </div>
      {/* X slider */}
      <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
        Horizontal — {x === 50 ? 'centre' : x < 50 ? `left ${x}%` : `right ${x}%`}
        <input type="range" min={0} max={100} value={x} onChange={e => handleChange(Number(e.target.value), y, zoom)}
          style={{ display: 'block', width: '100%', marginTop: '4px', accentColor: '#185D7A' }} />
      </label>
      {/* Y slider */}
      <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
        Vertical — {y === 50 ? 'centre' : y < 50 ? `top ${y}%` : `bottom ${y}%`}
        <input type="range" min={0} max={100} value={y} onChange={e => handleChange(x, Number(e.target.value), zoom)}
          style={{ display: 'block', width: '100%', marginTop: '4px', accentColor: '#185D7A' }} />
      </label>
      {/* Zoom slider — scales around the crop point above */}
      <label style={{ display: 'block', fontSize: '11px', color: '#6b7280' }}>
        Zoom — {zoom <= 1 ? 'fit (100%)' : `${Math.round(zoom * 100)}%`}
        <input type="range" min={100} max={300} step={5} value={Math.round(zoom * 100)}
          onChange={e => handleChange(x, y, Number(e.target.value) / 100)}
          style={{ display: 'block', width: '100%', marginTop: '4px', accentColor: '#185D7A' }} />
      </label>
    </div>
  )
}

// ─── Install guides (label + URL, multiple — e.g. steel frame / timber frame) ─

function InstallGuidesEditor({
  guides, systemId, manufacturerId, fieldState, onUpdated, onStateChange,
}: {
  guides: { label: string; url: string }[]
  systemId: string
  manufacturerId: string
  fieldState: FieldState | null
  onUpdated: (guides: { label: string; url: string }[]) => void
  onStateChange: (fieldName: string, state: FieldState | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [flagging, setFlagging] = useState(false)
  const [flagNote, setFlagNote] = useState(fieldState?.notes ?? '')
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyErr, setVerifyErr] = useState<string | null>(null)

  const status = fieldState?.status ?? null
  const statusColor = status === 'approved' ? '#16a34a' : status === 'flagged' ? '#dc2626' : '#d1d5db'
  const statusBg    = status === 'approved' ? '#f0fdf4' : status === 'flagged' ? '#fef2f2' : 'transparent'

  function persist(next: { label: string; url: string }[]) {
    setErr(null)
    startTransition(async () => {
      const res = await setInstallGuideUrls(systemId, manufacturerId, next)
      if (!res.ok) { setErr(res.error); return }
      onUpdated(next)
    })
  }

  function handleAdd() {
    if (!newUrl.trim()) return
    const label = newLabel.trim() || (guides.length > 0 ? `Install guide ${guides.length + 1}` : 'Install guide')
    persist([...guides, { label, url: newUrl.trim() }])
    setNewLabel(''); setNewUrl(''); setAdding(false)
  }

  function handleRemove(i: number) {
    persist(guides.filter((_, idx) => idx !== i))
  }

  function handleEdit(i: number, field: 'label' | 'url', value: string) {
    persist(guides.map((g, idx) => idx === i ? { ...g, [field]: value } : g))
  }

  function handleApprove() {
    setVerifyErr(null)
    if (status === 'approved') {
      startVerifyTransition(async () => {
        const res = await clearFieldVerification(systemId, manufacturerId, 'install_guide_urls')
        if (!res.ok) { setVerifyErr(res.error); return }
        onStateChange('install_guide_urls', null)
      })
      return
    }
    setFlagging(false)
    startVerifyTransition(async () => {
      const value = JSON.stringify(guides)
      const res = await upsertFieldVerification(systemId, manufacturerId, 'install_guide_urls', value, value, 'approved', null)
      if (!res.ok) { setVerifyErr(res.error); return }
      onStateChange('install_guide_urls', { status: 'approved', verifiedValue: value, notes: null })
    })
  }

  function handleSaveFlag() {
    setVerifyErr(null)
    startVerifyTransition(async () => {
      const value = JSON.stringify(guides)
      const res = await upsertFieldVerification(systemId, manufacturerId, 'install_guide_urls', value, null, 'flagged', flagNote.trim() || null)
      if (!res.ok) { setVerifyErr(res.error); return }
      onStateChange('install_guide_urls', { status: 'flagged', verifiedValue: null, notes: flagNote.trim() || null })
      setFlagging(false)
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${statusColor}`, background: statusBg, padding: '10px 12px', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
          Install guide{guides.length !== 1 ? 's' : ''} {guides.length > 0 ? `(${guides.length})` : ''}
          {status === 'flagged' && <span style={{ marginLeft: '6px', color: '#dc2626', fontWeight: 700 }}>FLAGGED</span>}
        </div>
        {verifyPending ? (
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
        ) : (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button type="button" title={status === 'approved' ? 'Remove approval' : 'Mark as correct'} onClick={handleApprove}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
                background: status === 'approved' ? '#16a34a' : '#fff',
                color: status === 'approved' ? '#fff' : '#6b7280',
                fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✓</button>
            <button type="button" title="Flag for review" onClick={() => setFlagging(f => !f)}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'flagged' || flagging ? '#dc2626' : '#d1d5db'}`,
                background: status === 'flagged' || flagging ? '#fef2f2' : '#fff',
                color: status === 'flagged' || flagging ? '#dc2626' : '#6b7280',
                fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>⚑</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {guides.length === 0 && (
          <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>None linked yet.</div>
        )}
        {/* With only one guide there's nothing to distinguish it from, so the
            label is hidden — just a plain URL row, matching every other
            single-value field. A label only appears once there are two or
            more (need something to tell them apart, e.g. "Steel frame" vs
            "Timber frame"). */}
        {guides.map((g, i) => (
          <div key={i} style={{ borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {guides.length > 1 && (
                  <input
                    defaultValue={g.label}
                    onBlur={e => e.target.value.trim() !== g.label && handleEdit(i, 'label', e.target.value.trim())}
                    placeholder="Label, e.g. Steel frame"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11px', fontWeight: 700, marginBottom: '4px', fontFamily: 'inherit' }}
                  />
                )}
                <input
                  defaultValue={g.url}
                  onBlur={e => e.target.value.trim() !== g.url && handleEdit(i, 'url', e.target.value.trim())}
                  placeholder="https://… (PDF or web/video page)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', color: '#185D7A', fontFamily: 'inherit' }}
                />
              </div>
              <button type="button" title="Remove" onClick={() => handleRemove(i)} disabled={pending}
                style={{ width: 28, height: 28, borderRadius: '6px', border: '1.5px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: '13px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>
          </div>
        ))}
        {adding ? (
          <div style={{ borderRadius: '8px', border: '1.5px solid #185D7A', background: '#eef6fa', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Once this becomes the 2nd guide, ask for a label so the two
                can be told apart — the first guide stays unlabelled unless
                a second one shows up. */}
            {guides.length >= 1 && (
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label, e.g. Timber frame"
                style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} autoFocus />
            )}
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://… (PDF or web/video page)"
              style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
              autoFocus={guides.length === 0} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleAdd} disabled={pending || !newUrl.trim()}
                style={{ padding: '5px 14px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !newUrl.trim() ? 0.5 : 1 }}>
                Add
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewLabel(''); setNewUrl('') }}
                style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            style={{ alignSelf: 'flex-start', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, color: '#185D7A', cursor: 'pointer' }}>
            + Add install guide{guides.length > 0 ? ' (e.g. for a different frame type)' : ''}
          </button>
        )}
      </div>
      {flagging && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input type="text" value={flagNote} onChange={e => setFlagNote(e.target.value)}
            placeholder="Describe what needs fixing…"
            style={{ flex: 1, padding: '6px 8px', border: '1.5px solid #dc2626', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
            autoFocus />
          <button type="button" onClick={handleSaveFlag} disabled={verifyPending}
            style={{ padding: '6px 12px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: verifyPending ? 0.5 : 1 }}>
            Flag
          </button>
        </div>
      )}
      {(err || verifyErr) && <div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626' }}>{err ?? verifyErr}</div>}
    </div>
  )
}

// ─── Custom document links (title + URL, multiple — energy ratings, etc.) ─────
// Like install guides, but every entry needs a title because it becomes the
// button text on the card. Use for any document that isn't an install/design/
// tech guide: energy ratings, sustainability reports, warranty PDFs, and so on.

function CustomDocumentsEditor({
  links, systemId, manufacturerId, fieldState, onUpdated, onStateChange, linkLibrary, onLibraryAdd,
}: {
  links: { label: string; url: string }[]
  systemId: string
  manufacturerId: string
  fieldState: FieldState | null
  onUpdated: (links: { label: string; url: string }[]) => void
  onStateChange: (fieldName: string, state: FieldState | null) => void
  linkLibrary: LinkLibraryEntry[]
  onLibraryAdd: (entry: LinkLibraryEntry) => void
}) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [flagging, setFlagging] = useState(false)
  const [flagNote, setFlagNote] = useState(fieldState?.notes ?? '')
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyErr, setVerifyErr] = useState<string | null>(null)

  const status = fieldState?.status ?? null
  const statusColor = status === 'approved' ? '#16a34a' : status === 'flagged' ? '#dc2626' : '#d1d5db'
  const statusBg    = status === 'approved' ? '#f0fdf4' : status === 'flagged' ? '#fef2f2' : 'transparent'

  function persist(next: { label: string; url: string }[]) {
    setErr(null)
    startTransition(async () => {
      const res = await setCustomDocumentLinks(systemId, manufacturerId, next)
      if (!res.ok) { setErr(res.error); return }
      onUpdated(next)
    })
  }

  function handleAdd() {
    if (!newUrl.trim() || !newLabel.trim()) return
    persist([...links, { label: newLabel.trim(), url: newUrl.trim() }])
    if (saveToLibrary) {
      startTransition(async () => {
        const res = await addLinkLibraryEntry(manufacturerId, newLabel.trim(), newUrl.trim())
        if (res.ok) onLibraryAdd(res.entry)
      })
    }
    setNewLabel(''); setNewUrl(''); setSaveToLibrary(false); setAdding(false)
  }

  function handleAttachFromLibrary(entry: LinkLibraryEntry) {
    if (links.some(l => l.url === entry.url)) return
    persist([...links, { label: entry.label, url: entry.url }])
  }

  function handleRemove(i: number) {
    persist(links.filter((_, idx) => idx !== i))
  }

  function handleEdit(i: number, field: 'label' | 'url', value: string) {
    persist(links.map((g, idx) => idx === i ? { ...g, [field]: value } : g))
  }

  function handleApprove() {
    setVerifyErr(null)
    if (status === 'approved') {
      startVerifyTransition(async () => {
        const res = await clearFieldVerification(systemId, manufacturerId, 'custom_document_links')
        if (!res.ok) { setVerifyErr(res.error); return }
        onStateChange('custom_document_links', null)
      })
      return
    }
    setFlagging(false)
    startVerifyTransition(async () => {
      const value = JSON.stringify(links)
      const res = await upsertFieldVerification(systemId, manufacturerId, 'custom_document_links', value, value, 'approved', null)
      if (!res.ok) { setVerifyErr(res.error); return }
      onStateChange('custom_document_links', { status: 'approved', verifiedValue: value, notes: null })
    })
  }

  function handleSaveFlag() {
    setVerifyErr(null)
    startVerifyTransition(async () => {
      const value = JSON.stringify(links)
      const res = await upsertFieldVerification(systemId, manufacturerId, 'custom_document_links', value, null, 'flagged', flagNote.trim() || null)
      if (!res.ok) { setVerifyErr(res.error); return }
      onStateChange('custom_document_links', { status: 'flagged', verifiedValue: null, notes: flagNote.trim() || null })
      setFlagging(false)
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${statusColor}`, background: statusBg, padding: '10px 12px', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
          Additional documents {links.length > 0 ? `(${links.length})` : ''}
          {status === 'flagged' && <span style={{ marginLeft: '6px', color: '#dc2626', fontWeight: 700 }}>FLAGGED</span>}
        </div>
        {verifyPending ? (
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
        ) : (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button type="button" title={status === 'approved' ? 'Remove approval' : 'Mark as correct'} onClick={handleApprove}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
                background: status === 'approved' ? '#16a34a' : '#fff',
                color: status === 'approved' ? '#fff' : '#6b7280',
                fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✓</button>
            <button type="button" title="Flag for review" onClick={() => setFlagging(f => !f)}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'flagged' || flagging ? '#dc2626' : '#d1d5db'}`,
                background: status === 'flagged' || flagging ? '#fef2f2' : '#fff',
                color: status === 'flagged' || flagging ? '#dc2626' : '#6b7280',
                fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>⚑</button>
          </div>
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>
        Energy ratings, sustainability reports, warranty PDFs — anything that isn’t an install, design or technical guide. The title becomes the button on the card.
      </div>
      {linkLibrary.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <LinkLibraryPicker library={linkLibrary} onAttach={handleAttachFromLibrary} disabled={pending} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {links.length === 0 && (
          <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>None linked yet.</div>
        )}
        {links.map((g, i) => (
          <div key={i} style={{ borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  defaultValue={g.label}
                  onBlur={e => e.target.value.trim() !== g.label && handleEdit(i, 'label', e.target.value.trim())}
                  placeholder="Button title, e.g. Energy rating"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11px', fontWeight: 700, marginBottom: '4px', fontFamily: 'inherit' }}
                />
                <input
                  defaultValue={g.url}
                  onBlur={e => e.target.value.trim() !== g.url && handleEdit(i, 'url', e.target.value.trim())}
                  placeholder="https://… (PDF or web page)"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', color: '#185D7A', fontFamily: 'inherit' }}
                />
              </div>
              <button type="button" title="Remove" onClick={() => handleRemove(i)} disabled={pending}
                style={{ width: 28, height: 28, borderRadius: '6px', border: '1.5px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: '13px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>
          </div>
        ))}
        {adding ? (
          <div style={{ borderRadius: '8px', border: '1.5px solid #185D7A', background: '#eef6fa', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Button title, e.g. Sustainability report"
              style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} autoFocus />
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://… (PDF or web page)"
              style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280', cursor: 'pointer' }}>
              <input type="checkbox" checked={saveToLibrary} onChange={e => setSaveToLibrary(e.target.checked)} />
              Save to link library for reuse on other systems
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleAdd} disabled={pending || !newUrl.trim() || !newLabel.trim()}
                style={{ padding: '5px 14px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !newUrl.trim() || !newLabel.trim() ? 0.5 : 1 }}>
                Add
              </button>
              <button type="button" onClick={() => { setAdding(false); setNewLabel(''); setNewUrl(''); setSaveToLibrary(false) }}
                style={{ padding: '5px 12px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            style={{ alignSelf: 'flex-start', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, color: '#185D7A', cursor: 'pointer' }}>
            + Add document
          </button>
        )}
      </div>
      {flagging && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input type="text" value={flagNote} onChange={e => setFlagNote(e.target.value)}
            placeholder="Describe what needs fixing…"
            style={{ flex: 1, padding: '6px 8px', border: '1.5px solid #dc2626', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
            autoFocus />
          <button type="button" onClick={handleSaveFlag} disabled={verifyPending}
            style={{ padding: '6px 12px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: verifyPending ? 0.5 : 1 }}>
            Flag
          </button>
        </div>
      )}
      {(err || verifyErr) && <div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626' }}>{err ?? verifyErr}</div>}
    </div>
  )
}

// ─── Custom technical attributes editor ───────────────────────────────────────
// Freeform label/value pairs for spec facts with no dedicated field
// (e.g. warranty period, R-value, weathering rating).

function CustomAttributesEditor({
  attributes, systemId, manufacturerId, onUpdated,
}: {
  attributes: { label: string; value: string }[]
  systemId: string
  manufacturerId: string
  onUpdated: (attributes: { label: string; value: string }[]) => void
}) {
  const [pending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')

  function persist(next: { label: string; value: string }[]) {
    setErr(null)
    startTransition(async () => {
      const res = await setCustomAttributes(systemId, manufacturerId, next)
      if (!res.ok) { setErr(res.error); return }
      onUpdated(next)
    })
  }

  function handleAdd() {
    if (!newLabel.trim() || !newValue.trim()) return
    persist([...attributes, { label: newLabel.trim(), value: newValue.trim() }])
    setNewLabel(''); setNewValue(''); setAdding(false)
  }

  function handleRemove(i: number) {
    persist(attributes.filter((_, idx) => idx !== i))
  }

  function handleEdit(i: number, field: 'label' | 'value', value: string) {
    persist(attributes.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
  }

  function handleEditCombined(i: number, raw: string) {
    const a = attributes[i]
    const combined = `${a.label}: ${a.value}`
    if (raw.trim() === combined) return
    const sep = raw.indexOf(':')
    const label = (sep === -1 ? raw : raw.slice(0, sep)).trim()
    const value = (sep === -1 ? '' : raw.slice(sep + 1)).trim()
    if (!label) return
    persist(attributes.map((att, idx) => idx === i ? { label, value } : att))
  }

  return (
    <div>
      {attributes.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 0', borderBottom: i < attributes.length - 1 || adding ? '1px solid #f1f5f9' : 'none' }}>
          <input
            defaultValue={`${a.label}: ${a.value}`}
            onBlur={e => handleEditCombined(i, e.target.value)}
            placeholder="Attribute: value, e.g. Warranty: 25 years"
            style={{ flex: 1, minWidth: 0, padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
          />
          <button type="button" title="Remove" onClick={() => handleRemove(i)} disabled={pending}
            style={{ width: 26, height: 26, borderRadius: '6px', border: '1.5px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: attributes.length > 0 ? '8px' : 0 }}>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Attribute, e.g. Warranty"
            style={{ width: '160px', flexShrink: 0, padding: '5px 7px', border: '1px solid #185D7A', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} autoFocus />
          <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Value, e.g. 25 years"
            style={{ flex: 1, minWidth: 0, padding: '5px 7px', border: '1px solid #185D7A', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
          <button type="button" onClick={handleAdd} disabled={pending || !newLabel.trim() || !newValue.trim()}
            style={{ padding: '5px 12px', borderRadius: '6px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: pending || !newLabel.trim() || !newValue.trim() ? 0.5 : 1 }}>
            Add
          </button>
          <button type="button" onClick={() => { setAdding(false); setNewLabel(''); setNewValue('') }}
            style={{ padding: '5px 10px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          style={{ marginTop: attributes.length > 0 ? '8px' : 0, background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', fontWeight: 700, color: '#185D7A', cursor: 'pointer' }}>
          + Add custom attribute
        </button>
      )}
      {err && <div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626' }}>{err}</div>}
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
  profile, rowIndex, systemName, systemId, manufacturerId, onUpdated, onRemoved,
}: {
  profile: VerificationSystemProfile
  rowIndex: number
  systemName: string
  systemId: string
  manufacturerId: string
  onUpdated: (id: string, data: Partial<VerificationSystemProfile>) => void
  onRemoved: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(profile.profile_name ?? '')
  const [code,    setCode]    = useState(profile.product_code ?? '')
  const [desc,    setDesc]    = useState(profile.description ?? '')
  const [len,     setLen]     = useState(profile.length_mm != null ? String(profile.length_mm) : '')
  const [width,   setWidth]   = useState(profile.width_mm != null ? String(profile.width_mm) : '')
  const [thick,   setThick]   = useState(profile.thickness_mm != null ? String(profile.thickness_mm) : '')
  const [uom,     setUom]     = useState(profile.uom ?? '')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [delPending, startDelTransition] = useTransition()
  const [delErr, setDelErr] = useState<string | null>(null)

  function handleDelete() {
    setDelErr(null)
    startDelTransition(async () => {
      const res = await removeProfile(profile.id, systemId, manufacturerId)
      if (!res.ok) { setDelErr(res.error); return }
      onRemoved(profile.id)
    })
  }

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateProfile(profile.id, systemId, manufacturerId, {
        profile_name:  name.trim() || undefined,
        product_code:  code.trim() || null,
        description:   desc.trim() || null,
        length_mm:     len   ? parseFloat(len)   : null,
        width_mm:      width ? parseFloat(width)  : null,
        thickness_mm:  thick ? parseFloat(thick) : null,
        uom:           uom.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(profile.id, {
        profile_name: name.trim(),
        product_code: code.trim() || null,
        description:  desc.trim() || null,
        length_mm:    len   ? parseFloat(len)  : null,
        width_mm:     width ? parseFloat(width) : null,
        thickness_mm: thick ? parseFloat(thick) : null,
        uom:          uom.trim() || null,
      })
      setEditing(false)
    })
  }

  if (!editing) {
    if (confirmDelete) {
      return (
        <tr style={{ background: '#fef2f2' }}>
          <td colSpan={5} style={{ padding: '8px 10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ color: '#991b1b' }}>
                Remove <strong>{profile.profile_name}</strong>?
                {delErr && <div style={{ color: '#dc2626', marginTop: '2px' }}>{delErr}</div>}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button type="button" onClick={handleDelete} disabled={delPending}
                  style={{ padding: '4px 10px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: delPending ? 0.5 : 1 }}>
                  {delPending ? 'Removing…' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} disabled={delPending}
                  style={{ padding: '4px 10px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '11px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )
    }

    // Structured L/W/T formatted here; falls back to the raw `dimensions`
    // text only when none of those numeric fields are set (older/manually
    // entered profiles) — never both, so the same numbers don't show twice.
    const structuredDims = [
      profile.length_mm ? `${profile.length_mm}mm` : null,
      profile.width_mm  ? `${profile.width_mm}mm`  : null,
      profile.thickness_mm ? `${profile.thickness_mm}mm thick` : null,
    ].filter(Boolean).join(' · ')
    const specs = structuredDims || profile.dimensions || ''

    return (
      <tr style={{ borderBottom: '1px solid #e2e8f0', background: rowIndex % 2 === 0 ? '#ffffff' : '#f5f7f9' }}>
        <td style={{ padding: '8px 10px', fontSize: '13px', color: '#111827' }}>
          <a style={{ color: '#185D7A', fontWeight: 600, textDecoration: 'none' }}>{systemName} · {profile.profile_name}</a>
        </td>
        <td style={{ padding: '8px 10px', fontSize: '12px', color: '#6b7280' }}>
          {specs && <div>{specs}</div>}
          {profile.description && <div style={{ marginTop: specs ? '2px' : 0 }}>{profile.description}</div>}
          {!specs && !profile.description && '—'}
        </td>
        <td style={{ padding: '8px 10px', fontSize: '12px', color: '#4b5563', fontFamily: 'monospace' }}>{profile.product_code ?? '—'}</td>
        <td style={{ padding: '8px 10px', fontSize: '12px', color: '#6b7280' }}>{profile.uom ?? '—'}</td>
        <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button type="button" onClick={() => setEditing(true)}
            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#6b7280', cursor: 'pointer', marginRight: '4px' }}>
            Edit
          </button>
          <button type="button" title="Remove profile" onClick={() => setConfirmDelete(true)}
            style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}>
            Remove
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
    <td colSpan={5}>
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
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', gridColumn: '1 / -1' }}>
          Description
          <input value={desc} onChange={e => setDesc(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '2px', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' }} />
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
    </td>
    </tr>
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
        description: null,
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
  colour, systemId, manufacturerId, assets, onUpdated, onRemoved,
}: {
  colour: VerificationSystemColour
  systemId: string
  manufacturerId: string
  assets: ManufacturerAsset[]
  onUpdated: (id: string, data: Partial<VerificationSystemColour>) => void
  onRemoved: (id: string) => void
}) {
  const [editing, setEditing]   = useState(false)
  const [name,    setName]      = useState(colour.colour_name)
  const [suffix,  setSuffix]    = useState(colour.sku_suffix ?? '')
  const [imageUrl, setImageUrl] = useState(colour.image_url ?? '')
  const [pending, startTransition] = useTransition()
  const [err,     setErr]       = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [delPending, startDelTransition] = useTransition()
  const [delErr, setDelErr] = useState<string | null>(null)

  const swatchAssets = assets.filter(a => (a.assetType === 'product' || a.assetType === 'card_hero') && a.publicUrl)

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateColour(colour.id, systemId, manufacturerId, {
        colour_name: name.trim() || undefined,
        sku_suffix: suffix.trim() || null,
        image_url: imageUrl.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(colour.id, { colour_name: name.trim(), sku_suffix: suffix.trim() || null, image_url: imageUrl.trim() || null })
      setEditing(false)
    })
  }

  function handleDelete() {
    setDelErr(null)
    startDelTransition(async () => {
      const res = await removeColour(colour.id, systemId, manufacturerId)
      if (!res.ok) { setDelErr(res.error); return }
      onRemoved(colour.id)
    })
  }

  if (confirmDelete) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '99px', fontSize: '11px', color: '#991b1b' }}>
        Remove {colour.colour_name}?
        <button type="button" onClick={handleDelete} disabled={delPending}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: '11px', padding: 0 }}>
          {delPending ? '…' : 'Yes'}
        </button>
        <button type="button" onClick={() => setConfirmDelete(false)} disabled={delPending}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '11px', padding: 0 }}>
          No
        </button>
        {delErr && <span style={{ color: '#dc2626' }}>{delErr}</span>}
      </span>
    )
  }

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: colour.image_url ? '3px 8px 3px 3px' : '3px 8px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '99px', fontSize: '11px', color: '#374151' }}>
        {colour.image_url && (
          <span style={{ display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, background: `url(${colour.image_url}) center/cover`, border: '1px solid rgba(0,0,0,0.15)' }} />
        )}
        {colour.colour_name}
        {colour.sku_suffix && <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{colour.sku_suffix}</span>}
        <button type="button" title="Edit colour" onClick={() => setEditing(true)}
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0 2px', lineHeight: 1 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
        <button type="button" title="Remove colour" onClick={() => setConfirmDelete(true)}
          style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0 2px', lineHeight: 1 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
          </svg>
        </button>
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#eef6fa', border: '1.5px solid #185D7A', borderRadius: '8px', padding: '8px 10px', width: '260px' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Colour name"
          style={{ flex: 1, padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
        <input value={suffix} onChange={e => setSuffix(e.target.value)} placeholder="SKU suffix"
          style={{ width: '80px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'monospace' }} />
      </div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>
          Swatch photo
        </div>
        {swatchAssets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
            {swatchAssets.map(a => (
              <button key={a.id} type="button" title={a.title ?? 'Untitled asset'} onClick={() => setImageUrl(a.publicUrl ?? '')}
                style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
                  background: `url(${a.publicUrl}) center/cover`,
                  border: imageUrl === a.publicUrl ? '2px solid #185D7A' : '1px solid rgba(0,0,0,0.15)',
                }} />
            ))}
          </div>
        )}
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Or paste an image URL"
          style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit' }} />
      </div>
      {err && <span style={{ fontSize: '11px', color: '#dc2626' }}>{err}</span>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={handleSave} disabled={pending || !name.trim()}
          style={{ padding: '4px 10px', borderRadius: '5px', background: '#185D7A', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer', opacity: pending ? 0.5 : 1 }}>
          {pending ? '…' : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          style={{ padding: '4px 8px', borderRadius: '5px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
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
      onAdded({ id: res.id, colour_name: name.trim(), sku_suffix: suffix.trim() || null, image_url: null, is_stocked: true })
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

// Groups by category the same way SystemCardRenderer's ComponentsSection
// does, so the review grid's grouping matches what ships on the public card.
// First-appearance order, with any Service/delivery category pushed to the end.
function groupComponentsByCategory(
  components: VerificationSystemComponent[],
): [string, VerificationSystemComponent[]][] {
  const byCat = new Map<string, VerificationSystemComponent[]>()
  for (const c of components) {
    const cat = c.category?.trim() || 'Other'
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push(c)
  }
  // Within each category, respect sort_order when set; components without a
  // sort_order (never manually reordered) keep their original relative order.
  for (const items of Array.from(byCat.values())) {
    items.sort((a: VerificationSystemComponent, b: VerificationSystemComponent) => {
      if (a.sort_order == null && b.sort_order == null) return 0
      if (a.sort_order == null) return 1
      if (b.sort_order == null) return -1
      return a.sort_order - b.sort_order
    })
  }
  return Array.from(byCat.entries()).sort(
    (a, b) => (/service|delivery/i.test(a[0]) ? 1 : 0) - (/service|delivery/i.test(b[0]) ? 1 : 0)
  )
}

// ─── Component item ───────────────────────────────────────────────────────────

function ComponentItem({
  component, systemId, manufacturerId, onUpdated, onRemoved, onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  component: VerificationSystemComponent
  systemId: string
  manufacturerId: string
  onUpdated: (id: string, data: Partial<VerificationSystemComponent>) => void
  onRemoved: (id: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(component.name)
  const [sku,     setSku]     = useState(component.sku ?? '')
  const [desc,    setDesc]    = useState(component.description ?? '')
  const [uom,     setUom]     = useState(component.uom ?? '')
  const [pending, startTransition] = useTransition()
  const [routePending, startRouteTransition] = useTransition()
  const [err,     setErr]     = useState<string | null>(null)
  const [route,   setRoute]   = useState<'specialist_supplier' | 'trade_merchant' | null>(component.procurement_route)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [delPending, startDelTransition] = useTransition()
  const [delErr, setDelErr] = useState<string | null>(null)

  function handleDelete() {
    setDelErr(null)
    startDelTransition(async () => {
      const res = await unlinkComponent(component.id, systemId, manufacturerId)
      if (!res.ok) { setDelErr(res.error); return }
      onRemoved(component.id)
    })
  }

  function handleRouteChange(val: 'specialist_supplier' | 'trade_merchant' | null) {
    startRouteTransition(async () => {
      const res = await updateComponent(component.id, manufacturerId, { procurement_route: val })
      if (!res.ok) return
      setRoute(val)
      onUpdated(component.id, { procurement_route: val })
    })
  }

  function handleSave() {
    setErr(null)
    startTransition(async () => {
      const res = await updateComponent(component.id, manufacturerId, {
        name: name.trim() || undefined,
        sku: sku.trim() || null,
        description: desc.trim() || null,
        uom: uom.trim() || null,
      })
      if (!res.ok) { setErr(res.error); return }
      onUpdated(component.id, { name: name.trim(), sku: sku.trim() || null, description: desc.trim() || null, uom: uom.trim() || null })
      setEditing(false)
    })
  }

  const routeColors = {
    specialist_supplier: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
    trade_merchant:      { bg: '#f0fdf4', border: '#16a34a', text: '#15803d' },
  }

  if (!editing) {
    if (confirmDelete) {
      return (
        <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ color: '#991b1b' }}>
            Remove <strong>{component.name}</strong> from this system?
            <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 400, marginTop: '2px' }}>The component itself isn't deleted — it stays available to link to other systems.</div>
            {delErr && <div style={{ color: '#dc2626', marginTop: '2px' }}>{delErr}</div>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button type="button" onClick={handleDelete} disabled={delPending}
              style={{ padding: '4px 10px', borderRadius: '6px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: delPending ? 0.5 : 1 }}>
              {delPending ? 'Removing…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={delPending}
              style={{ padding: '4px 10px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '11px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )
    }
    return (
      <div style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', color: '#374151' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{component.name}</div>
            {component.description && <div style={{ color: '#6b7280', marginTop: '2px' }}>{component.description}</div>}
            {component.sku && <code style={{ fontSize: '11px', color: '#4b5563' }}>{component.sku}</code>}
            {component.uom && <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', marginLeft: component.sku ? '8px' : 0 }}>{component.uom}</span>}
          </div>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
            {(onMoveUp || onMoveDown) && (
              <>
                <button type="button" title="Move up" onClick={onMoveUp} disabled={!canMoveUp}
                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 6px', fontSize: '11px', color: '#6b7280', cursor: canMoveUp ? 'pointer' : 'default', opacity: canMoveUp ? 1 : 0.35 }}>
                  ↑
                </button>
                <button type="button" title="Move down" onClick={onMoveDown} disabled={!canMoveDown}
                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 6px', fontSize: '11px', color: '#6b7280', cursor: canMoveDown ? 'pointer' : 'default', opacity: canMoveDown ? 1 : 0.35 }}>
                  ↓
                </button>
              </>
            )}
            <button type="button" onClick={() => setEditing(true)}
              style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#6b7280', cursor: 'pointer' }}>
              Edit
            </button>
            <button type="button" title="Remove from this system" onClick={() => setConfirmDelete(true)}
              style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#dc2626', cursor: 'pointer' }}>
              Remove
            </button>
          </div>
        </div>
        {/* Procurement route toggle */}
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Route:</span>
          {(['specialist_supplier', 'trade_merchant'] as const).map(val => {
            const c = routeColors[val]
            const active = route === val
            return (
              <button key={val} type="button" disabled={routePending} onClick={() => handleRouteChange(active ? null : val)}
                style={{
                  padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s',
                  border: `1.5px solid ${active ? c.border : '#d1d5db'}`,
                  background: active ? c.bg : '#fff',
                  color: active ? c.text : '#9ca3af',
                }}>
                {val === 'specialist_supplier' ? 'Specialist' : 'Trade merchant'}
              </button>
            )
          })}
          {routePending && <span style={{ fontSize: '10px', color: '#9ca3af' }}>saving…</span>}
          {!route && !routePending && <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 600 }}>not set</span>}
        </div>
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
        <label style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
          UOM
          <input value={uom} onChange={e => setUom(e.target.value)} placeholder="e.g. EA, LM, SHEET"
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

// ─── Source document picker ────────────────────────────────────────────────────

type SourceDoc = { id: string; document_name: string; document_type: string | null; document_date: string | null }

function SourceDocumentPicker({
  systemId, manufacturerId, docId, onLinked,
}: {
  systemId: string
  manufacturerId: string
  docId: string | null
  onLinked: (newDocId: string | null) => void
}) {
  const [open, setOpen]           = useState(false)
  const [docs, setDocs]           = useState<SourceDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [linked, setLinked]       = useState(docId)
  const [linkedName, setLinkedName] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [err, setErr]             = useState<string | null>(null)

  function handleOpenPicker() {
    setOpen(true)
    if (docs.length === 0) {
      setDocsLoading(true)
      getManufacturerSourceDocuments(manufacturerId).then(res => {
        if (res.ok) {
          setDocs(res.documents)
          if (linked) {
            const found = res.documents.find(d => d.id === linked)
            if (found) setLinkedName(found.document_name)
          }
        }
        setDocsLoading(false)
      })
    }
  }

  function handleSelect(docId: string) {
    setErr(null)
    setSelectingId(docId)
    startTransition(async () => {
      const res = await linkSourceDocument(systemId, manufacturerId, docId)
      setSelectingId(null)
      if (!res.ok) { setErr(res.error); return }
      const docName = docs.find(d => d.id === docId)?.document_name ?? null
      setLinked(docId)
      setLinkedName(docName)
      onLinked(docId)
      setOpen(false)
    })
  }

  return (
    <div style={{ borderRadius: '8px', border: linked ? '1px solid #d1d5db' : '1.5px solid #f59e0b', background: linked ? '#f9fafb' : '#fffbeb', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        Source document
        {!linked && <span style={{ marginLeft: '6px', color: '#b45309', fontWeight: 700 }}>REQUIRED FOR PUBLISH</span>}
      </div>
      {linked ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#374151' }}>
            {linkedName ?? 'Document linked ✓'}
          </span>
          <button type="button" onClick={handleOpenPicker}
            style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#6b7280', cursor: 'pointer', flexShrink: 0 }}>
            Change
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#b45309' }}>No source document linked — required before publishing.</span>
          <button type="button" onClick={handleOpenPicker}
            style={{ padding: '4px 12px', borderRadius: '6px', background: '#d97706', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            Link document
          </button>
        </div>
      )}
      {open && (
        <div style={{ marginTop: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
          {docsLoading ? (
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>Loading documents…</div>
          ) : docs.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
              No documents uploaded yet — go to Documents to upload a catalogue first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
              {docs.map(doc => (
                <button key={doc.id} type="button" onClick={() => handleSelect(doc.id)} disabled={pending}
                  style={{
                    textAlign: 'left', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                    border: `1.5px solid ${linked === doc.id ? '#d97706' : '#e5e7eb'}`,
                    background: linked === doc.id ? '#fef3c7' : '#fff',
                    opacity: selectingId && selectingId !== doc.id ? 0.5 : 1,
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{doc.document_name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>
                    {[doc.document_type, doc.document_date].filter(Boolean).join(' · ')}
                  </div>
                </button>
              ))}
            </div>
          )}
          {err && <div style={{ marginTop: '6px', fontSize: '11px', color: '#dc2626' }}>{err}</div>}
          <button type="button" onClick={() => setOpen(false)}
            style={{ marginTop: '8px', padding: '4px 10px', borderRadius: '6px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', fontSize: '12px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Expanded card view (modal) ───────────────────────────────────────────────

function ExpandedCardView({
  system: initialSystem,
  manufacturerId,
  manufacturerName,
  assets,
  linkLibrary,
  onLibraryAdd,
  onClose,
  onStatusChange,
  onSystemFieldUpdate,
  onRemoved,
}: {
  system: VerificationSystem
  manufacturerId: string
  manufacturerName: string
  assets: ManufacturerAsset[]
  linkLibrary: LinkLibraryEntry[]
  onLibraryAdd: (entry: LinkLibraryEntry) => void
  onClose: () => void
  onStatusChange: (systemId: string, newStatus: string, reviewerNotes: string | null) => void
  onSystemFieldUpdate: (systemId: string, fieldName: string, value: string) => void
  onRemoved: (systemId: string) => void
}) {
  const [system, setSystem] = useState(initialSystem)
  const [fieldStates, setFieldStates]   = useState<FieldStateMap>({})
  const [initials,    setInitials]      = useState('')
  const [notes,       setNotes]         = useState(initialSystem.notes ?? '')
  const [notesSaving, setNotesSaving]   = useState(false)
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyMsg, setVerifyMsg]       = useState<string | null>(null)
  const [verifyErr, setVerifyErr]       = useState<string | null>(null)
  const [dangerConfirm, setDangerConfirm] = useState<'archive' | 'delete' | null>(null)
  const [dangerPending, startDangerTransition] = useTransition()
  const [dangerErr, setDangerErr]       = useState<string | null>(null)

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

  async function persistNotes(): Promise<{ ok: boolean; error?: string }> {
    if (notes === (initialSystem.notes ?? '')) return { ok: true }
    setNotesSaving(true)
    try {
      const res = await saveSystemNotes(system.id, manufacturerId, notes)
      if (!res.ok) return { ok: false, error: res.error }
      onSystemFieldUpdate(system.id, 'notes', notes)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to save notes.' }
    } finally {
      setNotesSaving(false)
    }
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

  function handleComeBackLater() {
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      const res = await persistNotes()
      if (!res.ok) { setVerifyErr(`Could not save notes: ${res.error ?? 'unknown error'}. Your notes have not been saved — copy them somewhere safe before leaving, or try again.`); return }
      setVerifyMsg('Notes saved ✓')
      setTimeout(() => onClose(), 900)
    })
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
  function removeProfileLocal(id: string) {
    setSystem(prev => ({ ...prev, profiles: prev.profiles.filter(p => p.id !== id) }))
  }
  function updateColourLocal(id: string, data: Partial<VerificationSystemColour>) {
    setSystem(prev => ({ ...prev, colours: prev.colours.map(c => c.id === id ? { ...c, ...data } : c) }))
  }
  function addColourLocal(colour: VerificationSystemColour) {
    setSystem(prev => ({ ...prev, colours: [...prev.colours, colour] }))
    setShowAddColour(false)
  }
  function removeColourLocal(id: string) {
    setSystem(prev => ({ ...prev, colours: prev.colours.filter(c => c.id !== id) }))
  }
  function updateComponentLocal(id: string, data: Partial<VerificationSystemComponent>) {
    setSystem(prev => ({ ...prev, components: prev.components.map(c => c.id === id ? { ...c, ...data } : c) }))
  }
  function addComponentLocal(component: VerificationSystemComponent) {
    setSystem(prev => ({ ...prev, components: [...prev.components, component] }))
    setShowAddComponent(false)
  }
  function removeComponentLocal(id: string) {
    setSystem(prev => ({ ...prev, components: prev.components.filter(c => c.id !== id) }))
  }
  // Swaps sort_order between two adjacent (within-category) components and
  // persists both — groupComponentsByCategory re-sorts by sort_order on render.
  function moveComponent(categoryItems: VerificationSystemComponent[], index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= categoryItems.length) return
    // Most components in a category have never been reordered, so their
    // sort_order is still null. Swapping only the two touched rows' values
    // isn't enough — null sorts after any real number in groupComponentsByCategory,
    // so the pair would jump to the front of the list instead of trading places.
    // Re-derive sort_order for the whole category from its current display
    // order first, then splice the move in, so every row ends up with a real,
    // consistent index and later moves behave the same way.
    const reordered = [...categoryItems]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    reordered.forEach((c, i) => {
      if (c.sort_order !== i) {
        updateComponentLocal(c.id, { sort_order: i })
        updateComponent(c.id, manufacturerId, { sort_order: i })
      }
    })
  }

  const [heroSaveErr, setHeroSaveErr] = useState<string | null>(null)
  const [cropX, setCropX] = useState(system.hero_image_position_x ?? 50)
  const [cropY, setCropY] = useState(system.hero_image_position_y ?? 50)
  const [cropZoom, setCropZoom] = useState(system.hero_image_zoom ?? 1)

  // Asset Library images offered for this system's hero — Card hero and
  // Product image types cover both a dedicated hero shot and a reused
  // product photo. Picking/uploading here also updates hero_image_url, so
  // the crop tool and live preview below stay in sync immediately.
  const heroPickerAssets: SlotAsset[] = assets.map(a => ({
    id: a.id,
    assetType: a.assetType,
    title: a.title,
    displayUrl: a.displayUrl,
    publicUrl: a.publicUrl,
    approvedForPublication: a.approvedForPublication,
  }))

  // The card preview and crop tool should reflect the linked asset, not
  // hero_image_url — that field may hold a presigned R2 link (set before the
  // publicUrl-only fix below) that has since expired, or be null when the
  // asset has no durable public URL. The asset's displayUrl is re-resolved
  // fresh on every page load, so it's always current.
  const linkedHeroAsset = system.hero_image_asset_id
    ? heroPickerAssets.find(a => a.id === system.hero_image_asset_id) ?? null
    : null
  const cropPreviewUrl = linkedHeroAsset?.displayUrl ?? linkedHeroAsset?.publicUrl ?? system.hero_image_url

  // Build SystemCardData
  const cardData: SystemCardData = {
    name:               system.name,
    manufacturer_name:  manufacturerName,
    category:           system.category,
    subcategory:        system.subcategory,
    description:        system.description,
    hero_image_url:     cropPreviewUrl,
    hero_image_position_x: cropX,
    hero_image_position_y: cropY,
    hero_image_zoom: cropZoom,
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
    tech_data_url:      system.tech_data_url,
    custom_document_links: system.custom_document_links ?? null,
    custom_technical_attributes: system.custom_technical_attributes ?? null,
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

  async function handleHeroAssetPick(pick: SlotPick) {
    // Only persist a durable public URL into hero_image_url — pick.displayUrl
    // can be a presigned R2 link that expires in an hour, and saving that would
    // leave a dead link once it lapses. The crop preview below reads the
    // linked asset's live displayUrl instead, so it stays correct regardless.
    // Always sync (not just when truthy) so a stale value from before this
    // asset was linked can't survive underneath it.
    const url = pick.publicUrl ?? null
    const previous = { hero_image_asset_id: system.hero_image_asset_id, hero_image_url: system.hero_image_url }
    setSystem(prev => ({ ...prev, hero_image_asset_id: pick.assetId, hero_image_url: url }))
    setHeroSaveErr(null)
    const res = await updateSystemHeroAsset(system.id, manufacturerId, pick.assetId, url)
    if (!res.ok) {
      // Roll back the optimistic update — otherwise the picker keeps showing
      // "Linked: X" even though the write never reached staged_systems, and
      // that false confidence is exactly what silently lost the pick before.
      setSystem(prev => ({ ...prev, ...previous }))
      setHeroSaveErr(res.error)
    }
  }

  function handleHeroAssetClear() {
    // Unlinks the asset only — leaves hero_image_url as a manual fallback
    // rather than clearing it, in case the raw URL is still wanted.
    const previous = { hero_image_asset_id: system.hero_image_asset_id }
    setSystem(prev => ({ ...prev, hero_image_asset_id: null }))
    setHeroSaveErr(null)
    updateSystemHeroAsset(system.id, manufacturerId, null, null).then(res => {
      if (!res.ok) {
        setSystem(prev => ({ ...prev, ...previous }))
        setHeroSaveErr(res.error)
      }
    })
  }

  return (
    <>
      {/* Responsive behaviour: below 900px the preview/editor split stacks
          vertically and the drag handle disappears; on phones the modal goes
          full-screen. !important beats the inline resize styles. */}
      <style>{`
        @media (max-width: 899px) {
          .vsplit { flex-direction: column; }
          .vsplit-left {
            flex: 0 0 auto !important;
            width: auto !important;
            max-width: none !important;
            max-height: 38vh;
            border-bottom: 1px solid #e5e7eb;
          }
          .vsplit-handle { display: none !important; }
        }
        @media (max-width: 640px) {
          .vmodal { inset: 0 !important; border-radius: 0 !important; }
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, backdropFilter: 'blur(2px)' }} />

      {/* Modal */}
      <div className="vmodal" style={{
        position: 'fixed', inset: '16px', zIndex: 10001,
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
          {isVerified && (
            <button onClick={handleReopen} disabled={verifyPending}
              style={{ padding: '4px 12px', borderRadius: '6px', border: '1.5px solid #6b7280', background: '#fff', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: verifyPending ? 'not-allowed' : 'pointer', opacity: verifyPending ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              Re-open for editing
            </button>
          )}
          {isVerified ? (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '20px' }}>Verified</span>
          ) : (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '20px' }}>
              {system.verification_status === 'in_review' ? 'In review' : 'Not started'}
            </span>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af', padding: '4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Body — two columns (resizable), stacks vertically below 900px */}
        <div className="vsplit" style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden' }}>
          {/* Left: system card preview */}
          <div className="vsplit-left" style={{ flex: `0 0 ${leftWidth}px`, minWidth: '280px', maxWidth: '680px', overflowY: 'auto', padding: '20px', background: '#f0f4f8' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Final card preview
            </div>
            <SystemCard data={cardData} />
          </div>

          {/* Drag handle */}
          <div
            className="vsplit-handle"
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

            {/* Verified banner — prominent CTA at top */}
            {isVerified && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                padding: '14px 16px', marginBottom: '20px',
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>System verified ✓</div>
                  <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>
                    Fields are locked. Click to reopen and make changes.
                  </div>
                </div>
                <button onClick={handleReopen} disabled={verifyPending}
                  style={{
                    padding: '8px 18px', borderRadius: '6px', border: '1.5px solid #374151',
                    background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 700,
                    cursor: verifyPending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                    opacity: verifyPending ? 0.5 : 1, flexShrink: 0,
                  }}>
                  Open to make changes
                </button>
              </div>
            )}

            <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
              Verify each field — tick if correct, edit if wrong, flag if unsure
            </div>

            {/* Product identity */}
            <FieldSection label="Product identity">
              <FieldRow {...fieldRowProps('System name', 'name')} />
              <FieldRow {...fieldRowProps('Category', 'category')} />
              {system.subcategory && <FieldRow {...fieldRowProps('Subcategory', 'subcategory')} />}
              {system.product_code && <FieldRow {...fieldRowProps('Product code', 'product_code')} />}
              <FieldRow {...fieldRowProps('Description', 'description')} multiline />
            </FieldSection>

            {/* Images & resources */}
            <FieldSection label="Images & resources">
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Hero image
                </div>
                <AssetSlotControl
                  manufacturerId={manufacturerId}
                  uploadAssetType="card_hero"
                  pickerAssetTypes={['card_hero', 'product']}
                  assets={heroPickerAssets}
                  currentAssetId={system.hero_image_asset_id}
                  onPick={handleHeroAssetPick}
                  onClear={handleHeroAssetClear}
                  quickImportUrl={system.hero_image_url}
                />
                {heroSaveErr && (
                  <p style={{ fontSize: '11px', color: '#dc2626', margin: '6px 0 0' }}>
                    Couldn't save this hero image: {heroSaveErr}. Try picking it again.
                  </p>
                )}
                {!system.hero_image_asset_id && system.hero_image_url && (
                  <p style={{ fontSize: '11px', color: '#b45309', margin: '6px 0 0' }}>
                    This hero image is only a URL — the static package will attempt a
                    best-effort fetch at generation time rather than a guaranteed local
                    copy. Upload or choose an asset above for a reliable, optimized result.
                  </p>
                )}
              </div>
              {/* Once an asset is linked, it's the single source of truth for the
                  hero image — no need to also maintain a matching raw URL. Only
                  show the manual URL field as a fallback when nothing is linked. */}
              {!system.hero_image_asset_id && (
                <FieldRow {...fieldRowProps('Hero image URL', 'hero_image_url', { isUrl: true })} />
              )}
              <CropAdjuster
                imageUrl={cropPreviewUrl}
                positionX={cropX}
                positionY={cropY}
                zoom={cropZoom}
                systemId={system.id}
                manufacturerId={manufacturerId}
                onChange={(x, y, zoom) => { setCropX(x); setCropY(y); setCropZoom(zoom) }}
              />
              {system.source_url   && <FieldRow {...fieldRowProps('Product page URL', 'source_url', { isUrl: true })} />}
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
              <CustomAttributesEditor
                attributes={Array.isArray(system.custom_technical_attributes) ? system.custom_technical_attributes : []}
                systemId={system.id}
                manufacturerId={manufacturerId}
                onUpdated={(attrs) => setSystem(prev => ({ ...prev, custom_technical_attributes: attrs.length > 0 ? attrs : null }))}
              />
            </FieldSection>

            {/* Profiles */}
            <FieldSection
              label={`Profiles (${system.profiles.length})`}
              action={<AddButton label="Add profile / variant" onClick={() => { setShowAddProfile(true); setShowAddColour(false); setShowAddComponent(false) }} />}
            >
              {system.profiles.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#185D7A' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#fff' }}>Product Name</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#fff' }}>Description / Spec</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#fff' }}>SKU</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#fff' }}>UOM</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#fff' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {system.profiles.map((p, i) => (
                      <ProfileItem key={p.id} profile={p} rowIndex={i} systemName={system.name} systemId={system.id} manufacturerId={manufacturerId} onUpdated={updateProfileLocal} onRemoved={removeProfileLocal} />
                    ))}
                  </tbody>
                </table>
              )}
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
                  <ColourItem key={c.id} colour={c} systemId={system.id} manufacturerId={manufacturerId} assets={assets} onUpdated={updateColourLocal} onRemoved={removeColourLocal} />
                ))}
              </div>
              {system.colours.length === 0 && !showAddColour && (
                <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>No colours recorded.</div>
              )}
              {showAddColour && (
                <AddColourForm systemId={system.id} manufacturerId={manufacturerId} onAdded={addColourLocal} onCancel={() => setShowAddColour(false)} />
              )}
            </FieldSection>

            {/* Components — grouped by category, same as the public card renderer
                (SystemCardRenderer's ComponentsSection), so a mixed list of
                fixings/cleaning products/screws reads as sections instead of
                one undifferentiated flat list. */}
            <FieldSection
              label={`Components & accessories (${system.components.length})`}
              action={<AddButton label="Add component / accessory" onClick={() => { setShowAddComponent(true); setShowAddProfile(false); setShowAddColour(false) }} />}
            >
              {groupComponentsByCategory(system.components).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: '4px' }}>
                  {items.length > 0 && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 0 6px' }}>
                      {cat}
                    </div>
                  )}
                  {items.map((c, i) => (
                    <ComponentItem
                      key={c.id} component={c} systemId={system.id} manufacturerId={manufacturerId}
                      onUpdated={updateComponentLocal} onRemoved={removeComponentLocal}
                      onMoveUp={() => moveComponent(items, i, -1)} onMoveDown={() => moveComponent(items, i, 1)}
                      canMoveUp={i > 0} canMoveDown={i < items.length - 1}
                    />
                  ))}
                </div>
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

            {/* Source document */}
            <FieldSection label="Source document">
              <SourceDocumentPicker
                systemId={system.id}
                manufacturerId={manufacturerId}
                docId={system.source_document_id}
                onLinked={(newDocId) => setSystem(prev => ({ ...prev, source_document_id: newDocId }))}
              />
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
                  disabled={verifyPending}
                  style={{
                    marginTop: '8px', width: '100%', padding: '8px', borderRadius: '6px',
                    background: verifyMsg ? '#f0fdf4' : '#fff',
                    color: verifyMsg ? '#16a34a' : '#6b7280',
                    border: `1.5px solid ${verifyMsg ? '#bbf7d0' : '#e2e8f0'}`,
                    fontSize: '13px', fontWeight: 600, cursor: verifyPending ? 'not-allowed' : 'pointer', textAlign: 'center',
                    opacity: verifyPending ? 0.6 : 1, transition: 'all 0.15s',
                  }}>
                  {verifyPending ? 'Saving…' : verifyMsg ? 'Saved ✓' : 'Save notes & come back later'}
                </button>
                {verifyMsg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>{verifyMsg}</div>}
                {verifyErr && <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{verifyErr}</div>}
              </div>
            )}

            {/* Danger zone */}
            <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px dashed #fecaca' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                Danger zone
              </div>
              {dangerConfirm === null && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button"
                    onClick={() => { setDangerErr(null); setDangerConfirm('archive') }}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #f87171', background: '#fff', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    Archive system
                  </button>
                  {!system.production_system_id && (
                    <button type="button"
                      onClick={() => { setDangerErr(null); setDangerConfirm('delete') }}
                      style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #f87171', background: '#fff', color: '#dc2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Delete system
                    </button>
                  )}
                </div>
              )}
              {dangerConfirm === 'archive' && (
                <div style={{ padding: '12px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Archive this system?</div>
                  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px' }}>
                    The system card will be hidden from your workspace.
                    {system.production_system_id && ' The live version on BuildQuote will NOT be affected.'}
                    {' '}Contact BuildQuote admin to restore it.
                  </div>
                  {dangerErr && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '8px' }}>{dangerErr}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" disabled={dangerPending}
                      onClick={() => {
                        setDangerErr(null)
                        startDangerTransition(async () => {
                          const res = await archiveSystem(system.id, manufacturerId)
                          if (!res.ok) { setDangerErr(res.error); return }
                          onRemoved(system.id)
                          onClose()
                        })
                      }}
                      style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: dangerPending ? 'not-allowed' : 'pointer', opacity: dangerPending ? 0.6 : 1 }}>
                      {dangerPending ? 'Archiving…' : 'Yes, archive it'}
                    </button>
                    <button type="button" disabled={dangerPending} onClick={() => setDangerConfirm(null)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {dangerConfirm === 'delete' && (
                <div style={{ padding: '12px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Permanently delete this system?</div>
                  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px' }}>
                    This will remove the system card and all its profiles, colours, and components from the staging database. This cannot be undone.
                  </div>
                  {dangerErr && <div style={{ fontSize: '11px', color: '#dc2626', marginBottom: '8px' }}>{dangerErr}</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" disabled={dangerPending}
                      onClick={() => {
                        setDangerErr(null)
                        startDangerTransition(async () => {
                          const res = await deleteSystem(system.id, manufacturerId)
                          if (!res.ok) { setDangerErr(res.error); return }
                          onRemoved(system.id)
                          onClose()
                        })
                      }}
                      style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#dc2626', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: dangerPending ? 'not-allowed' : 'pointer', opacity: dangerPending ? 0.6 : 1 }}>
                      {dangerPending ? 'Deleting…' : 'Yes, permanently delete'}
                    </button>
                    <button type="button" disabled={dangerPending} onClick={() => setDangerConfirm(null)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

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
  assets,
  linkLibrary: initialLinkLibrary,
}: {
  manufacturerId: string
  manufacturerName: string
  systems: VerificationSystem[]
  assets: ManufacturerAsset[]
  linkLibrary: LinkLibraryEntry[]
}) {
  const [systems,    setSystems]    = useState(initialSystems)
  const [linkLibrary, setLinkLibrary] = useState(initialLinkLibrary)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating,   startCreateTransition] = useTransition()
  const [createError, setCreateError] = useState<string | null>(null)

  function handleCreateSystem() {
    setCreateError(null)
    startCreateTransition(async () => {
      const res = await createBlankSystem(manufacturerId)
      if (!res.ok) { setCreateError(res.error); return }
      const blankSystem: VerificationSystem = {
        id: res.id,
        name: 'New system',
        slug: null,
        product_code: null,
        category: null,
        subcategory: null,
        description: null,
        hero_image_url: null,
        hero_image_asset_id: null,
        hero_image_position_x: null,
        hero_image_position_y: null,
        gallery_images: null,
        publish_status: null,
        published_version: null,
        hero_image_zoom: null,
        australian_made: null,
        bal_rating: null,
        fire_rating: null,
        acoustic_rating: null,
        moisture_resistant: null,
        structural_grade: null,
        website_url: null,
        source_url: null,
        source_document_id: null,
        install_guide_urls: null,
        design_guide_url: null,
        tech_data_url: null,
        custom_document_links: null,
        notes: null,
        verification_status: 'pending_review',
        reviewer_notes: null,
        verified_at: null,
        production_system_id: null,
        last_published_at: null,
        updated_at: new Date().toISOString(),
        last_submitted_at: null,
        profiles: [],
        components: [],
        colours: [],
      }
      setSystems(prev => [blankSystem, ...prev])
      setExpandedId(res.id)
    })
  }

  const expandedSystem = systems.find(s => s.id === expandedId) ?? null

  function handleStatusChange(systemId: string, newStatus: string, reviewerNotes: string | null) {
    setSystems(prev => prev.map(s =>
      s.id === systemId
        ? { ...s, verification_status: newStatus, reviewer_notes: reviewerNotes, updated_at: new Date().toISOString() }
        : s,
    ))
  }

  function handleSystemFieldUpdate(systemId: string, fieldName: string, value: string) {
    setSystems(prev => prev.map(s =>
      s.id === systemId ? { ...s, [fieldName]: value } : s,
    ))
  }

  function handleRemoved(systemId: string) {
    setSystems(prev => prev.filter(s => s.id !== systemId))
    setExpandedId(null)
  }

  const statusOrder = { pending_review: 0, in_review: 1, manufacturer_verified: 2 }
  const sorted = [...systems].sort((a, b) =>
    (statusOrder[a.verification_status as keyof typeof statusOrder] ?? 0) -
    (statusOrder[b.verification_status as keyof typeof statusOrder] ?? 0),
  )
  const unverified = sorted.filter(s => s.verification_status !== 'manufacturer_verified')
  const verified   = sorted.filter(s => s.verification_status === 'manufacturer_verified')

  const updateReadyCount = verified.filter(s =>
    !!s.production_system_id && !!s.last_published_at &&
    (!s.last_submitted_at || new Date(s.updated_at) > new Date(s.last_submitted_at))
  ).length
  const submittedCount = verified.filter(s => {
    if (!s.last_submitted_at) return false
    const updateReady = !!s.production_system_id && !!s.last_published_at &&
      new Date(s.updated_at) > new Date(s.last_submitted_at)
    if (updateReady) return false
    return (
      (!!s.production_system_id && !!s.last_published_at && new Date(s.last_submitted_at) > new Date(s.last_published_at!)) ||
      (!s.production_system_id)
    )
  }).length
  const liveCount = verified.filter(s => !!s.production_system_id && !!s.last_published_at).length

  function handleSubmitted() {
    const now = new Date().toISOString()
    setSystems(prev => prev.map(s =>
      s.verification_status === 'manufacturer_verified' ? { ...s, last_submitted_at: now } : s,
    ))
  }

  return (
    <>
      <style>{`
        .vgrid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 560px)  { .vgrid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 900px)  { .vgrid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1280px) { .vgrid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>

      {/* Create system button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        {createError && <span style={{ fontSize: '11px', color: '#dc2626' }}>{createError}</span>}
        <button
          type="button"
          onClick={handleCreateSystem}
          disabled={creating}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 16px', borderRadius: '8px',
            border: '1.5px solid #185D7A',
            background: '#fff', color: '#185D7A',
            fontSize: '13px', fontWeight: 700,
            cursor: creating ? 'default' : 'pointer',
            opacity: creating ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '-1px' }}>+</span>
          {creating ? 'Creating…' : 'Create a system'}
        </button>
      </div>

      {systems.length === 0 && (
        <div className="studio-info" style={{ marginTop: '8px' }}>
          No systems yet. Use the button above to create one, or ask BuildQuote admin to run the parser on your catalogue.
        </div>
      )}

      {unverified.length > 0 && (
        <div className="vgrid" style={{ marginBottom: verified.length > 0 ? '28px' : 0 }}>
          {unverified.map(system => (
            <SystemTile key={system.id} system={system} assets={assets} onClick={() => setExpandedId(system.id)} />
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
              <SystemTile key={system.id} system={system} assets={assets} onClick={() => setExpandedId(system.id)} />
            ))}
          </div>
        </>
      )}

      {expandedSystem && (
        <ExpandedCardView
          system={expandedSystem}
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          assets={assets}
          linkLibrary={linkLibrary}
          onLibraryAdd={(entry) => setLinkLibrary(prev => [entry, ...prev])}
          onClose={() => setExpandedId(null)}
          onStatusChange={handleStatusChange}
          onSystemFieldUpdate={handleSystemFieldUpdate}
          onRemoved={handleRemoved}
        />
      )}

      <SubmitForPublication
        manufacturerId={manufacturerId}
        verifiedCount={verified.length}
        totalCount={systems.length}
        liveCount={liveCount}
        updateReadyCount={updateReadyCount}
        onSubmitted={handleSubmitted}
      />
    </>
  )
}
