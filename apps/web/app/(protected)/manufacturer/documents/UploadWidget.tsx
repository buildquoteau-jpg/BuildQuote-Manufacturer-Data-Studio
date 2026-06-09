'use client'

import { useRef, useState, useTransition } from 'react'
import {
  requestDocumentUploadUrl,
  recordDocumentUpload,
} from '@/lib/studio-manufacturer/document-actions'

const DOCUMENT_TYPES = [
  { id: 'product_guide',        label: 'Product Guide' },
  { id: 'installation_guide',   label: 'Installation Guide' },
  { id: 'brochure',             label: 'Brochure / Catalogue' },
  { id: 'price_list',           label: 'Price List / CSV' },
  { id: 'technical_data_sheet', label: 'Technical Data Sheet' },
  { id: 'other',                label: 'Other' },
]

const ACCEPTED_MIME = [
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
]

const ACCEPT_ATTR = '.pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg'

type UploadState =
  | { phase: 'idle' }
  | { phase: 'selecting' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

interface Props {
  manufacturerId: string
  onUploaded: () => void
}

export function UploadWidget({ manufacturerId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedType, setSelectedType] = useState<string>('product_guide')
  const [state, setState] = useState<UploadState>({ phase: 'idle' })
  const [isPending, startTransition] = useTransition()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    handleUpload(file)
    e.target.value = ''
  }

  function handleUpload(file: File) {
    if (!ACCEPTED_MIME.includes(file.type)) {
      setState({ phase: 'error', message: `File type not accepted: ${file.name}` })
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setState({ phase: 'error', message: 'File exceeds 50 MB limit.' })
      return
    }

    setState({ phase: 'uploading', progress: 0 })

    startTransition(async () => {
      // 1. Get presigned URL
      const presignResult = await requestDocumentUploadUrl({
        manufacturerId,
        originalFilename: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
        documentType: selectedType,
      })

      if (!presignResult.ok) {
        setState({ phase: 'error', message: presignResult.error })
        return
      }

      // 2. Upload directly to R2
      setState({ phase: 'uploading', progress: 30 })

      const uploadRes = await fetch(presignResult.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (!uploadRes.ok) {
        setState({ phase: 'error', message: `Upload failed: ${uploadRes.statusText}` })
        return
      }

      setState({ phase: 'uploading', progress: 80 })

      // 3. Record in Supabase
      const docName = file.name.replace(/\.[^.]+$/, '')

      const recordResult = await recordDocumentUpload({
        manufacturerId,
        originalFilename: file.name,
        documentName: docName,
        documentType: selectedType,
        storageKey: presignResult.storageKey,
        contentType: file.type,
        fileSizeBytes: file.size,
      })

      if (!recordResult.ok) {
        setState({ phase: 'error', message: recordResult.error })
        return
      }

      setState({ phase: 'done' })
      onUploaded()

      setTimeout(() => setState({ phase: 'idle' }), 2000)
    })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const isUploading = state.phase === 'uploading' || isPending

  return (
    <div>
      {/* Document type selector */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        {DOCUMENT_TYPES.map((dt) => (
          <button
            key={dt.id}
            onClick={() => setSelectedType(dt.id)}
            disabled={isUploading}
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
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--ds-border)',
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: isUploading ? 'default' : 'pointer',
          opacity: isUploading ? 0.7 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {state.phase === 'idle' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📎</div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
              Drop a file here or click to browse
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
              PDF, CSV, XLSX, PNG, JPG · Max 50 MB
            </p>
          </>
        )}

        {state.phase === 'uploading' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Uploading…</p>
            <div
              style={{
                height: 4,
                background: 'var(--ds-border-soft)',
                borderRadius: 2,
                overflow: 'hidden',
                maxWidth: 300,
                margin: '0 auto',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${state.progress}%`,
                  background: 'var(--ds-teal)',
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
            <p style={{ fontWeight: 600 }}>Upload complete!</p>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>❌</div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Upload failed</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '0.75rem' }}>
              {state.message}
            </p>
            <button
              className="studio-btn studio-btn-ghost"
              onClick={(e) => { e.stopPropagation(); setState({ phase: 'idle' }) }}
              style={{ fontSize: '0.82rem' }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
