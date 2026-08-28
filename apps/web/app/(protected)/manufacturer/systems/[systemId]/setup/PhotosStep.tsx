'use client'

// Step 1 of the guided setup flow (design doc addendum 3 §C5 step 1) — up to
// 10 photos, uploaded directly (not picked from the flat asset pool), each
// one scoped to this system from the moment it's uploaded
// (manufacturer_assets.staged_system_id / asset_role='gallery' — migration
// 065). Deliberately simple: add/remove only. Reordering and focal-point
// crop already exist in the richer Images section of the Verify-systems
// Workspace — this step's job is just getting the photos in quickly.

import { useRef, useState } from 'react'
import {
  requestAssetUploadUrl,
  processAndRecordAssetUpload,
} from '@/lib/studio-manufacturer/asset-actions'
import { setGalleryImages } from '@/lib/studio-manufacturer/verification-actions'

export type GalleryPhoto = { asset_id?: string | null; url: string; alt: string }

const ACCEPTED_IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
])
const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,.gif,.avif'
const MAX_BYTES = 25 * 1024 * 1024
const MAX_PHOTOS = 10

export function PhotosStep({
  systemId,
  manufacturerId,
  initialGallery,
  onChanged,
}: {
  systemId: string
  manufacturerId: string
  initialGallery: GalleryPhoto[]
  onChanged?: (count: number) => void
}) {
  const [gallery, setGallery] = useState<GalleryPhoto[]>(initialGallery)
  const [busyMsg, setBusyMsg] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remaining = MAX_PHOTOS - gallery.length

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return
    setError('')
    const toUpload = files.slice(0, remaining)
    if (files.length > toUpload.length) {
      setError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} can be added (10 max) — ${files.length - toUpload.length} skipped.`)
    }

    const next = [...gallery]
    const errors: string[] = []

    for (const file of toUpload) {
      const mime = (file.type || '').split(';')[0]
      if (!ACCEPTED_IMAGE_MIME.has(mime)) { errors.push(`${file.name}: not a supported image type`); continue }
      if (file.size > MAX_BYTES) { errors.push(`${file.name}: exceeds 25 MB`); continue }

      setBusyMsg(`Uploading ${file.name}…`)
      try {
        const presign = await requestAssetUploadUrl({ manufacturerId, contentType: mime, fileSizeBytes: file.size })
        if (!presign.ok) { errors.push(`${file.name}: ${presign.error}`); continue }

        const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: file })
        if (!putRes.ok) { errors.push(`${file.name}: storage upload failed (${putRes.status})`); continue }

        const title = file.name.replace(/\.[a-z0-9]+$/i, '')
        const record = await processAndRecordAssetUpload({
          manufacturerId,
          assetType: 'product',
          storageKey: presign.storageKey,
          contentType: mime,
          title,
          altText: title,
          stagedSystemId: systemId,
          assetRole: 'gallery',
        })
        if (!record.ok) { errors.push(`${file.name}: ${record.error}`); continue }

        next.push({ asset_id: record.assetId, url: record.publicUrl ?? record.displayUrl ?? '', alt: title })
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setBusyMsg('')
    if (errors.length) setError((prev) => [prev, errors.join(' · ')].filter(Boolean).join(' · '))

    if (next.length !== gallery.length) {
      const res = await setGalleryImages(systemId, manufacturerId, next)
      if (!res.ok) {
        setError((prev) => [prev, res.error].filter(Boolean).join(' · '))
        return
      }
      setGallery(next)
      onChanged?.(next.length)
    }
  }

  function remove(i: number) {
    const next = gallery.filter((_, j) => j !== i)
    setGallery(next)
    onChanged?.(next.length)
    setGalleryImages(systemId, manufacturerId, next).then((res) => {
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 0.7rem', lineHeight: 1.55 }}>
        Upload your best {MAX_PHOTOS} photos of this system — product shots, in-situ installs, close-ups of finishes.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          uploadFiles(Array.from(e.dataTransfer.files))
        }}
        onClick={() => remaining > 0 && fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? '#185D7A' : 'var(--ds-border)'}`,
          borderRadius: 10, padding: '1.1rem', textAlign: 'center',
          cursor: remaining > 0 ? 'pointer' : 'default',
          opacity: remaining > 0 ? 1 : 0.5,
          background: dragging ? 'rgba(24,93,122,0.05)' : 'transparent',
          marginBottom: '0.8rem',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          {remaining > 0 ? `Drop photos here, or click to choose (${remaining} more)` : `${MAX_PHOTOS} photos added — that's the max`}
        </div>
      </div>

      {busyMsg && <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginBottom: '0.6rem' }}>{busyMsg}</div>}
      {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginBottom: '0.6rem' }}>{error}</div>}

      {gallery.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem' }}>
          {gallery.map((g, i) => (
            <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1 / 1', background: '#f1f5f9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt={g.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => remove(i)}
                style={{
                  position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                  border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.75rem',
                  cursor: 'pointer', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
