'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/, '')
}

type Field = 'name' | 'slug' | 'website_url'

export function NewManufacturerButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setSlug('')
      setSlugManual(false)
      setWebsiteUrl('')
      setStatus('draft')
      setError('')
      setFieldErrors({})
      setLoading(false)
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [open])

  function handleNameChange(val: string) {
    setName(val)
    if (!slugManual) setSlug(toSlug(val))
  }

  function handleSlugChange(val: string) {
    setSlugManual(true)
    setSlug(val)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    const errs: Partial<Record<Field, string>> = {}
    if (!name.trim()) errs.name = 'Name is required.'
    if (!slug.trim()) errs.slug = 'Slug is required.'
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim()))
      errs.slug = 'Lowercase letters, numbers, hyphens only. No leading/trailing hyphens.'
    if (websiteUrl.trim()) {
      try { new URL(websiteUrl.trim()) } catch { errs.website_url = 'Must be a valid URL.' }
    }
    if (Object.keys(errs).length) { setFieldErrors(errs); return }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), website_url: websiteUrl.trim() || null, status }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '0.5rem 1rem',
          background: '#185D7A',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: '0.875rem',
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        + New manufacturer
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !loading) setOpen(false) }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '2rem',
              width: '100%',
              maxWidth: 460,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#185D7A', marginBottom: '0.4rem' }}>
                Admin · Create workspace
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                New manufacturer
              </h2>
              <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0.4rem 0 0' }}>
                Creates a Data Studio workspace. The manufacturer starts in draft status.
              </p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Acme Building Products"
                  style={inputStyle(!!fieldErrors.name)}
                />
                {fieldErrors.name && <p style={fieldErrStyle}>{fieldErrors.name}</p>}
              </div>

              {/* Slug */}
              <div>
                <label style={labelStyle}>
                  Slug *
                  <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '0.4rem' }}>
                    (URL identifier, must be unique)
                  </span>
                </label>
                <input
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="e.g. acme-building-products"
                  style={inputStyle(!!fieldErrors.slug)}
                />
                {fieldErrors.slug
                  ? <p style={fieldErrStyle}>{fieldErrors.slug}</p>
                  : <p style={hintStyle}>Auto-generated from name. Edit to customise.</p>
                }
              </div>

              {/* Website URL */}
              <div>
                <label style={labelStyle}>Website URL <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://www.example.com.au"
                  type="url"
                  style={inputStyle(!!fieldErrors.website_url)}
                />
                {fieldErrors.website_url && <p style={fieldErrStyle}>{fieldErrors.website_url}</p>}
              </div>

              {/* Status */}
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'draft' | 'active')}
                  style={{ ...inputStyle(false), background: '#fff' }}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </div>

              {error && (
                <p style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  style={cancelBtnStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim() || !slug.trim()}
                  style={submitBtnStyle(loading || !name.trim() || !slug.trim())}
                >
                  {loading ? 'Creating…' : 'Create manufacturer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ── styles ──────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '0.35rem',
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '0.6rem 0.85rem',
    border: hasError ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
    borderRadius: 8,
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#1e293b',
  }
}

const fieldErrStyle: React.CSSProperties = {
  color: '#ef4444',
  fontSize: '0.75rem',
  fontWeight: 600,
  margin: '0.3rem 0 0',
}

const hintStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '0.75rem',
  margin: '0.3rem 0 0',
}

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.6rem',
  border: '1.5px solid #cbd5e1',
  borderRadius: 8,
  background: '#fff',
  color: '#64748b',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
}

function submitBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 2,
    padding: '0.6rem',
    border: 'none',
    borderRadius: 8,
    background: disabled ? '#94a3b8' : '#185D7A',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
