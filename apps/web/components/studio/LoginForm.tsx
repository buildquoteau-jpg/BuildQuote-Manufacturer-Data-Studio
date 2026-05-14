'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { loginWithPassword } from '@/lib/studio-auth/actions'
import type { LoginState } from '@/lib/studio-auth/actions'

const initialState: LoginState = { error: null }

// SubmitButton reads pending state from the nearest form via useFormStatus.
// Must be a separate component — useFormStatus only works inside a <form>.
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

/**
 * Login form — client component so useFormState can display server action errors
 * without a full page redirect. The actual Supabase auth call stays in the server
 * action (loginWithPassword) — no Supabase credentials are handled client-side.
 */
export function LoginForm() {
  const [state, formAction] = useFormState(loginWithPassword, initialState)

  return (
    <form action={formAction} noValidate>
      {state.error && (
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
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          style={{
            width: '100%',
            padding: '0.55rem 0.75rem',
            border: '1px solid var(--ds-border)',
            borderRadius: 6,
            fontSize: '0.9rem',
            background: 'var(--ds-page-bg)',
            color: 'var(--ds-text)',
          }}
        />
      </div>

      <SubmitButton />
    </form>
  )
}
