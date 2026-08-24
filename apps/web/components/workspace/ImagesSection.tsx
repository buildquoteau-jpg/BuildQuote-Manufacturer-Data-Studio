'use client'

// Images — design doc §7.3 "drop a file onto a slot to upload+link+crop".
// Hero reuses AssetSlotControl exactly as CmsEditor does (upload/import/pick
// in one control, no trip to a separate Asset upload page). Gallery is a
// reorderable strip with an inline "add from library" grid — full drag-and-
// drop reordering and in-place crop are a follow-up; add/remove/reorder and
// hero linking are real today.

import { useState, useTransition } from 'react'
import { AssetSlotControl, type SlotAsset, type SlotPick } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'
import { updateSystemHeroAsset, setGalleryImages } from '@/lib/studio-manufacturer/verification-actions'

type GalleryImage = { asset_id?: string | null; url: string; og_jpg_url?: string | null; alt: string; caption?: string | null }

export function ImagesSection({
  systemId, manufacturerId, heroAssetId, heroUrl, initialGallery, pickerAssets,
}: {
  systemId: string
  manufacturerId: string
  heroAssetId: string | null
  heroUrl: string | null
  initialGallery: GalleryImage[]
  pickerAssets: SlotAsset[]
}) {
  const [hero, setHero] = useState<{ assetId: string | null; url: string | null }>({ assetId: heroAssetId, url: heroUrl })
  const [gallery, setGallery] = useState<GalleryImage[]>(initialGallery)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  function saveGallery(next: GalleryImage[]) {
    setGallery(next)
    startTransition(async () => {
      const res = await setGalleryImages(systemId, manufacturerId, next)
      if (!res.ok) setError(res.error)
    })
  }

  function pickHero(pick: SlotPick) {
    setHero({ assetId: pick.assetId, url: pick.publicUrl })
    startTransition(async () => {
      const res = await updateSystemHeroAsset(systemId, manufacturerId, pick.assetId, pick.publicUrl)
      if (!res.ok) setError(res.error)
    })
  }

  function clearHero() {
    setHero({ assetId: null, url: null })
    startTransition(async () => {
      const res = await updateSystemHeroAsset(systemId, manufacturerId, null, null)
      if (!res.ok) setError(res.error)
    })
  }

  function addToGallery(asset: SlotAsset) {
    saveGallery([...gallery, { asset_id: asset.id, url: asset.publicUrl ?? asset.displayUrl ?? '', alt: asset.title ?? '' }])
    setPicking(false)
  }

  function removeFromGallery(i: number) {
    saveGallery(gallery.filter((_, idx) => idx !== i))
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= gallery.length) return
    const next = [...gallery]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveGallery(next)
  }

  return (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ds-text-muted, #6b7280)', marginBottom: '0.4rem' }}>Hero image</div>
      <AssetSlotControl
        manufacturerId={manufacturerId}
        uploadAssetType="card_hero"
        pickerAssetTypes={['card_hero', 'product']}
        assets={pickerAssets}
        currentAssetId={hero.assetId}
        onPick={pickHero}
        onClear={clearHero}
        quickImportUrl={hero.url}
      />

      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ds-text-muted, #6b7280)', margin: '1rem 0 0.4rem' }}>Gallery</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {gallery.map((img, i) => (
          <div key={i} style={{ width: 76, textAlign: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--ds-border, #e5e7eb)', background: '#f1f5f9' }}>
              {img.url && <img src={img.asset_id ? `/api/assets/${img.asset_id}` : img.url} alt={img.alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer' }}>◀</button>
              <button type="button" onClick={() => removeFromGallery(i)} style={{ fontSize: '0.7rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === gallery.length - 1} style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer' }}>▶</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setPicking((p) => !p)}
          style={{ width: 76, height: 76, borderRadius: 6, border: '1.5px dashed var(--ds-border, #d1d5db)', background: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--ds-text-muted, #6b7280)' }}>
          + Add
        </button>
      </div>

      {picking && (
        <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.6rem', border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 8 }}>
          {pickerAssets.filter((a) => a.displayUrl).map((a) => (
            <button key={a.id} type="button" onClick={() => addToGallery(a)}
              style={{ width: 52, height: 52, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--ds-border, #d1d5db)', padding: 0, cursor: 'pointer', background: '#f1f5f9' }}>
              <img src={a.displayUrl ?? undefined} alt={a.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
          {pickerAssets.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint, #9ca3af)' }}>No images in the library yet — upload one to the hero slot above first.</div>}
        </div>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
