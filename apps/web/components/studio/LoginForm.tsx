'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    // Eye with line through (hide)
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    // Eye open (show)
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      setError('Studio is not configured. Contact BuildQuote.')
      setPending(false)
      return
    }
    const supabase = createBrowserClient(url, anonKey)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      const msg = authError.message.toLowerCase()
      if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('wrong')) {
        setError('Incorrect email or password.')
      } else if (msg.includes('email not confirmed')) {
        setError('Email not confirmed. Contact BuildQuote to activate your account.')
      } else if (msg.includes('too many') || msg.includes('rate limit')) {
        setError('Too many sign-in attempts. Please wait a moment and try again.')
      } else {
        setError('Sign in failed. Please try again or contact BuildQuote.')
      }
      setPending(false)
      return
    }

    // If remember me is off, mark the session so it clears on browser close.
    // Supabase SSR uses cookie-based sessions; we set a flag the middleware
    // can read in a future enhancement. For now the session behaves normally.
    if (!rememberMe) {
      sessionStorage.setItem('bq_session_only', '1')
    } else {
      sessionStorage.removeItem('bq_session_only')
    }

    // Success — full page reload so middleware picks up the new session cookie
    window.location.href = '/dashboard'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.85rem',
    border: '1.5px solid var(--ds-border)',
    borderRadius: 8,
    fontSize: '0.92rem',
    background: '#fff',
    color: 'var(--ds-text)',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.83rem',
    fontWeight: 600,
    marginBottom: '0.4rem',
    color: 'var(--ds-text-sub)',
    letterSpacing: '0.01em',
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: '0.7rem 1rem',
            fontSize: '0.875rem',
            color: '#dc2626',
            marginBottom: '1.1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}
        >
          <span>{error}</span>
        </div>
      )}

      {/* Email */}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="login-email" style={labelStyle}>Email address</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Password */}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="login-password" style={labelStyle}>Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: '2.75rem' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '0.7rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.2rem',
              color: 'var(--ds-text-faint)',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            <EyeIcon open={showPassword} />
          </button>
        </div>
      </div>

      {/* Remember me */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          id="remember-me"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--ds-navy)' }}
        />
        <label
          htmlFor="remember-me"
          style={{ fontSize: '0.83rem', color: 'var(--ds-text-muted)', cursor: 'pointer', userSelect: 'none' }}
        >
          Remember me
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          width: '100%',
          padding: '0.7rem 1rem',
          background: pending ? '#94a3b8' : 'var(--ds-navy)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: '0.95rem',
          fontWeight: 600,
          cursor: pending ? 'not-allowed' : 'pointer',
          letterSpacing: '0.01em',
          transition: 'background 0.15s',
        }}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
