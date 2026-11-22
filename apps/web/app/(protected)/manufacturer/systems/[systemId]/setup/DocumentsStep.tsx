'use client'

// Step 3 of the guided setup flow (design doc addendum 3 §C5 step 3) —
// upload the documents that hold the actual source of truth for this system:
// install guides, design guides, tech data sheets, sustainability
// credentials, whatever the manufacturer has. Each upload creates the
// source_documents row AND links it to this system in one action
// (recordDocumentUpload with stagedSystemId + systemSourceRole — the
// manufacturer-facing linkage built in this same effort, task #26).

import { useEffect, useRef, useState } from 'react'
import { requestDocumentUploadUrl, recordDocumentUpload, type SystemSourceRole } from '@/lib/studio-manufacturer/document-actions'
import { CsvImportPanel } from './CsvImportPanel'

export type LinkedDocument = {
  documentId: string
  role: SystemSourceRole
  label: string | null
  documentName: string | null
}

const ROLE_OPTIONS: { value: SystemSourceRole; label: string }[] = [
  { value: 'install_guide', label: 'Installation guide' },
  { value: 'design_guide', label: 'Design / sealing / care guide' },
  { value: 'tech_data', label: 'Technical data sheet' },
  { value: 'source_catalogue', label: 'Other (warranty, brochure, certifications)' },
]

function guessRoleFromName(name: string): SystemSourceRole {
  const s = name.toLowerCase()
  if (/install|fixing|fasten|subframe|framing/.test(s)) return 'install_guide'
  if (/seal|coat|paint|oil|care|maint|design|best.?practice|finish|colour|color/.test(s)) return 'design_guide'
  if (/tds|tech|spec|data.?sheet|span|bal|slip|fire|acoustic|engineering/.test(s)) return 'tech_data'
  return 'source_catalogue'
}

const ACCEPTED_MIME = new Set([
  'application/pdf',
])
const ACCEPT_ATTR = '.pdf'
const ACCEPTED_LABEL = 'PDF (.pdf) — for CSV product tables, use the CSV Import section below'
const MAX_BYTES = 50 * 1024 * 1024

