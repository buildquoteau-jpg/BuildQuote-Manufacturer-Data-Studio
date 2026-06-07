'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/browser'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)

    const supabase = getBrowserSupabaseClient()
    if (!supabase) {
      setError('Studio is not configured. Contact BuildQuote.')
      setPending(false)
      return
    }

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
        setError(`Sign in failed: ${authError.message}`)
      }
      setPending(false)
      return
    }

    // Success — navigate to dashboard (full page reload so middleware picks up the session)
    window.location.href = '/dashboard'
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '0.6rem 0.9rem',
            fontSize: '0.875rem',
            color: '#dc2626',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="login-email"
          style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '0.35rem',
            color: 'var(--ds-text-sub)',
          }}
        >
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            padding: '0.55rem 0.75rem',
            border: '1px solid var(--ds-border)',
            borderRadius: 6,
            fontSize: '0.9rem',
            background: 'var(--ds-page-bg)',
            color: 'var(--ds-text)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor="login-password"
          style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '0.35rem',
            color: 'var(--ds-text-sub)',
          }}
        >
          Password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 2.5rem 0.55rem 0.75rem',
              border: '1px solid var(--ds-border)',
              borderRadius: 6,
              fontSize: '0.9rem',
              background: 'var(--ds-page-bg)',
              color: 'var(--ds-text)',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '0.6rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: 'var(--ds-text-muted)',
              fontSize: '0.8rem',
            }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="studio-btn studio-btn-primary"
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
