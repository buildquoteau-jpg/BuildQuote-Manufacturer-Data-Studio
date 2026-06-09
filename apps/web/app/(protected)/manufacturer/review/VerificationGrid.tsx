'use client'

import { useState, useTransition, useCallback } from 'react'
import { SystemCard } from '@/components/system-card/SystemCard'
import type { SystemCardData } from '@/components/system-card/SystemCard'
import type { VerificationSystem } from '@/lib/studio-manufacturer/workspace'
import {
  upsertFieldVerification,
  clearFieldVerification,
  markSystemVerified,
  setSystemInReview,
  reopenSystem,
  type FieldVerificationStatus,
} from '@/lib/studio-manufacturer/verification-actions'

// ─── Category colours (matches showroom / mfp.buildquote.com.au) ──────────────

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

// ─── Per-field state ──────────────────────────────────────────────────────────

type FieldState = {
  status: 'approved' | 'edited' | 'flagged' | null
  verifiedValue: string | null
  notes: string | null
}

type FieldStateMap = Record<string, FieldState>

// ─── System tile ──────────────────────────────────────────────────────────────

function SystemTile({
  system,
  onClick,
}: {
  system: VerificationSystem
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const category = system.category ?? 'Unknown'
  const catStyle = CATEGORY_COLOURS[category] ?? { bg: '#f3f4f6', color: '#374151' }
  const profileCount = system.profiles.length

  const isVerified = system.verification_status === 'manufacturer_verified'
  const isInReview = system.verification_status === 'in_review'

  const statusLabel = isVerified
    ? 'Verified'
    : isInReview
    ? 'In review'
    : 'Not started'

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
        border: isVerified
          ? '1.5px solid #16a34a'
          : hovered
          ? '1.5px solid #185D7A'
          : '1px solid #d1d5db',
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        boxShadow: hovered ? '0 8px 28px rgba(24,93,122,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        opacity: isVerified ? 0.85 : 1,
      }}
    >
      {/* Hero */}
      <div style={{
        height: '160px', flexShrink: 0, position: 'relative',
        background: system.hero_image_url
          ? `url(${system.hero_image_url}) center/cover`
          : 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!system.hero_image_url && (
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
            {system.product_code ?? system.name}
          </span>
        )}
        {/* Category pill */}
        <span style={{
          position: 'absolute', top: '10px', left: '10px',
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: catStyle.bg, color: catStyle.color,
          padding: '3px 8px', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          {category}
        </span>
        {/* Verified badge */}
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

      {/* Content */}
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

      {/* Verification status bar */}
      <div style={{
        margin: '10px 14px 14px',
        padding: '6px 10px',
        background: statusBg,
        border: `1px solid ${statusBorder}`,
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: statusColor }}>
          {statusLabel}
        </span>
        <span style={{ fontSize: '11px', color: '#185D7A', fontWeight: 600 }}>
          {isVerified ? 'Re-open' : 'Open to verify'} →
        </span>
      </div>
    </button>
  )
}

// ─── Field row ────────────────────────────────────────────────────────────────

type FieldAction = 'approve' | 'edit' | 'flag' | null

function FieldRow({
  label,
  fieldName,
  currentValue,
  fieldState,
  systemId,
  manufacturerId,
  isBoolean,
  isUrl,
  onStateChange,
}: {
  label: string
  fieldName: string
  currentValue: string | null
  fieldState: FieldState | null
  systemId: string
  manufacturerId: string
  isBoolean?: boolean
  isUrl?: boolean
  onStateChange: (fieldName: string, state: FieldState | null) => void
}) {
  const statusToAction = (s: FieldVerificationStatus | null): FieldAction =>
    s === 'approved' ? 'approve' : s === 'edited' ? 'edit' : s === 'flagged' ? 'flag' : null
  const [activeAction, setActiveAction] = useState<FieldAction>(statusToAction(fieldState?.status ?? null))
  const [editValue, setEditValue]       = useState(fieldState?.verifiedValue ?? currentValue ?? '')
  const [flagNote,  setFlagNote]        = useState(fieldState?.notes ?? '')
  const [pending, startTransition]      = useTransition()
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)

  const status = fieldState?.status ?? null

  const statusColor = status === 'approved'
    ? '#16a34a'
    : status === 'edited'
    ? '#185D7A'
    : status === 'flagged'
    ? '#dc2626'
    : '#d1d5db'

  const statusBg = status === 'approved'
    ? '#f0fdf4'
    : status === 'edited'
    ? '#eef6fa'
    : status === 'flagged'
    ? '#fef2f2'
    : 'transparent'

  function handleApprove() {
    setErrorMsg(null)
    if (status === 'approved') {
      // Toggle off
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
      const res = await upsertFieldVerification(
        systemId, manufacturerId, fieldName,
        currentValue, currentValue, 'approved', null,
      )
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'approved', verifiedValue: currentValue, notes: null })
    })
  }

  function handleSaveEdit() {
    if (!editValue.trim()) return
    setErrorMsg(null)
    setActiveAction('edit')
    startTransition(async () => {
      const res = await upsertFieldVerification(
        systemId, manufacturerId, fieldName,
        currentValue, editValue.trim(), 'edited', null,
      )
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'edited', verifiedValue: editValue.trim(), notes: null })
    })
  }

  function handleSaveFlag() {
    setErrorMsg(null)
    setActiveAction('flag')
    startTransition(async () => {
      const res = await upsertFieldVerification(
        systemId, manufacturerId, fieldName,
        currentValue, null, 'flagged', flagNote.trim() || null,
      )
      if (!res.ok) { setErrorMsg(res.error); return }
      onStateChange(fieldName, { status: 'flagged', verifiedValue: null, notes: flagNote.trim() || null })
    })
  }

  const displayValue = status === 'edited'
    ? fieldState?.verifiedValue
    : currentValue

  return (
    <div style={{
      borderRadius: '8px',
      border: `1px solid ${statusColor}`,
      background: statusBg,
      padding: '10px 12px',
      transition: 'all 0.15s',
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            {label}
            {status === 'edited' && (
              <span style={{ marginLeft: '6px', color: '#185D7A', fontWeight: 700 }}>EDITED</span>
            )}
            {status === 'flagged' && (
              <span style={{ marginLeft: '6px', color: '#dc2626', fontWeight: 700 }}>FLAGGED</span>
            )}
          </div>
          {displayValue ? (
            isUrl ? (
              <div style={{ fontSize: '12px', color: '#185D7A', wordBreak: 'break-all', lineHeight: 1.4 }}>
                {displayValue}
              </div>
            ) : isBoolean ? (
              <div style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>
                {displayValue === 'true' || displayValue === '1' ? 'Yes' : 'No'}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.4 }}>
                {displayValue}
              </div>
            )
          ) : (
            <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
              Empty — paste value below to fill
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!pending && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            {/* Approve */}
            <button
              type="button"
              title={status === 'approved' ? 'Remove approval' : 'Mark as correct'}
              onClick={handleApprove}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'approved' ? '#16a34a' : '#d1d5db'}`,
                background: status === 'approved' ? '#16a34a' : '#fff',
                color: status === 'approved' ? '#fff' : '#6b7280',
                fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}
            >
              ✓
            </button>
            {/* Edit */}
            <button
              type="button"
              title="Edit value"
              onClick={() => setActiveAction(activeAction === 'edit' ? null : 'edit')}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'edited' || activeAction === 'edit' ? '#185D7A' : '#d1d5db'}`,
                background: status === 'edited' || activeAction === 'edit' ? '#eef6fa' : '#fff',
                color: status === 'edited' || activeAction === 'edit' ? '#185D7A' : '#6b7280',
                fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✏
            </button>
            {/* Flag */}
            <button
              type="button"
              title="Flag for review"
              onClick={() => setActiveAction(activeAction === 'flag' ? null : 'flag')}
              style={{
                width: 28, height: 28, borderRadius: '6px', cursor: 'pointer',
                border: `1.5px solid ${status === 'flagged' || activeAction === 'flag' ? '#dc2626' : '#d1d5db'}`,
                background: status === 'flagged' || activeAction === 'flag' ? '#fef2f2' : '#fff',
                color: status === 'flagged' || activeAction === 'flag' ? '#dc2626' : '#6b7280',
                fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ⚑
            </button>
          </div>
        )}
        {pending && (
          <span style={{ fontSize: '11px', color: '#9ca3af' }}>saving…</span>
        )}
      </div>

      {/* Edit input */}
      {activeAction === 'edit' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input
            type={isUrl ? 'url' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            placeholder={isUrl ? 'Paste URL here…' : `Enter correct ${label.toLowerCase()}…`}
            style={{
              flex: 1, padding: '6px 8px', border: '1.5px solid #185D7A',
              borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveEdit}
            disabled={pending || !editValue.trim()}
            style={{
              padding: '6px 12px', borderRadius: '6px',
              background: '#185D7A', color: '#fff',
              border: 'none', fontSize: '12px', fontWeight: 700,
              cursor: pending || !editValue.trim() ? 'not-allowed' : 'pointer',
              opacity: pending || !editValue.trim() ? 0.5 : 1,
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* Flag note */}
      {activeAction === 'flag' && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
          <input
            type="text"
            value={flagNote}
            onChange={e => setFlagNote(e.target.value)}
            placeholder="Describe what needs fixing…"
            style={{
              flex: 1, padding: '6px 8px', border: '1.5px solid #dc2626',
              borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleSaveFlag}
            disabled={pending}
            style={{
              padding: '6px 12px', borderRadius: '6px',
              background: '#dc2626', color: '#fff',
              border: 'none', fontSize: '12px', fontWeight: 700,
              cursor: pending ? 'not-allowed' : 'pointer',
              opacity: pending ? 0.5 : 1,
            }}
          >
            Flag
          </button>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#dc2626' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}

// ─── Field section heading ────────────────────────────────────────────────────

function FieldSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#334155',
        marginBottom: '8px', paddingBottom: '4px',
        borderBottom: '1px solid #e2e8f0',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Expanded card view (modal overlay) ──────────────────────────────────────

function ExpandedCardView({
  system,
  manufacturerId,
  manufacturerName,
  onClose,
  onStatusChange,
}: {
  system: VerificationSystem
  manufacturerId: string
  manufacturerName: string
  onClose: () => void
  onStatusChange: (systemId: string, newStatus: string, reviewerNotes: string | null) => void
}) {
  const [fieldStates, setFieldStates] = useState<FieldStateMap>({})
  const [initials,    setInitials]    = useState('')
  const [verifyPending, startVerifyTransition] = useTransition()
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)
  const [verifyErr, setVerifyErr] = useState<string | null>(null)

  const isVerified = system.verification_status === 'manufacturer_verified'

  // Mark system in_review when opened (if not already verified)
  useState(() => {
    if (system.verification_status === 'pending_review') {
      setSystemInReview(system.id, manufacturerId).catch(() => {})
    }
  })

  function handleFieldChange(fieldName: string, state: FieldState | null) {
    setFieldStates(prev => {
      if (state === null) {
        const next = { ...prev }
        delete next[fieldName]
        return next
      }
      return { ...prev, [fieldName]: state }
    })
  }

  function handleMarkVerified() {
    if (!initials.trim()) return
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      const res = await markSystemVerified(system.id, manufacturerId, initials.trim())
      if (!res.ok) { setVerifyErr(res.error); return }
      const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' })
      const note = `Verified by ${initials.trim().toUpperCase()} on ${dateStr}`
      setVerifyMsg('Marked as verified!')
      onStatusChange(system.id, 'manufacturer_verified', note)
      setTimeout(() => onClose(), 1200)
    })
  }

  function handleReopen() {
    setVerifyErr(null); setVerifyMsg(null)
    startVerifyTransition(async () => {
      const res = await reopenSystem(system.id, manufacturerId)
      if (!res.ok) { setVerifyErr(res.error); return }
      onStatusChange(system.id, 'in_review', null)
    })
  }

  // Build SystemCardData for rendering
  const cardData: SystemCardData = {
    name:               system.name,
    manufacturer_name:  manufacturerName,
    category:           system.category,
    subcategory:        system.subcategory,
    description:        system.description,
    hero_image_url:     system.hero_image_url,
    bal_rating:         system.bal_rating,
    fire_rating:        system.fire_rating,
    moisture_resistant: system.moisture_resistant,
    acoustic_rating:    system.acoustic_rating,
    structural_grade:   system.structural_grade,
    australian_made:    system.australian_made,
    notes:              system.notes,
    source_url:         system.source_url,
    profiles: system.profiles.map(p => ({
      product_code:       p.product_code,
      profile_name:       p.profile_name,
      dimensions:         p.dimensions,
      length_mm:          p.length_mm,
      height_mm:          p.height_mm,
      width_mm:           p.width_mm,
      thickness_mm:       p.thickness_mm,
      uom:                p.uom,
      supplier_pack_qty:  p.supplier_pack_qty,
      supplier_pack_uom:  p.supplier_pack_uom,
      sort_order:         p.sort_order,
    })),
    components: system.components.map(c => ({
      sku:               c.sku,
      name:              c.name,
      description:       c.description,
      category:          c.category,
      uom:               c.uom,
      supplier_pack_qty: c.supplier_pack_qty,
      supplier_pack_uom: c.supplier_pack_uom,
      sort_order:        c.sort_order,
    })),
    colours: system.colours.map(c => ({
      colour_name: c.colour_name,
      sku_suffix:  c.sku_suffix,
      is_stocked:  c.is_stocked,
    })),
  }

  const fieldRowProps = (label: string, fieldName: string, opts?: { isBoolean?: boolean; isUrl?: boolean }) => ({
    label,
    fieldName,
    currentValue: String((system as any)[fieldName] ?? '') || null,
    fieldState: fieldStates[fieldName] ?? null,
    systemId: system.id,
    manufacturerId,
    isBoolean: opts?.isBoolean,
    isUrl: opts?.isUrl,
    onStateChange: handleFieldChange,
  })

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 100, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: '16px', zIndex: 101,
        background: '#f8fafc', borderRadius: '16px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 20px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid #d1d5db', borderRadius: '8px',
              padding: '4px 12px', fontSize: '13px', cursor: 'pointer', color: '#374151',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            ← Back
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
              {system.name}
            </div>
            {system.category && (
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{system.category}</div>
            )}
          </div>
          {isVerified ? (
            <span style={{
              fontSize: '12px', fontWeight: 700, color: '#16a34a',
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              padding: '4px 10px', borderRadius: '20px',
            }}>
              Verified
            </span>
          ) : (
            <span style={{
              fontSize: '12px', fontWeight: 700, color: '#d97706',
              background: '#fffbeb', border: '1px solid #fde68a',
              padding: '4px 10px', borderRadius: '20px',
            }}>
              {system.verification_status === 'in_review' ? 'In review' : 'Not started'}
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '20px', color: '#9ca3af', padding: '4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Modal body — two columns */}
        <div style={{
          flex: 1, display: 'flex', gap: 0, overflow: 'hidden',
        }}>
          {/* Left: system card render */}
          <div style={{
            flex: '0 0 420px', minWidth: 0, overflowY: 'auto',
            padding: '20px', background: '#f0f4f8',
            borderRight: '1px solid #e5e7eb',
          }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: '12px',
            }}>
              Final card preview
            </div>
            <SystemCard data={cardData} />
          </div>

          {/* Right: field editor */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '20px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, color: '#6b7280',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: '16px',
            }}>
              Verify each field — tick if correct, edit if wrong, flag if unsure
            </div>

            {/* Core identity */}
            <FieldSection label="Product identity">
              <FieldRow {...fieldRowProps('System name', 'name')} />
              <FieldRow {...fieldRowProps('Category', 'category')} />
              {system.subcategory && <FieldRow {...fieldRowProps('Subcategory', 'subcategory')} />}
              {system.product_code && <FieldRow {...fieldRowProps('Product code', 'product_code')} />}
              <FieldRow {...fieldRowProps('Description', 'description')} />
            </FieldSection>

            {/* Image & URLs */}
            <FieldSection label="Images & resources">
              <FieldRow {...fieldRowProps('Hero image URL', 'hero_image_url', { isUrl: true })} />
              {(system.website_url ?? system.source_url ?? system.install_guide_url ?? system.tech_data_url) && (
                <>
                  {system.website_url     && <FieldRow {...fieldRowProps('Manufacturer website', 'website_url', { isUrl: true })} />}
                  {system.source_url      && <FieldRow {...fieldRowProps('Product page URL', 'source_url', { isUrl: true })} />}
                  {system.install_guide_url && <FieldRow {...fieldRowProps('Install guide URL', 'install_guide_url', { isUrl: true })} />}
                  {system.tech_data_url   && <FieldRow {...fieldRowProps('Technical data URL', 'tech_data_url', { isUrl: true })} />}
                </>
              )}
              {/* Empty URL fields — allow inserting */}
              {!system.install_guide_url && (
                <FieldRow
                  label="Install guide URL"
                  fieldName="install_guide_url"
                  currentValue={null}
                  fieldState={fieldStates['install_guide_url'] ?? null}
                  systemId={system.id}
                  manufacturerId={manufacturerId}
                  isUrl
                  onStateChange={handleFieldChange}
                />
              )}
              {!system.tech_data_url && (
                <FieldRow
                  label="Technical data URL"
                  fieldName="tech_data_url"
                  currentValue={null}
                  fieldState={fieldStates['tech_data_url'] ?? null}
                  systemId={system.id}
                  manufacturerId={manufacturerId}
                  isUrl
                  onStateChange={handleFieldChange}
                />
              )}
            </FieldSection>

            {/* Technical attributes */}
            <FieldSection label="Technical attributes">
              <FieldRow {...fieldRowProps('Australian made', 'australian_made', { isBoolean: true })} />
              <FieldRow {...fieldRowProps('Moisture resistant', 'moisture_resistant', { isBoolean: true })} />
              {system.bal_rating      && <FieldRow {...fieldRowProps('BAL rating', 'bal_rating')} />}
              {system.fire_rating     && <FieldRow {...fieldRowProps('Fire rating (FRL)', 'fire_rating')} />}
              {system.acoustic_rating && <FieldRow {...fieldRowProps('Acoustic rating', 'acoustic_rating')} />}
              {system.structural_grade && <FieldRow {...fieldRowProps('Structural grade', 'structural_grade')} />}
            </FieldSection>

            {/* Profiles */}
            {system.profiles.length > 0 && (
              <FieldSection label={`Profiles (${system.profiles.length})`}>
                {system.profiles.map((p, i) => (
                  <div key={p.id} style={{
                    padding: '8px 10px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px', color: '#374151',
                  }}>
                    <div style={{ fontWeight: 600 }}>{p.profile_name}</div>
                    <div style={{ color: '#6b7280', marginTop: '2px' }}>
                      {[p.product_code, p.dimensions,
                        p.length_mm ? `${p.length_mm}mm` : null,
                        p.width_mm  ? `${p.width_mm}mm` : null,
                        p.thickness_mm ? `${p.thickness_mm}mm thick` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                  Profile editing coming soon. Flag this section if profiles are incorrect.
                </div>
              </FieldSection>
            )}

            {/* Colours */}
            {system.colours.length > 0 && (
              <FieldSection label={`Colours & finishes (${system.colours.length})`}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {system.colours.map((c, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 8px', background: '#f8fafc',
                      border: '1px solid #e5e7eb', borderRadius: '99px',
                      fontSize: '11px', color: '#374151',
                    }}>
                      {c.colour_name}
                      {c.sku_suffix && <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{c.sku_suffix}</span>}
                    </span>
                  ))}
                </div>
              </FieldSection>
            )}

            {/* Components */}
            {system.components.length > 0 && (
              <FieldSection label={`Components & accessories (${system.components.length})`}>
                {system.components.map((c, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px', color: '#374151',
                  }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    {c.description && <div style={{ color: '#6b7280', marginTop: '2px' }}>{c.description}</div>}
                    {c.sku && <code style={{ fontSize: '11px', color: '#4b5563' }}>{c.sku}</code>}
                  </div>
                ))}
              </FieldSection>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: '#e2e8f0', margin: '20px 0' }} />

            {/* Mark as verified / reopen */}
            {isVerified ? (
              <div style={{
                padding: '16px', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: '10px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', marginBottom: '6px' }}>
                  This system is verified
                </div>
                {system.reviewer_notes && (
                  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px' }}>
                    {system.reviewer_notes}
                  </div>
                )}
                <button
                  onClick={handleReopen}
                  disabled={verifyPending}
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    border: '1.5px solid #6b7280', background: '#fff',
                    color: '#6b7280', fontSize: '12px', fontWeight: 600,
                    cursor: verifyPending ? 'not-allowed' : 'pointer',
                    opacity: verifyPending ? 0.5 : 1,
                  }}
                >
                  Re-open for editing
                </button>
                {verifyErr && <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626' }}>{verifyErr}</div>}
              </div>
            ) : (
              <div style={{
                padding: '16px', background: '#fff',
                border: '1.5px solid #185D7A', borderRadius: '10px',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                  Mark as verified
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Once you have checked every field above and are satisfied the card is correct, enter your initials and mark it as verified.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={initials}
                    onChange={e => setInitials(e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="Initials"
                    maxLength={5}
                    style={{
                      width: '80px', padding: '8px 10px',
                      border: '1.5px solid #185D7A', borderRadius: '6px',
                      fontSize: '14px', fontWeight: 700, textAlign: 'center',
                      textTransform: 'uppercase', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={handleMarkVerified}
                    disabled={verifyPending || !initials.trim()}
                    style={{
                      flex: 1, padding: '8px 16px', borderRadius: '6px',
                      background: verifyPending || !initials.trim() ? '#9ca3af' : '#16a34a',
                      color: '#fff', border: 'none',
                      fontSize: '13px', fontWeight: 700,
                      cursor: verifyPending || !initials.trim() ? 'not-allowed' : 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    {verifyPending ? 'Saving…' : 'Verified — ready for BuildQuote review'}
                  </button>
                </div>
                {verifyMsg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>{verifyMsg}</div>}
                {verifyErr && <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{verifyErr}</div>}
              </div>
            )}

            {/* Bottom spacer */}
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
  const [systems, setSystems] = useState(initialSystems)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const expandedSystem = systems.find(s => s.id === expandedId) ?? null

  function handleStatusChange(systemId: string, newStatus: string, reviewerNotes: string | null) {
    setSystems(prev => prev.map(s =>
      s.id === systemId
        ? { ...s, verification_status: newStatus, reviewer_notes: reviewerNotes }
        : s,
    ))
  }

  // Sort: pending first, in_review next, verified last
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
        @media (min-width: 900px) { .vgrid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1280px) { .vgrid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>

      {/* Unverified / in-review */}
      {unverified.length > 0 && (
        <div className="vgrid" style={{ marginBottom: verified.length > 0 ? '28px' : 0 }}>
          {unverified.map(system => (
            <SystemTile
              key={system.id}
              system={system}
              onClick={() => setExpandedId(system.id)}
            />
          ))}
        </div>
      )}

      {/* Verified section */}
      {verified.length > 0 && (
        <>
          {unverified.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              marginBottom: '16px',
            }}>
              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
              <span style={{
                fontSize: '11px', fontWeight: 700, color: '#16a34a',
                textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
              }}>
                {verified.length} verified
              </span>
              <div style={{ flex: 1, height: 1, background: '#bbf7d0' }} />
            </div>
          )}
          <div className="vgrid">
            {verified.map(system => (
              <SystemTile
                key={system.id}
                system={system}
                onClick={() => setExpandedId(system.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Expanded modal */}
      {expandedSystem && (
        <ExpandedCardView
          system={expandedSystem}
          manufacturerId={manufacturerId}
          manufacturerName={manufacturerName}
          onClose={() => setExpandedId(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  )
}
