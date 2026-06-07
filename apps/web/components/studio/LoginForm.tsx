'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { loginWithPassword } from '@/lib/studio-auth/actions'
import type { LoginState } from '@/lib/studio-auth/actions'

const initialState: LoginState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="studio-btn studio-btn-primary"
      style={{ width: '100%', justifyContent: 'center' }}
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useFormState(loginWithPassword, initialState)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form action={formAction} noValidate>
      {state?.error && (
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
          {state.error}
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
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
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
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
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
              lineHeight: 1,
              fontSize: '1rem',
            }}
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      <SubmitButton />
    </form>
  )
}
