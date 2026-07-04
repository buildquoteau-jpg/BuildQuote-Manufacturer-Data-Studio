'use client'

// Manufacturer asset library UI: upload, import from URL, edit metadata /
// focal point / approval, archive. Assets are the public images that ship in
// the static System Card website package — Studio references them by ID.

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  requestAssetUploadUrl,
  recordAssetUpload,
  importAssetFromUrl,
  updateAssetMeta,
  setAssetArchived,
} from '@/lib/studio-manufacturer/asset-actions'
import { ASSET_TYPE_LABELS, ASSET_TYPES, assetTypeLabel } from '@/lib/studio-manufacturer/asset-types'

export type AssetView = {
  id: string
  assetType: string
  title: string | null
  altText: string | null
  caption: string | null
  sourceUrl: string | null
  mimeType: string | null
  fileSizeBytes: number | null
  width: number | null
  height: number | null
  focalX: number
  focalY: number
  approvedForPublication: boolean
  archived: boolean
  createdAt: string
  displayUrl: string | null
  usedBy: string[]
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.45rem 0.6rem',
  border: '1.5px solid var(--ds-border)',
  borderRadius: 8,
  fontSize: '0.84rem',
  color: 'var(--ds-text)',
  background: '#fff',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const ACCEPTED_IMAGE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif', 'image/avif',
])
const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,.svg,.gif,.avif'
const MAX_BYTES = 25 * 1024 * 1024

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

// ─── Upload / import panel ───────────────────────────────────────────────────

