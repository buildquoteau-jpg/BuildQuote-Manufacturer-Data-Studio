'use client'

// "Add from URL" — register a source document from a PDF link instead of
// download-and-reupload. Posts to /api/manufacturer/add-source-url, which
// registers the source and enqueues a fetch_url pipeline job; the worker
// fetches the PDF into R2 and chunks it. See
// docs/sourced-system-card-architecture.md.

import { useState } from 'react'

const DOCUMENT_TYPES = [
  { id: 'product_guide',        label: 'Product Guide' },
  { id: 'installation_guide',   label: 'Installation Guide' },
  { id: 'brochure',             label: 'Brochure / Catalogue' },
  { id: 'technical_data_sheet', label: 'Technical Data Sheet' },
  { id: 'other',                label: 'Other' },
]

interface Props {
  manufacturerId: string
  onAdded: () => void
}

export function AddUrlWidget({ manufacturerId, onAdded }: Props) {
  const [documentType, setDocumentType] = useState('installation_guide')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'adding' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  const busy = status === 'adding'

  function isValidHttpUrl(value: string): boolean {
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  async function handleAdd() {
    const trimmed = url.trim()
    setError('')
    if (!isValidHttpUrl(trimmed)) {
      setStatus('error')
      setError('Enter a valid http(s) URL.')
      return
    }
    setStatus('adding')
    try {
      const res = await fetch('/api/manufacturer/add-source-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId, url: trimmed, documentType }),
      })
      if (!res.ok) {
        let msg = `Failed (${res.status})`
        try {
          const body = await res.json()
          if (body?.error) msg = body.error
        } catch { /* ignore */ }
        setStatus('error')
        setError(msg)
        return
      }
      setStatus('done')
      setUrl('')
      onAdded()
      setTimeout(() => setStatus((s) => (s === 'done' ? 'idle' : s)), 5000)
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!busy) handleAdd()
    }
  }

  return (
    <div>
      {/* Document type selector — mirrors the upload widget */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {DOCUMENT_TYPES.map((dt) => (
          <button
            key={dt.id}
            onClick={() => setDocumentType(dt.id)}
            disabled={busy}
            className={`studio-btn ${documentType === dt.id ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
            style={{ fontSize: '0.82rem' }}
          >
            {dt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); if (status === 'error') setStatus('idle') }}
          onKeyDown={handleKeyDown}
          placeholder="https://manufacturer.com/…/installation-guide.pdf"
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 260,
            padding: '0.55rem 0.8rem',
            border: '1.5px solid var(--ds-border)',
            borderRadius: 8,
            fontSize: '0.875rem',
            color: 'var(--ds-text)',
            background: '#fff',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={busy || !url.trim()}
          className="studio-btn studio-btn-primary"
          style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
        >
          {busy ? 'Adding…' : 'Add URL'}
        </button>
      </div>

      <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', minHeight: '1.1rem' }}>
        {status === 'done' && (
          <span style={{ color: '#16a34a', fontWeight: 600 }}>
            Added — fetching &amp; extracting in the background. It&rsquo;ll appear in the list shortly.
          </span>
        )}
        {status === 'error' && error && (
          <span style={{ color: '#ef4444', fontWeight: 600 }}>{error}</span>
        )}
        {(status === 'idle' || status === 'adding') && (
          <span style={{ color: 'var(--ds-text-faint)' }}>
            Paste a direct PDF link — we fetch and parse it for you, no download or re-upload needed.
          </span>
        )}
      </div>
    </div>
  )
}