export function DocumentsStep({
  systemId,
  manufacturerId,
  initialDocuments,
  onChanged,
}: {
  systemId: string
  manufacturerId: string
  initialDocuments: LinkedDocument[]
  onChanged?: (count: number) => void
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  useEffect(() => { setDocuments(initialDocuments) }, [initialDocuments])
  const [role, setRole] = useState<'auto' | SystemSourceRole>('auto')
  const [busyMsg, setBusyMsg] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function addPdfFromUrl() {
    const trimmed = pdfUrl.trim()
    if (!trimmed) return
    setError('')
    setAddingUrl(true)
    const resolvedRole: SystemSourceRole = role === 'auto' ? guessRoleFromName(trimmed) : role
    try {
      const res = await fetch('/api/manufacturer/add-source-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturerId,
          stagedSystemId: systemId,
          role: resolvedRole,
          url: trimmed,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not add document link.')
        return
      }
      let derivedName = trimmed
      try {
        const u = new URL(trimmed)
        const last = u.pathname.split('/').filter(Boolean).pop()
        if (last) derivedName = decodeURIComponent(last).replace(/\.[^.]+$/, '')
      } catch { /* fallback to full URL */ }
      const next: LinkedDocument[] = [
        ...documents,
        { documentId: data.documentId, role: resolvedRole, label: derivedName, documentName: `${derivedName} (fetching from link…)` },
      ]
      setDocuments(next)
      onChanged?.(next.length)
      setPdfUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddingUrl(false)
    }
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return
    setError('')
    const errors: string[] = []
    const added: LinkedDocument[] = []

    for (const file of files) {
      if (!ACCEPTED_MIME.has(file.type)) { errors.push(`${file.name}: not a supported file type`); continue }
      if (file.size > MAX_BYTES) { errors.push(`${file.name}: exceeds 50 MB`); continue }

      const fileRole: SystemSourceRole = role === 'auto' ? guessRoleFromName(file.name) : role
      setBusyMsg(`Uploading ${file.name}…`)
      try {
        const presign = await requestDocumentUploadUrl({
          manufacturerId,
          originalFilename: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
          documentType: fileRole,
        })
        if (!presign.ok) { errors.push(`${file.name}: ${presign.error}`); continue }

        const putRes = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!putRes.ok) { errors.push(`${file.name}: storage upload failed (${putRes.status})`); continue }

        const documentName = file.name.replace(/\.[a-z0-9]+$/i, '')
        const record = await recordDocumentUpload({
          manufacturerId,
          originalFilename: file.name,
          documentName,
          documentType: fileRole,
          storageKey: presign.storageKey,
          contentType: file.type,
          fileSizeBytes: file.size,
          stagedSystemId: systemId,
          systemSourceRole: fileRole,
        })
        if (!record.ok) { errors.push(`${file.name}: ${record.error}`); continue }

        added.push({ documentId: record.documentId, role: fileRole, label: documentName, documentName })
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    setBusyMsg('')
    if (errors.length) setError(errors.join(' · '))
    if (added.length > 0) {
      const next = [...documents, ...added]
      setDocuments(next)
      onChanged?.(next.length)
    }
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 0.4rem', lineHeight: 1.55 }}>
        This is the information that will be reflected in the final System Card — include everything
        relevant: profiles, variants, specs, UOM, pack sizes, components, accessories, colours,
        finishes, technical attributes, sustainability credentials, applications, non-compatibility
        warnings, BAL rating, acoustic ratings, slip ratings, moisture ratings, span tables and
        anything else that describes this system.
      </p>
      <p style={{ fontSize: '0.74rem', color: 'var(--ds-text-faint)', margin: '0 0 0.7rem' }}>
        Files accepted: {ACCEPTED_LABEL} — up to 50 MB each.
      </p>

      <div style={{ marginBottom: '0.6rem' }}>
        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', display: 'block', marginBottom: 4 }}>
          Document type (auto-detect lets you drop all PDFs at once)
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'auto' | SystemSourceRole)}
          style={{
            padding: '7px 10px', borderRadius: 7, border: '1px solid var(--ds-border)',
            background: 'var(--ds-surface, rgba(255,255,255,0.04))', color: 'inherit', fontSize: '0.85rem',
          }}
        >
          <option value="auto">Auto-detect from filename (recommended)</option>
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? '#185D7A' : 'var(--ds-border)'}`,
          borderRadius: 10, padding: '1.1rem', textAlign: 'center', cursor: 'pointer',
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
          {role === 'auto'
            ? 'Drop all your PDFs here at once, or click to choose'
            : `Drop ${ROLE_OPTIONS.find((o) => o.value === role)?.label.toLowerCase()} PDFs here, or click to choose`}
        </div>
      </div>

      <div style={{ marginBottom: '0.8rem' }}>
        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', display: 'block', marginBottom: 4 }}>
          Or paste a direct PDF link from your website
        </label>
        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <input
            type="url"
            value={pdfUrl}
            onChange={(e) => setPdfUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPdfFromUrl() } }}
            placeholder="https://example.com.au/guides/installation-guide.pdf"
            disabled={addingUrl}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--ds-border)',
              background: 'var(--ds-surface, rgba(255,255,255,0.04))', color: 'inherit', fontSize: '0.82rem',
            }}
          />
          <button
            type="button"
            onClick={addPdfFromUrl}
            disabled={addingUrl || !pdfUrl.trim()}
            style={{
              fontSize: '0.8rem', fontWeight: 700, color: '#fff',
              background: addingUrl || !pdfUrl.trim() ? '#94a3b8' : '#185D7A',
              border: 'none', borderRadius: 7, padding: '7px 14px',
              cursor: addingUrl || !pdfUrl.trim() ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {addingUrl ? 'Adding…' : 'Fetch PDF'}
          </button>
        </div>
      </div>

      {busyMsg && <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginBottom: '0.6rem' }}>{busyMsg}</div>}
      {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginBottom: '0.6rem' }}>{error}</div>}

      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {documents.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem',
              padding: '0.4rem 0.6rem', border: '1px solid var(--ds-border)', borderRadius: 7,
            }}>
              <span style={{
                fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                color: '#185D7A', background: 'rgba(24,93,122,0.1)', borderRadius: 4, padding: '2px 6px',
              }}>
                {ROLE_OPTIONS.find((o) => o.value === d.role)?.label ?? d.role}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.documentName ?? d.label ?? 'Untitled document'}
              </span>
            </div>
          ))}
        </div>
      )}

      <CsvImportPanel systemId={systemId} manufacturerId={manufacturerId} />
    </div>
  )
}
