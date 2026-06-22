'use client'

import { useState, useRef, useEffect } from 'react'

type Manufacturer = {
  id: string
  name: string
  slug: string
  documentCount: number
  systemCount: number
  componentCount: number
  status: string
}

export function ManufacturersList({ manufacturers }: { manufacturers: Manufacturer[] }) {
  const [gating, setGating] = useState<Manufacturer | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (gating) {
      setPassword('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [gating])

  async function handleEnter(e: React.FormEvent) {
    e.preventDefault()
    if (!gating) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/workspace-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId: gating.id, password }),
      })
      if (res.ok) {
        window.location.href = '/manufacturer/dashboard'
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error === 'Incorrect password' ? 'Incorrect password.' : 'Access denied.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {manufacturers.map((m) => (
          <button
            key={m.id}
            onClick={() => setGating(m)}
            style={{
              background: 'var(--ds-card-bg)',
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              textDecoration: 'none',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'box-shadow 0.15s',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--ds-navy)', marginBottom: '0.2rem', fontSize: '0.95rem' }}>
                {m.name}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
                {m.slug}
                {' · '}
                {m.documentCount} doc{m.documentCount !== 1 ? 's' : ''}
                {' · '}
                {m.systemCount} system{m.systemCount !== 1 ? 's' : ''}
                {' · '}
                {m.componentCount} component{m.componentCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
              <span
                className={`studio-badge studio-badge-${
                  m.status === 'active' ? 'approved' : 'draft'
                }`}
              >
                {m.status}
              </span>
              <span style={{ color: 'var(--ds-text-faint)', fontSize: '0.85rem' }}>→</span>
            </div>
          </button>
        ))}
      </div>

      {/* Password modal */}
      {gating && (
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
          onClick={(e) => { if (e.target === e.currentTarget) { setGating(null) } }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '2rem',
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#185D7A', marginBottom: '0.4rem' }}>
                Enter workspace
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                {gating.name}
              </h2>
              <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0.4rem 0 0' }}>
                Enter the studio gate password to access this workspace as admin.
              </p>
            </div>

            <form onSubmit={handleEnter}>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Gate password"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  border: error ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: error ? '0.4rem' : '1rem',
                }}
              />
              {error && (
                <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '0 0 1rem', fontWeight: 600 }}>
                  {error}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setGating(null)}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#64748b',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !password}
                  style={{
                    flex: 2,
                    padding: '0.6rem',
                    border: 'none',
                    borderRadius: 8,
                    background: loading ? '#94a3b8' : '#185D7A',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: loading || !password ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading ? 'Entering…' : 'Enter workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
