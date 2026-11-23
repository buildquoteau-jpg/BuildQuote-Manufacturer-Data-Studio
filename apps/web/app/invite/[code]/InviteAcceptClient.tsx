'use client'

import { useState } from 'react'

type Props = {
  code: string
  manufacturerName: string
  restrictedEmail: string | null
  signedInEmail: string | null
  expiresLabel: string
}

export function InviteAcceptClient({
  code,
  manufacturerName,
  restrictedEmail,
  signedInEmail,
  expiresLabel,
}: Props) {
  const emailMatchesCurrent =
    !!signedInEmail &&
    (!restrictedEmail || signedInEmail.toLowerCase() === restrictedEmail.toLowerCase())

  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(restrictedEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitAccept(submitMode: 'signup' | 'signin' | 'current') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          mode: submitMode,
          fullName: fullName.trim() || undefined,
          email: (restrictedEmail || email).trim() || undefined,
          password: password || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.code === 'ACCOUNT_EXISTS') {
          setMode('signin')
        }
        setError(data.error || 'Could not accept invitation. Please try again.')
        setBusy(false)
        return
      }
      window.location.href = data.redirectTo || '/manufacturer/start-here'
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitAccept(mode)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.8rem',
    border: '1.5px solid #cbd5e1',
    borderRadius: 8,
    fontSize: '0.88rem',
    boxSizing: 'border-box',
    outline: 'none',
    background: '#fff',
    color: '#0f172a',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.73rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#475569',
    marginBottom: '0.3rem',
  }

  return (
    <div>
      {emailMatchesCurrent && signedInEmail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 10,
              padding: '0.85rem 1rem',
              fontSize: '0.84rem',
              color: '#0c4a6e',
              lineHeight: 1.5,
            }}
          >
            Signed in as <strong>{signedInEmail}</strong>. Click below to unlock and edit the{' '}
            <strong>{manufacturerName}</strong> workspace immediately.
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#b91c1c', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => submitAccept('current')}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: 9,
              background: busy ? '#94a3b8' : '#185D7A',
              color: '#fff',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Opening workspace…' : `Enter ${manufacturerName} workspace →`}
          </button>
        </div>
      ) : (
        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Mode toggle */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '4px',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: 9,
            }}
          >
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null) }}
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 7,
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: mode === 'signup' ? '#fff' : 'transparent',
                color: mode === 'signup' ? '#0f172a' : '#64748b',
                boxShadow: mode === 'signup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              First time here
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null) }}
              style={{
                padding: '0.5rem 0.6rem',
                borderRadius: 7,
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: mode === 'signin' ? '#fff' : 'transparent',
                color: mode === 'signin' ? '#0f172a' : '#64748b',
                boxShadow: mode === 'signin' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Already have an account
            </button>
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="inv-name" style={labelStyle}>
                Your full name
              </label>
              <input
                id="inv-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Mitchell"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label htmlFor="inv-email" style={labelStyle}>
              Work email {restrictedEmail ? '(locked to invitation)' : ''}
            </label>
            <input
              id="inv-email"
              type="email"
              required
              disabled={!!restrictedEmail}
              value={restrictedEmail ?? email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com.au"
              style={{
                ...inputStyle,
                background: restrictedEmail ? '#f8fafc' : '#fff',
                color: restrictedEmail ? '#475569' : '#0f172a',
              }}
            />
          </div>

          <div>
            <label htmlFor="inv-password" style={labelStyle}>
              {mode === 'signup' ? 'Create a password (min 8 characters)' : 'Your password'}
            </label>
            <input
              id="inv-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#b91c1c', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              marginTop: '0.2rem',
              padding: '0.75rem 1rem',
              border: 'none',
              borderRadius: 9,
              background: busy ? '#94a3b8' : '#185D7A',
              color: '#fff',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy
              ? 'Setting up your workspace…'
              : mode === 'signup'
                ? `Create access & enter ${manufacturerName} →`
                : `Sign in & enter ${manufacturerName} →`}
          </button>
        </form>
      )}

      <p style={{ margin: '1rem 0 0', fontSize: '0.74rem', color: '#64748b', textAlign: 'center', lineHeight: 1.45 }}>
        You&rsquo;ll get direct edit access to your Brand Profile, product System Cards, verification, and Agent Ready checklist.
        <br />
        Invitation expires {expiresLabel}.
      </p>
    </div>
  )
}
