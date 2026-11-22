'use client'

// Compact inline image picker for individual board profiles and components/accessories.
// Lets manufacturers upload a photo straight to R2 (no trip to Assets) OR paste an image URL,
// saving a durable URL onto staged_system_profiles.image_url or staged_components.image_url.

import { useRef, useState } from 'react'
import {
  requestAssetUploadUrl,
  processAndRecordAssetUpload,
} from '@/lib/studio-manufacturer/asset-actions'

const ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
])
const MAX_BYTES = 15 * 1024 * 1024

export function InlineItemImagePicker({
  manufacturerId,
  systemId,
  label,
  value,
  onSave,
}: {
  manufacturerId: string
  systemId: string
  label: string
  value: string | null | undefined
  onSave: (url: string | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleFile(file: File) {
    setErr(null)
    const mime = (file.type || '').split(';')[0]
    if (!ACCEPTED_MIME.has(mime)) {
      setErr('Use PNG, JPG, WebP, GIF or AVIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      setErr('Image must be under 15 MB.')
      return
    }
    setBusy(true)
    try {
      const presign = await requestAssetUploadUrl({
        manufacturerId,
        contentType: mime,
        fileSizeBytes: file.size,
      })
      if (!presign.ok) { setErr(presign.error); return }

      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      })
      if (!put.ok) { setErr(`Upload failed (${put.status}).`); return }

      const record = await processAndRecordAssetUpload({
        manufacturerId,
        assetType: 'product',
        storageKey: presign.storageKey,
        contentType: mime,
        title: label || file.name.replace(/\.[a-z0-9]+$/i, ''),
        altText: label || null,
        stagedSystemId: systemId,
        assetRole: 'product',
      })
      if (!record.ok) { setErr(record.error); return }

      const durableUrl = record.publicUrl || `${window.location.origin}/api/assets/${record.assetId}`
      onSave(durableUrl)
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function applyUrl() {
    const trimmed = urlInput.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      setErr('Enter a valid http(s) image URL.')
      return
    }
    setErr(null)
    onSave(trimmed)
    setUrlInput('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.avif"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        title={value ? 'Change photo' : 'Add photo'}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          width: 42,
          height: 42,
          borderRadius: 6,
          border: value ? '1px solid var(--ds-border, #d1d5db)' : '1.5px dashed var(--ds-border, #cbd5e1)',
          background: value ? '#f8fafc' : 'transparent',
          padding: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#185D7A',
        }}
      >
        {busy ? '…' : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : '+ Pic'}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 46,
            left: 0,
            zIndex: 40,
            width: 240,
            padding: '0.6rem',
            borderRadius: 8,
            border: '1px solid var(--ds-border, #cbd5e1)',
            background: '#fff',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.45rem' }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              style={{
                flex: 1, fontSize: '0.74rem', fontWeight: 700, padding: '0.35rem 0.5rem',
                borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', cursor: 'pointer',
              }}
            >
              {busy ? 'Uploading…' : 'Upload file'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onSave(null); setOpen(false) }}
                style={{
                  fontSize: '0.72rem', fontWeight: 600, padding: '0.35rem 0.5rem',
                  borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyUrl() } }}
              placeholder="Or paste image URL…"
              style={{
                flex: 1, minWidth: 0, padding: '0.3rem 0.45rem', fontSize: '0.74rem',
                border: '1px solid #d1d5db', borderRadius: 5,
              }}
            />
            <button
              type="button"
              onClick={applyUrl}
              disabled={!urlInput.trim()}
              style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.5rem',
                borderRadius: 5, border: '1px solid #185D7A', background: '#fff', color: '#185D7A', cursor: 'pointer',
              }}
            >
              Use
            </button>
          </div>
          {err && <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.35rem' }}>{err}</div>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: '0.4rem', fontSize: '0.7rem', color: '#64748b',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}