function AddAssetPanel({ manufacturerId }: { manufacturerId: string }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [assetType, setAssetType] = useState('card_hero')
  const [mode, setMode] = useState<'upload' | 'url'>('upload')
  const [busyMsg, setBusyMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  async function uploadFiles(files: File[]) {
    setErrorMsg('')
    const errors: string[] = []
    let uploaded = 0

    for (const file of files) {
      const mime = (file.type || '').split(';')[0]
      if (!ACCEPTED_IMAGE_MIME.has(mime)) {
        errors.push(`${file.name}: not a supported image type`)
        continue
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: exceeds 25 MB`)
        continue
      }

      setBusyMsg(`Uploading ${file.name}…`)
      try {
        const presign = await requestAssetUploadUrl({
          manufacturerId,
          contentType: mime,
          fileSizeBytes: file.size,
        })
        if (!presign.ok) { errors.push(`${file.name}: ${presign.error}`); continue }

        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mime },
          body: file,
        })
        if (!putRes.ok) { errors.push(`${file.name}: storage upload failed (${putRes.status})`); continue }

        const dims = await readImageDimensions(file)
        const record = await recordAssetUpload({
          manufacturerId,
          assetType,
          storageKey: presign.storageKey,
          contentType: mime,
          fileSizeBytes: file.size,
          title: file.name.replace(/\.[a-z0-9]+$/i, ''),
          altText: null,
          width: dims.width,
          height: dims.height,
        })
        if (!record.ok) { errors.push(`${file.name}: ${record.error}`); continue }
        uploaded++
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setBusyMsg('')
    if (errors.length) setErrorMsg(errors.join(' · '))
    if (uploaded > 0) router.refresh()
  }

  async function handleImport() {
    if (!importUrl.trim()) return
    setErrorMsg('')
    setBusyMsg('Importing from URL…')
    try {
      const result = await importAssetFromUrl({
        manufacturerId,
        url: importUrl,
        assetType,
        title: null,
        altText: null,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
      } else {
        setImportUrl('')
        router.refresh()
      }
    } finally {
      setBusyMsg('')
    }
  }

  return (
    <div>
      {/* Asset type selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {ASSET_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setAssetType(t)}
            disabled={!!busyMsg}
            className={`studio-btn ${assetType === t ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
            style={{ fontSize: '0.82rem' }}
          >
            {ASSET_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => setMode('upload')}
          className={`studio-btn ${mode === 'upload' ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
          style={{ fontSize: '0.8rem' }}
        >
          Upload files
        </button>
        <button
          onClick={() => setMode('url')}
          className={`studio-btn ${mode === 'url' ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
          style={{ fontSize: '0.8rem' }}
        >
          Import from URL
        </button>
      </div>

      {mode === 'upload' ? (
        <div
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); uploadFiles(Array.from(e.dataTransfer.files)) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? 'var(--ds-teal)' : 'var(--ds-border)'}`,
            borderRadius: 8,
            padding: '1.5rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'rgba(24,93,122,0.04)' : undefined,
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) uploadFiles(files)
              e.target.value = ''
            }}
          />
          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
            Drop images here or click to browse
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
            PNG, JPG, WEBP, SVG, GIF, AVIF · Max 25 MB · Uploaded as {assetTypeLabel(assetType)}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://your-website.com.au/images/hero.jpg"
            style={{ ...inputStyle, flex: 1, minWidth: 260, width: 'auto' }}
            disabled={!!busyMsg}
          />
          <button
            onClick={handleImport}
            disabled={!!busyMsg || !importUrl.trim()}
            className="studio-btn studio-btn-primary"
          >
            Import as {assetTypeLabel(assetType)}
          </button>
        </div>
      )}

      {busyMsg && (
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-teal)', marginTop: '0.6rem', fontWeight: 600 }}>
          {busyMsg}
        </p>
      )}
      {errorMsg && (
        <p style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '0.6rem', fontWeight: 600 }}>
          {errorMsg}
        </p>
      )}
    </div>
  )
}

// ─── Asset card (grid item + inline editor) ──────────────────────────────────

function AssetCard({ asset, manufacturerId }: { asset: AssetView; manufacturerId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(asset.title ?? '')
  const [altText, setAltText] = useState(asset.altText ?? '')
  const [caption, setCaption] = useState(asset.caption ?? '')
  const [type, setType] = useState(asset.assetType)
  const [focalX, setFocalX] = useState(asset.focalX)
  const [focalY, setFocalY] = useState(asset.focalY)
  const [approved, setApproved] = useState(asset.approvedForPublication)
  const [errorMsg, setErrorMsg] = useState('')

  function save() {
    setErrorMsg('')
    startTransition(async () => {
      const result = await updateAssetMeta({
        assetId: asset.id,
        manufacturerId,
        title: title || null,
        altText: altText || null,
        caption: caption || null,
        assetType: type,
        focalX,
        focalY,
        approvedForPublication: approved,
      })
      if (!result.ok) {
        setErrorMsg(result.error)
      } else {
        setEditing(false)
        router.refresh()
      }
    })
  }

  function archive() {
    startTransition(async () => {
      const result = await setAssetArchived(asset.id, manufacturerId, true)
      if (!result.ok) setErrorMsg(result.error)
      else router.refresh()
    })
  }

  return (
    <div
      style={{
        background: 'var(--ds-card-bg)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Preview */}
      <div style={{ position: 'relative', height: 140, background: '#f1f5f9' }}>
        {asset.displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.displayUrl}
            alt={asset.altText ?? asset.title ?? ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${editing ? focalX : asset.focalX}% ${editing ? focalY : asset.focalY}%`,
            }}
          />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', color: 'var(--ds-text-faint)',
          }}>
            No preview available
          </div>
        )}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em',
          padding: '0.15rem 0.5rem', borderRadius: 999,
          background: 'rgba(15,23,42,0.72)', color: '#fff',
        }}>
          {assetTypeLabel(asset.assetType)}
        </span>
        {asset.approvedForPublication && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            fontSize: '0.68rem', fontWeight: 700,
            padding: '0.15rem 0.5rem', borderRadius: 999,
            background: '#16a34a', color: '#fff',
          }}>
            Approved
          </span>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '0.7rem 0.85rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.title || 'Untitled asset'}
        </div>
        <div style={{ fontSize: '0.74rem', color: 'var(--ds-text-faint)' }}>
          {formatBytes(asset.fileSizeBytes)}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
          {asset.mimeType ? ` · ${asset.mimeType.replace('image/', '').toUpperCase()}` : ''}
        </div>
        {!asset.altText && !editing && (
          <div style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: 600 }}>
            Missing alt text
          </div>
        )}
        {asset.usedBy.length > 0 ? (
          <div style={{ fontSize: '0.74rem', color: 'var(--ds-text-muted)' }}>
            Used by: {asset.usedBy.join(', ')}
          </div>
        ) : (
          <div style={{ fontSize: '0.74rem', color: 'var(--ds-text-faint)' }}>
            Not linked to a card or brand slot yet
          </div>
        )}

        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.35rem' }}>
            <label style={{ fontSize: '0.74rem', fontWeight: 600 }}>
              Title
              <input style={{ ...inputStyle, marginTop: 2 }} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label style={{ fontSize: '0.74rem', fontWeight: 600 }}>
              Alt text (describes the image for accessibility)
              <input style={{ ...inputStyle, marginTop: 2 }} value={altText} onChange={(e) => setAltText(e.target.value)}
                placeholder="e.g. Grey cladding panels on a coastal home" />
            </label>
            <label style={{ fontSize: '0.74rem', fontWeight: 600 }}>
              Caption / credit (optional)
              <input style={{ ...inputStyle, marginTop: 2 }} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>
            <label style={{ fontSize: '0.74rem', fontWeight: 600 }}>
              Asset type
              <select style={{ ...inputStyle, marginTop: 2 }} value={type} onChange={(e) => setType(e.target.value)}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: '0.74rem', fontWeight: 600 }}>
              Focal point — keeps the important part visible when the image is cropped
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: 2 }}>
                <span style={{ width: 12, color: 'var(--ds-text-faint)' }}>X</span>
                <input type="range" min={0} max={100} value={focalX}
                  onChange={(e) => setFocalX(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#185D7A' }} />
                <span style={{ width: 32, textAlign: 'right' }}>{focalX}%</span>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <span style={{ width: 12, color: 'var(--ds-text-faint)' }}>Y</span>
                <input type="range" min={0} max={100} value={focalY}
                  onChange={(e) => setFocalY(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#185D7A' }} />
                <span style={{ width: 32, textAlign: 'right' }}>{focalY}%</span>
              </div>
            </div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              Approved for publication (can be included in packages)
            </label>
          </div>
        )}

        {errorMsg && (
          <div style={{ fontSize: '0.74rem', color: '#ef4444', fontWeight: 600 }}>{errorMsg}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', paddingTop: '0.4rem', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button className="studio-btn studio-btn-primary" style={{ fontSize: '0.78rem' }}
                onClick={save} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button className="studio-btn studio-btn-ghost" style={{ fontSize: '0.78rem' }}
                onClick={() => setEditing(false)} disabled={isPending}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="studio-btn studio-btn-ghost" style={{ fontSize: '0.78rem' }}
                onClick={() => setEditing(true)}>
                Edit
              </button>
              {asset.displayUrl && (
                <a className="studio-btn studio-btn-ghost" style={{ fontSize: '0.78rem' }}
                  href={asset.displayUrl} target="_blank" rel="noreferrer">
                  View full size
                </a>
              )}
              <button className="studio-btn studio-btn-ghost" style={{ fontSize: '0.78rem', color: '#b91c1c' }}
                onClick={archive} disabled={isPending || asset.usedBy.length > 0}
                title={asset.usedBy.length > 0 ? 'In use — unlink it from the brand profile / cards first' : undefined}>
                Archive
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page client ─────────────────────────────────────────────────────────────

export function AssetsClient({
  manufacturerId,
  assets,
}: {
  manufacturerId: string
  assets: AssetView[]
}) {
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const filtered = useMemo(
    () => (typeFilter === 'all' ? assets : assets.filter((a) => a.assetType === typeFilter)),
    [assets, typeFilter],
  )

  const typesPresent = useMemo(
    () => ASSET_TYPES.filter((t) => assets.some((a) => a.assetType === t)),
    [assets],
  )

  return (
    <>
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Add an asset</div>
        <AddAssetPanel manufacturerId={manufacturerId} />
      </div>

      <div className="studio-section">
        <div className="studio-section-heading">Asset library</div>

        {assets.length === 0 ? (
          <div className="studio-info">
            No assets yet. Upload your logo, brand hero and card hero images above — they become
            the local image files inside your System Card website package.
          </div>
        ) : (
          <>
            {typesPresent.length > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`studio-btn ${typeFilter === 'all' ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
                  style={{ fontSize: '0.78rem' }}
                >
                  All ({assets.length})
                </button>
                {typesPresent.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`studio-btn ${typeFilter === t ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {ASSET_TYPE_LABELS[t]} ({assets.filter((a) => a.assetType === t).length})
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: '0.9rem',
              }}
            >
              {filtered.map((asset) => (
                <AssetCard key={asset.id} asset={asset} manufacturerId={manufacturerId} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
