'use client'

// Self-contained Images manager right inside the Product Workspace — no trip
// to a separate Assets page needed. Drop or pick files to upload straight to
// R2 and add to the gallery, paste a direct image URL, click ★ on any photo
// to set it as the Hero image, click inside a thumbnail to set focal point,
// reorder with ◀/▶, or optionally pick from existing brand library assets.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SlotAsset } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'
import {
  requestAssetUploadUrl,
  processAndRecordAssetUpload,
} from '@/lib/studio-manufacturer/asset-actions'
import {
  updateSystemHeroAsset,
  setGalleryImages,
} from '@/lib/studio-manufacturer/verification-actions'

type GalleryImage = {
  asset_id?: string | null
  url: string
  og_jpg_url?: string | null
  alt: string
  caption?: string | null
  position_x?: number | null
  position_y?: number | null
}

const ACCEPTED_IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
])
const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,.gif,.avif'
const MAX_BYTES = 25 * 1024 * 1024
const MAX_PHOTOS = 10

function canonicalUrl(u: string | null | undefined): string {
  return (u ?? '').trim().split(/[?#]/)[0].toLowerCase()
}

function setFocalPoint(e: React.MouseEvent<HTMLDivElement>, onSet: (x: number, y: number) => void) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
  const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
  onSet(Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)))
}

