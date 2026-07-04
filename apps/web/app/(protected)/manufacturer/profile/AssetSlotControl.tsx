'use client'

// Image-slot control for the brand profile: link an asset-library image to a
// slot (logo / hero / banner) via upload, import-from-URL or choose-from-library.
// The parent form keeps a plain URL field working alongside — this control just
// reports (assetId, url) picks upward; saving stays with the form's Save button.

import { useRef, useState } from 'react'
import {
  requestAssetUploadUrl,
  recordAssetUpload,
  importAssetFromUrl,
} from '@/lib/studio-manufacturer/asset-actions'
import { assetTypeLabel } from '@/lib/studio-manufacturer/asset-types'

export type SlotAsset = {
  id: string
  assetType: string
  title: string | null
  displayUrl: string | null
  publicUrl: string | null
  approvedForPublication: boolean
}

export type SlotPick = {
  assetId: string
  /** Durable URL to store in the legacy *_url column (null = keep existing). */
  publicUrl: string | null
  /** URL for immediate preview in the form. */
  displayUrl: string | null
}

const ACCEPTED_IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif', 'image/avif',
])
const MAX_BYTES = 25 * 1024 * 1024

export function AssetSlotControl({
  manufacturerId,
  uploadAssetType,
  pickerAssetTypes,
  assets,
  currentAssetId,
  onPick,
  onClear,
}: {
  manufacturerId: string
  /** Asset type given to newly uploaded/imported images for this slot. */
  uploadAssetType: string
  /** Which library asset types are offered in the picker. */
  pickerAssetTypes: string[]
  assets: SlotAsset[]
  currentAssetId: string | null
  onPick: (pick: SlotPick) => void
  onClear: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [busyMsg, setBusyMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const pickable = assets.filter((a) => pickerAssetTypes.includes(a.assetType))
  const current = currentAssetId ? assets.find((a) => a.id === currentAssetId) ?? null : null

  async function handleUpload(file: File) {
    setErrorMsg('')
    const mime = (file.type || '').split(';')[0]
    if (!ACCEPTED_IMAGE_MIME.has(mime)) {
      setErrorMsg('Not a supported image type (PNG, JPG, WEBP, SVG, GIF, AVIF).')
      return
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg('Image exceeds 25 MB.')
      return
    }
    setBusyMsg(`Uploading ${file.name}…`)
    try {
      const presign = await requestAssetUploadUrl({
        manufacturerId, contentType: mime, fileSizeBytes: file.size,
      })
      if (!presign.ok) { setErrorMsg(presign.error); return }

      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT', headers: { 'Content-Type': mime }, body: file,
      })
      if (!putRes.ok) { setErrorMsg(`Storage upload failed (${putRes.status}).`); return }

      const record = await recordAssetUpload({
        manufacturerId,
        assetType: uploadAssetType,
        storageKey: presign.storageKey,
        contentType: mime,
        fileSizeBytes: file.size,
        title: file.name.replace(/\.[a-z0-9]+$/i, ''),
        altText: null,
        width: null,
        height: null,
      })
      if (!record.ok) { setErrorMsg(record.error); return }
      onPick({ assetId: record.assetId, publicUrl: record.publicUrl, displayUrl: record.displayUrl })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyMsg('')
    }
  }

  async function handleImport() {
    if (!importUrl.trim()) return
    setErrorMsg('')
    setBusyMsg('Importing from URL…')
    try {
      const result = await importAssetFromUrl({
        manufacturerId,
        url: importUrl,
        assetType: uploadAssetType,
        title: null,
        altText: null,
      })
      if (!result.ok) { setErrorMsg(result.error); return }
      setImportUrl('')
      setImportOpen(false)
      onPick({ assetId: result.assetId, publicUrl: result.publicUrl, displayUrl: result.displayUrl })
    } finally {
      setBusyMsg('')
    }
  }

  const smallBtn: React.CSSProperties = { fontSize: '0.74rem', padding: '0.28rem 0.65rem' }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="studio-btn studio-btn-ghost" style={smallBtn}
          disabled={!!busyMsg}
          onClick={() => fileInputRef.current?.click()}>
          Upload image
        </button>
        <button type="button" className="studio-btn studio-btn-ghost" style={smallBtn}
          disabled={!!busyMsg}
          onClick={() => { setImportOpen((v) => !v); setPickerOpen(false) }}>
          Import from URL
        </button>
        <button type="button" className="studio-btn studio-btn-ghost" style={smallBtn}
          disabled={!!busyMsg || pickable.length === 0}
          title={pickable.length === 0 ? 'No matching images in your asset library yet' : undefined}
          onClick={() => { setPickerOpen((v) => !v); setImportOpen(false) }}>
          Choose from assets ({pickable.length})
        </button>
        {current && (
          <>
            <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
              Linked: <strong>{current.title || assetTypeLabel(current.assetType)}</strong>
              {!current.approvedForPublication && (
                <span style={{ color: '#b45309' }}> (not approved for publication yet)</span>
              )}
            </span>
            <button type="button" className="studio-btn studio-btn-ghost"
              style={{ ...smallBtn, color: '#b91c1c' }}
              onClick={() => { onClear(); setPickerOpen(false) }}>
              Unlink
            </button>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.avif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      {importOpen && (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://your-website.com.au/images/logo.png"
            disabled={!!busyMsg}
            style={{
              flex: 1, minWidth: 220, padding: '0.35rem 0.55rem',
              border: '1.5px solid var(--ds-border)', borderRadius: 8,
              fontSize: '0.8rem', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button type="button" className="studio-btn studio-btn-primary" style={smallBtn}
            disabled={!!busyMsg || !importUrl.trim()} onClick={handleImport}>
            Import
          </button>
        </div>
      )}

      {pickerOpen && pickable.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.5rem',
          padding: '0.6rem',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          background: '#f8fafc',
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          {pickable.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                onPick({ assetId: a.id, publicUrl: a.publicUrl, displayUrl: a.displayUrl })
                setPickerOpen(false)
              }}
              style={{
                border: a.id === currentAssetId ? '2px solid var(--ds-teal)' : '1px solid var(--ds-border)',
                borderRadius: 6,
                padding: 0,
                background: '#fff',
                cursor: 'pointer',
                overflow: 'hidden',
                textAlign: 'left',
              }}
            >
              {a.displayUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.displayUrl} alt={a.title ?? ''}
                  style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ height: 64, background: '#e2e8f0' }} />
              )}
              <div style={{
                fontSize: '0.66rem', padding: '0.25rem 0.35rem',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {a.title || assetTypeLabel(a.assetType)}
              </div>
            </button>
          ))}
        </div>
      )}

      {busyMsg && (
        <p style={{ fontSize: '0.74rem', color: 'var(--ds-teal)', fontWeight: 600, margin: '0.4rem 0 0' }}>{busyMsg}</p>
      )}
      {errorMsg && (
        <p style={{ fontSize: '0.74rem', color: '#ef4444', fontWeight: 600, margin: '0.4rem 0 0' }}>{errorMsg}</p>
      )}
    </div>
  )
}
