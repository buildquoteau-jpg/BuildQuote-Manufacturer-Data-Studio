'use client'

import { useEffect, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/browser'

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
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
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.83rem',
  fontWeight: 600,
  marginBottom: '0.4rem',
  color: 'var(--ds-text-sub)',
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  // The recovery link establishes a session in the URL; detect it on mount.
  useEffect(() => {
    const supabase = getBrowserSupabaseClient()
    if (!supabase) {
      setError('Studio is not configured. Contact BuildQuote.')
      return
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    const supabase = getBrowserSupabaseClient()
    if (!supabase) { setError('Studio is not configured. Contact BuildQuote.'); return }

    setPending(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (updErr) {
      const msg = updErr.message.toLowerCase()
      if (msg.includes('different')) setError('New password must be different from your current one.')
      else if (msg.includes('session') || msg.includes('expired') || msg.includes('jwt')) {
        setError('This reset link has expired. Please request a new one.')
      } else setError('Could not update your password. Please try again.')
      return
    }
    setDone(true)
    setTimeout(() => { window.location.href = '/login' }, 2500)
  }

  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
        padding: '1.5rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #185D7A 0%, #1a7a9e 100%)', padding: '2rem 2rem 1.75rem', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.15)', marginBottom: '1rem', fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
            BQ
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: '0 0 0.3rem' }}>
            Set a new password
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            BuildQuote Data Studio
          </p>
        </div>

        <div style={{ padding: '1.75rem 2rem 2rem' }}>
          {done ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.9rem 1rem', fontSize: '0.9rem', color: '#166534' }}>
              Password updated. Redirecting you to sign in…
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              {error && (
                <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.875rem', color: '#dc2626', marginBottom: '1.1rem' }}>
                  {error}
                </div>
              )}
              {!ready && !error && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '0.7rem 1rem', fontSize: '0.83rem', color: '#92400e', marginBottom: '1.1rem' }}>
                  Open this page from the reset link in your email. If you arrived here directly, request a new link from the portal.
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="new-password" style={labelStyle}>New password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--ds-text-faint)', display: 'flex', alignItems: 'center', lineHeight: 1 }}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="confirm-password" style={labelStyle}>Confirm new password</label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={pending || !ready}
                style={{ width: '100%', padding: '0.7rem 1rem', background: (pending || !ready) ? '#94a3b8' : 'var(--ds-navy)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.95rem', fontWeight: 600, cursor: (pending || !ready) ? 'not-allowed' : 'pointer' }}
              >
                {pending ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
        <a href="/login" style={{ color: 'rgba(255,255,255,0.7)' }}>Back to sign in</a>
      </p>
    </div>
  )
}