export function ImagesSection({
  systemId,
  manufacturerId,
  heroAssetId,
  heroUrl,
  initialGallery,
  pickerAssets,
}: {
  systemId: string
  manufacturerId: string
  heroAssetId: string | null
  heroUrl: string | null
  initialGallery: GalleryImage[]
  pickerAssets: SlotAsset[]
}) {
  const router = useRouter()
  const [hero, setHero] = useState<{ assetId: string | null; url: string | null }>({
    assetId: heroAssetId,
    url: heroUrl,
  })
  const [gallery, setGallery] = useState<GalleryImage[]>(initialGallery)
  const [busyMsg, setBusyMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [pickingLibrary, setPickingLibrary] = useState(false)
  const [, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remaining = MAX_PHOTOS - gallery.length

  function saveGallery(next: GalleryImage[]) {
    setGallery(next)
    startTransition(async () => {
      const res = await setGalleryImages(systemId, manufacturerId, next)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function makeHero(img: GalleryImage) {
    const nextHero = { assetId: img.asset_id ?? null, url: img.url }
    setHero(nextHero)
    // Also move chosen hero to index 0 so the mosaic stays intuitive
    const idx = gallery.findIndex((g) => g.url === img.url)
    const reordered = idx > 0 ? [gallery[idx], ...gallery.filter((_, i) => i !== idx)] : gallery
    setGallery(reordered)
    startTransition(async () => {
      const [hRes, gRes] = await Promise.all([
        updateSystemHeroAsset(systemId, manufacturerId, nextHero.assetId, nextHero.url),
        setGalleryImages(systemId, manufacturerId, reordered),
      ])
      if (!hRes.ok) setError(hRes.error)
      else if (!gRes.ok) setError(gRes.error)
      else router.refresh()
    })
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return
    setError(null)
    if (remaining <= 0) {
      setError(`Maximum of ${MAX_PHOTOS} photos reached — remove one first.`)
      return
    }
    const toUpload = files.slice(0, remaining)
    const next = [...gallery]
    const errs: string[] = []

    for (const file of toUpload) {
      const mime = (file.type || '').split(';')[0]
      if (!ACCEPTED_IMAGE_MIME.has(mime)) { errs.push(`${file.name}: unsupported image type`); continue }
      if (file.size > MAX_BYTES) { errs.push(`${file.name}: exceeds 25 MB`); continue }

      setBusyMsg(`Uploading ${file.name}…`)
      try {
        const presign = await requestAssetUploadUrl({ manufacturerId, contentType: mime, fileSizeBytes: file.size })
        if (!presign.ok) { errs.push(`${file.name}: ${presign.error}`); continue }

        const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: file })
        if (!putRes.ok) { errs.push(`${file.name}: storage upload failed (${putRes.status})`); continue }

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
        if (!record.ok) { errs.push(`${file.name}: ${record.error}`); continue }

        next.push({
          asset_id: record.assetId,
          url: record.publicUrl ?? record.displayUrl ?? '',
          alt: title,
          position_x: 50,
          position_y: 50,
        })
      } catch (err) {
        errs.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setBusyMsg('')
    if (errs.length > 0) setError(errs.join(' · '))
    if (next.length !== gallery.length) {
      setGallery(next)
      const gRes = await setGalleryImages(systemId, manufacturerId, next)
      if (!gRes.ok) setError(gRes.error)
      // If no hero image yet, promote the first uploaded photo automatically
      if (!hero.url && next[0]) {
        setHero({ assetId: next[0].asset_id ?? null, url: next[0].url })
        await updateSystemHeroAsset(systemId, manufacturerId, next[0].asset_id ?? null, next[0].url)
      }
      router.refresh()
    }
  }

  function addByUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    try {
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol')
    } catch {
      setError('Enter a valid http(s) image URL.')
      return
    }
    if (remaining <= 0) {
      setError(`Maximum of ${MAX_PHOTOS} photos reached — remove one first.`)
      return
    }
    setError(null)
    const nextImg: GalleryImage = { asset_id: null, url: trimmed, alt: 'Product photo', position_x: 50, position_y: 50 }
    const next = [...gallery, nextImg]
    setUrlInput('')
    saveGallery(next)
    if (!hero.url) {
      setHero({ assetId: null, url: trimmed })
      startTransition(async () => {
        await updateSystemHeroAsset(systemId, manufacturerId, null, trimmed)
        router.refresh()
      })
    }
  }

  function addFromLibrary(asset: SlotAsset) {
    if (remaining <= 0) return
    const url = asset.publicUrl ?? asset.displayUrl ?? ''
    if (!url) return
    const next = [...gallery, { asset_id: asset.id, url, alt: asset.title ?? '', position_x: 50, position_y: 50 }]
    saveGallery(next)
    setPickingLibrary(false)
  }

  function removeFromGallery(i: number) {
    const removed = gallery[i]
    const next = gallery.filter((_, idx) => idx !== i)
    saveGallery(next)
    if (removed && canonicalUrl(removed.url) === canonicalUrl(hero.url)) {
      const replacement = next[0] ?? null
      setHero({ assetId: replacement?.asset_id ?? null, url: replacement?.url ?? null })
      startTransition(async () => {
        await updateSystemHeroAsset(systemId, manufacturerId, replacement?.asset_id ?? null, replacement?.url ?? null)
        router.refresh()
      })
    }
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= gallery.length) return
    const next = [...gallery]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveGallery(next)
  }

  function setGalleryPosition(i: number, x: number, y: number) {
    const next = [...gallery]
    next[i] = { ...next[i], position_x: x, position_y: y }
    saveGallery(next)
  }

  const heroCanon = canonicalUrl(hero.url)

  return (
    <div>
      {/* Direct drag-and-drop uploader — zero trips to Assets */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? '#185D7A' : 'var(--ds-border, #d1d5db)'}`,
          borderRadius: 9, padding: '0.85rem', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'rgba(24,93,122,0.06)' : '#f8fafc', marginBottom: '0.65rem',
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
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#185D7A' }}>
          {busyMsg || `Drop photos here or click to upload (${gallery.length}/${MAX_PHOTOS})`}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint, #9ca3af)', marginTop: 2 }}>
          PNG, JPG, WebP, GIF or AVIF — click ★ on any photo below to set it as the Hero image
        </div>
      </div>

      {/* Inline image URL input + optional brand asset library toggle */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByUrl() } }}
          placeholder="Or paste an image URL…"
          style={{
            flex: 1, minWidth: 180, padding: '6px 9px', borderRadius: 6,
            border: '1px solid var(--ds-border, #d1d5db)', fontSize: '0.78rem',
          }}
        />
        <button
          type="button"
          onClick={addByUrl}
          disabled={!urlInput.trim() || remaining <= 0}
          style={{
            fontSize: '0.76rem', fontWeight: 700, padding: '6px 11px', borderRadius: 6,
            border: 'none', background: !urlInput.trim() || remaining <= 0 ? '#cbd5e1' : '#185D7A',
            color: '#fff', cursor: !urlInput.trim() || remaining <= 0 ? 'default' : 'pointer',
          }}
        >
          Add URL
        </button>
        {pickerAssets.length > 0 && (
          <button
            type="button"
            onClick={() => setPickingLibrary((p) => !p)}
            style={{
              fontSize: '0.76rem', fontWeight: 600, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--ds-border, #d1d5db)', background: '#fff', cursor: 'pointer',
            }}
          >
            {pickingLibrary ? 'Hide library' : `Brand library (${pickerAssets.length})`}
          </button>
        )}
      </div>

      {pickingLibrary && pickerAssets.length > 0 && (
        <div style={{ marginBottom: '0.8rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.6rem', border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 8, background: '#f8fafc' }}>
          {pickerAssets.filter((a) => a.displayUrl).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => addFromLibrary(a)}
              title={`Add ${a.title ?? 'image'}`}
              style={{ width: 54, height: 54, borderRadius: 5, overflow: 'hidden', border: '1px solid var(--ds-border, #d1d5db)', padding: 0, cursor: 'pointer', background: '#fff' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.displayUrl ?? undefined} alt={a.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}

      {/* Unified gallery strip with ★ Hero toggle, focal point, reorder & delete */}
      {gallery.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {gallery.map((img, i) => {
            const isHero = heroCanon !== '' && canonicalUrl(img.url) === heroCanon
            return (
              <div key={`${img.url}-${i}`} style={{ width: 88, textAlign: 'center' }}>
                <div
                  onClick={(e) => setFocalPoint(e, (x, y) => setGalleryPosition(i, x, y))}
                  title="Click to set focal point"
                  style={{
                    width: 88, height: 88, borderRadius: 7, overflow: 'hidden',
                    border: isHero ? '2px solid #185D7A' : '1px solid var(--ds-border, #e5e7eb)',
                    background: '#f1f5f9', position: 'relative', cursor: 'crosshair',
                  }}
                >
                  {img.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img.asset_id ? `/api/assets/${img.asset_id}` : img.url}
                      alt={img.alt}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        objectPosition: `${img.position_x ?? 50}% ${img.position_y ?? 50}%`,
                      }}
                    />
                  )}
                  {isHero && (
                    <span style={{
                      position: 'absolute', top: 3, left: 3, fontSize: '0.62rem', fontWeight: 800,
                      background: '#185D7A', color: '#fff', padding: '1px 5px', borderRadius: 4, pointerEvents: 'none',
                    }}>
                      ★ HERO
                    </span>
                  )}
                  {(img.position_x != null || img.position_y != null) && (
                    <div style={{
                      position: 'absolute', left: `${img.position_x ?? 50}%`, top: `${img.position_y ?? 50}%`,
                      width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%',
                      background: '#185D7A', border: '1.5px solid #fff', pointerEvents: 'none',
                    }} />
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move left" style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}>◀</button>
                  <button type="button" onClick={() => makeHero(img)} title={isHero ? 'Current Hero image' : 'Set as Hero image'} style={{ fontSize: '0.78rem', background: 'none', border: 'none', cursor: 'pointer', color: isHero ? '#f59e0b' : '#94a3b8' }}>★</button>
                  <button type="button" onClick={() => removeFromGallery(i)} title="Remove photo" style={{ fontSize: '0.72rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === gallery.length - 1} title="Move right" style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: i === gallery.length - 1 ? 'default' : 'pointer', opacity: i === gallery.length - 1 ? 0.3 : 1 }}>▶</button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic' }}>
          No photos yet — drag &amp; drop product images above or paste an image URL.
        </div>
      )}

      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.5rem' }}>{error}</div>}
    </div>
  )
}
