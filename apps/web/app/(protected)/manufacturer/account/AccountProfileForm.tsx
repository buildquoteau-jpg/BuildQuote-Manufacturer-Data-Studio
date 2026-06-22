'use client'

import { useState, useTransition } from 'react'
import {
  saveAccountProfile,
  changePassword,
  sendPasswordReset,
  updateLoginEmail,
  type AccountProfileFields,
} from '@/lib/studio-manufacturer/account-actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.7rem',
  border: '1.5px solid var(--ds-border)',
  borderRadius: 8,
  fontSize: '0.875rem',
  color: 'var(--ds-text)',
  background: '#fff',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--ds-border-soft)',
  borderRadius: 10,
  padding: '1.25rem 1.5rem',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--ds-text-faint)',
  marginBottom: '1rem',
}

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <label style={{
        display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ds-text-sub)',
        marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>{hint}</p>
      )}
    </div>
  )
}

export function AccountProfileForm({
  signInEmail,
  initialValues,
}: {
  signInEmail: string
  initialValues: AccountProfileFields
}) {
  const [fields, setFields] = useState<AccountProfileFields>({
    full_name:               initialValues.full_name ?? '',
    company_email_primary:   initialValues.company_email_primary ?? '',
    company_email_secondary: initialValues.company_email_secondary ?? '',
    login_email_preference:  initialValues.login_email_preference ?? 'primary',
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwPending, startPwTransition] = useTransition()

  // Reset email state
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetErr, setResetErr] = useState<string | null>(null)
  const [resetPending, startResetTransition] = useTransition()

  // Change sign-in email state
  const [newLoginEmail, setNewLoginEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [emailErr, setEmailErr] = useState<string | null>(null)
  const [emailPending, startEmailTransition] = useTransition()

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-navy)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-border)'
  }

  function setText(key: 'full_name' | 'company_email_primary' | 'company_email_secondary') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setFields(prev => ({ ...prev, [key]: e.target.value }))
      setSaved(false)
    }
  }

  function handleSaveProfile() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await saveAccountProfile({
        full_name:               fields.full_name || null,
        company_email_primary:   fields.company_email_primary || null,
        company_email_secondary: fields.company_email_secondary || null,
        login_email_preference:  fields.login_email_preference,
      })
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  function handleChangePassword() {
    setPwError(null); setPwSaved(false)
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    startPwTransition(async () => {
      const res = await changePassword(newPassword)
      if (!res.ok) { setPwError(res.error); return }
      setPwSaved(true)
      setNewPassword(''); setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 4000)
    })
  }

  function handleSendReset() {
    setResetErr(null); setResetMsg(null)
    startResetTransition(async () => {
      const res = await sendPasswordReset()
      if (!res.ok) { setResetErr(res.error); return }
      setResetMsg(`Reset link sent to ${signInEmail}. Check your inbox.`)
    })
  }

  function handleUpdateEmail() {
    setEmailErr(null); setEmailMsg(null)
    startEmailTransition(async () => {
      const res = await updateLoginEmail(newLoginEmail)
      if (!res.ok) { setEmailErr(res.error); return }
      setEmailMsg(`Confirmation link sent to ${newLoginEmail.trim().toLowerCase()}. Click it to finish the change — until then you keep signing in with ${signInEmail}.`)
      setNewLoginEmail('')
    })
  }

  const radioRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.5rem',
    fontSize: '0.85rem', color: 'var(--ds-text)', cursor: 'pointer', marginBottom: '0.4rem',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

      {/* ── Authorised verifier ── */}
      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Authorised verifier</div>

        <Field
          label="Full name"
          hint="Name of the person authorised to verify and approve your system cards."
        >
          <input
            type="text"
            value={fields.full_name ?? ''}
            onChange={setText('full_name')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="Jane Smith"
            style={inputStyle}
          />
        </Field>
      </section>

      {/* ── Company emails ── */}
      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Company emails</div>

        <Field label="Company email" hint="Primary company email address.">
          <input
            type="email"
            value={fields.company_email_primary ?? ''}
            onChange={setText('company_email_primary')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="jane@yourbrand.com.au"
            style={inputStyle}
          />
        </Field>

        <Field label="Second company email" hint="An alternate company email address.">
          <input
            type="email"
            value={fields.company_email_secondary ?? ''}
            onChange={setText('company_email_secondary')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="info@yourbrand.com.au"
            style={inputStyle}
          />
        </Field>

        <Field
          label="Preferred email for login"
          hint="Which company email you’d normally use to sign in. This is recorded as a preference — to change the address you actually authenticate with, use “Sign-in email” below."
        >
          <label style={radioRow}>
            <input
              type="radio"
              name="login_email_preference"
              checked={fields.login_email_preference === 'primary'}
              onChange={() => { setFields(p => ({ ...p, login_email_preference: 'primary' })); setSaved(false) }}
              style={{ accentColor: '#185D7A', cursor: 'pointer' }}
            />
            <span>{fields.company_email_primary?.trim() || 'Primary company email'}</span>
          </label>
          <label style={radioRow}>
            <input
              type="radio"
              name="login_email_preference"
              checked={fields.login_email_preference === 'secondary'}
              onChange={() => { setFields(p => ({ ...p, login_email_preference: 'secondary' })); setSaved(false) }}
              style={{ accentColor: '#185D7A', cursor: 'pointer' }}
            />
            <span>{fields.company_email_secondary?.trim() || 'Second company email'}</span>
          </label>
        </Field>

      </section>

      {/* ── Sign-in email ── */}
      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Sign-in email</div>

        <div style={{
          marginBottom: '1.1rem', padding: '0.6rem 0.8rem', background: 'var(--ds-page-bg, #f8fafc)',
          border: '1px solid var(--ds-border-soft)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--ds-text-muted)',
        }}>
          You currently sign in with <strong style={{ color: 'var(--ds-text)' }}>{signInEmail}</strong>
        </div>

        <Field
          label="New sign-in email"
          hint="Enter your personal email to take over from the onboarding address. We’ll email a confirmation link to the new address — the change only takes effect once you click it."
        >
          <input
            type="email"
            value={newLoginEmail}
            onChange={(e) => { setNewLoginEmail(e.target.value); setEmailErr(null); setEmailMsg(null) }}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="you@personal-email.com"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleUpdateEmail}
            disabled={emailPending || !newLoginEmail.trim()}
            style={{
              padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
              background: (emailPending || !newLoginEmail.trim()) ? '#9ca3af' : '#185D7A', color: '#fff',
              fontSize: '0.875rem', fontWeight: 700, cursor: (emailPending || !newLoginEmail.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {emailPending ? 'Sending…' : 'Update sign-in email'}
          </button>
          {emailErr && <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{emailErr}</span>}
        </div>
        {emailMsg && (
          <p style={{ margin: '0.7rem 0 0', fontSize: '0.82rem', color: '#16a34a', fontWeight: 600, lineHeight: 1.5 }}>
            {emailMsg}
          </p>
        )}
      </section>

      {/* Save profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSaveProfile}
          disabled={pending}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
            background: pending ? '#9ca3af' : '#185D7A', color: '#fff',
            fontSize: '0.875rem', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : 'Save profile'}
        </button>
        {saved && <span style={{ fontSize: '0.875rem', color: '#16a34a', fontWeight: 600 }}>Saved</span>}
        {error && <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</span>}
      </div>

      {/* ── Password ── */}
      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Password</div>

        <Field label="New password" hint="At least 8 characters.">
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPwError(null); setPwSaved(false) }}
              onFocus={onFocus} onBlur={onBlur}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: '2.75rem' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              onMouseDown={(e) => e.preventDefault()}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: '0.7rem', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem',
                color: 'var(--ds-text-faint)', display: 'flex', alignItems: 'center', lineHeight: 1,
                zIndex: 1,
              }}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </Field>

        <Field label="Confirm new password">
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setPwError(null) }}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="••••••••"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleChangePassword}
            disabled={pwPending}
            style={{
              padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
              background: pwPending ? '#9ca3af' : '#185D7A', color: '#fff',
              fontSize: '0.875rem', fontWeight: 700, cursor: pwPending ? 'not-allowed' : 'pointer',
            }}
          >
            {pwPending ? 'Updating…' : 'Update password'}
          </button>
          {pwSaved && <span style={{ fontSize: '0.875rem', color: '#16a34a', fontWeight: 600 }}>Password updated</span>}
          {pwError && <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>{pwError}</span>}
        </div>

        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--ds-border-soft)' }}>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
            Prefer to reset via email? We’ll send a secure link to <strong>{signInEmail}</strong>.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleSendReset}
              disabled={resetPending}
              style={{
                padding: '0.55rem 1.3rem', borderRadius: 8,
                border: '1.5px solid #185D7A', background: '#fff', color: '#185D7A',
                fontSize: '0.85rem', fontWeight: 700, cursor: resetPending ? 'not-allowed' : 'pointer',
              }}
            >
              {resetPending ? 'Sending…' : 'Email me a reset link'}
            </button>
            {resetMsg && <span style={{ fontSize: '0.85rem', color: '#16a34a', fontWeight: 600 }}>{resetMsg}</span>}
            {resetErr && <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{resetErr}</span>}
          </div>
        </div>
      </section>
    </div>
  )
}
