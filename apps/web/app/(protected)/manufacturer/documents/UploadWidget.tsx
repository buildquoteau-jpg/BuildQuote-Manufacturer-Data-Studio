'use client'

import { useRef, useState } from 'react'

const DOCUMENT_TYPES = [
  { id: 'product_guide',        label: 'Product Guide' },
  { id: 'installation_guide',   label: 'Installation Guide' },
  { id: 'brochure',             label: 'Brochure / Catalogue' },
  { id: 'price_list',           label: 'CSV' },
  { id: 'technical_data_sheet', label: 'Technical Data Sheet' },
  { id: 'other',                label: 'Other' },
]

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
])

const ACCEPT_ATTR = '.pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg'
const MAX_BYTES = 50 * 1024 * 1024

type FileItem = {
  id: string
  file: File
  documentType: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

interface Props {
  manufacturerId: string
  onUploaded: () => void
}

export function UploadWidget({ manufacturerId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedType, setSelectedType] = useState('product_guide')
  const [items, setItems] = useState<FileItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [rejectMsg, setRejectMsg] = useState('')

  // Refs for the async processing loop — avoids stale-closure issues
  const queueRef = useRef<FileItem[]>([])
  const isProcessingRef = useRef(false)

  function updateItemInState(id: string, patch: Partial<FileItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
    const idx = queueRef.current.findIndex((it) => it.id === id)
    if (idx !== -1) queueRef.current[idx] = { ...queueRef.current[idx], ...patch }
  }

  async function runProcessing() {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    let uploadedCount = 0

    while (true) {
      const item = queueRef.current.find((it) => it.status === 'pending')
      if (!item) break

      updateItemInState(item.id, { status: 'uploading' })

      try {
        // Step 1: get presigned PUT URL
        let presignRes: Response
        try {
          presignRes = await fetch('/api/manufacturer/presign-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              manufacturerId,
              mimeType: item.file.type,
            }),
          })
        } catch (networkErr) {
          const detail = networkErr instanceof Error ? networkErr.message : String(networkErr)
          updateItemInState(item.id, { status: 'error', error: `Network error: ${detail}` })
          continue
        }

        if (!presignRes.ok) {
          let errorMsg = `Presign failed (${presignRes.status})`
          try {
            const body = await presignRes.json()
            if (body?.error) errorMsg = body.error
          } catch { /* ignore */ }
          updateItemInState(item.id, { status: 'error', error: errorMsg })
          continue
        }

        const { uploadUrl, storageKey } = await presignRes.json() as {
          uploadUrl: string
          storageKey: string
        }

        // Step 2: PUT file directly to R2 (no Vercel body limit)
        try {
          const r2Res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': item.file.type },
            body: item.file,
          })
          if (!r2Res.ok) {
            updateItemInState(item.id, { status: 'error', error: `R2 upload failed (${r2Res.status})` })
            continue
          }
        } catch (networkErr) {
          const detail = networkErr instanceof Error ? networkErr.message : String(networkErr)
          updateItemInState(item.id, { status: 'error', error: `R2 network error: ${detail}` })
          continue
        }

        // Step 3: register the document row in Supabase
        let regRes: Response
        try {
          regRes = await fetch('/api/manufacturer/register-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              manufacturerId,
              storageKey,
              mimeType: item.file.type,
              originalFilename: item.file.name,
              documentType: item.documentType,
              fileSizeBytes: item.file.size,
            }),
          })
        } catch (networkErr) {
          const detail = networkErr instanceof Error ? networkErr.message : String(networkErr)
          updateItemInState(item.id, { status: 'error', error: `Register error: ${detail}` })
          continue
        }

        if (!regRes.ok) {
          let errorMsg = `Register failed (${regRes.status})`
          try {
            const body = await regRes.json()
            if (body?.error) errorMsg = body.error
          } catch { /* ignore */ }
          updateItemInState(item.id, { status: 'error', error: errorMsg })
          continue
        }

        updateItemInState(item.id, { status: 'done' })
        uploadedCount++
      } catch (unexpectedErr) {
        updateItemInState(item.id, {
          status: 'error',
          error: `Unexpected error: ${unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr)}`,
        })
      }
    }

    isProcessingRef.current = false
    if (uploadedCount > 0) onUploaded()
  }

  function addFiles(files: File[]) {
    setRejectMsg('')
    const rejected: string[] = []
    const accepted: FileItem[] = []

    for (const file of files) {
      if (!ACCEPTED_MIME.has(file.type)) {
        rejected.push(file.name)
        continue
      }
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name} (exceeds 50 MB)`)
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        documentType: selectedType,
        status: 'pending',
      })
    }

    if (rejected.length) {
      setRejectMsg(`Skipped: ${rejected.join(', ')}`)
    }
    if (!accepted.length) return

    queueRef.current = [...queueRef.current, ...accepted]
    setItems((prev) => [...prev, ...accepted])
    runProcessing()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) addFiles(files)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  function clearSettled() {
    queueRef.current = queueRef.current.filter((it) => it.status === 'pending' || it.status === 'uploading')
    setItems((prev) => prev.filter((it) => it.status === 'pending' || it.status === 'uploading'))
    setRejectMsg('')
  }

  const isRunning = items.some((it) => it.status === 'uploading' || it.status === 'pending')
  const allSettled = items.length > 0 && !isRunning
  const doneCount = items.filter((it) => it.status === 'done').length
  const errorCount = items.filter((it) => it.status === 'error').length

  return (
    <div>
      {/* Document type selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {DOCUMENT_TYPES.map((dt) => (
          <button
            key={dt.id}
            onClick={() => setSelectedType(dt.id)}
            disabled={isRunning}
            className={`studio-btn ${selectedType === dt.id ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
            style={{ fontSize: '0.82rem' }}
          >
            {dt.label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--ds-teal)' : 'var(--ds-border)'}`,
          borderRadius: 8,
          padding: '1.75rem 2rem',
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
          onChange={handleFileChange}
        />
        <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          Drop files here or click to browse
        </p>
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
          PDF, CSV, XLSX, PNG, JPG · Max 50 MB · Multiple files supported
        </p>
      </div>

      {rejectMsg && (
        <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '0.5rem', fontWeight: 600 }}>
          {rejectMsg}
        </p>
      )}

      {/* File queue */}
      {items.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          {allSettled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                {doneCount} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ''}
              </span>
              <button
                onClick={clearSettled}
                className="studio-btn studio-btn-ghost"
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
              >
                Clear
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.45rem 0.75rem',
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: item.status === 'done' ? '#22c55e'
                    : item.status === 'error' ? '#ef4444'
                    : item.status === 'uploading' ? 'var(--ds-teal)'
                    : '#cbd5e1',
                }} />
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--ds-text)',
                }}>
                  {item.file.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', flexShrink: 0 }}>
                  {DOCUMENT_TYPES.find((t) => t.id === item.documentType)?.label}
                </span>
                {item.status === 'uploading' && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-teal)', flexShrink: 0 }}>
                    Uploading…
                  </span>
                )}
                {item.status === 'error' && item.error && (
                  <span style={{ fontSize: '0.75rem', color: '#ef4444', flexShrink: 0, maxWidth: 320, wordBreak: 'break-word' }}>
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
