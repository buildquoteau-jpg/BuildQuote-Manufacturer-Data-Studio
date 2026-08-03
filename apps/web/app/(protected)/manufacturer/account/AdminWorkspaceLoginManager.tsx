'use client'

// Admin-only: create and manage the real Studio login(s) for a manufacturer
// workspace, shown on the "User profile" page while an admin is browsing the
// workspace via the gate. This is the counterpart to AdminPendingContactForm —
// the pending-contact fields are a pre-fill; this is where a working account
// with a temporary email + password is actually created.
//
// No verification email is ever sent: createManufacturerLogin uses
// email_confirm: true server-side, so the user can sign in immediately.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  createManufacturerLogin,
  resetManufacturerLoginPassword,
  setManufacturerLoginStatus,
  type WorkspaceLogin,
  type WorkspaceLoginRole,
} from '@/lib/studio-admin/manufacturer-login-actions'

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--ds-text-sub)',
  marginBottom: '0.3rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '0.6rem 1.5rem',
  borderRadius: 8,
  border: 'none',
  background: disabled ? '#9ca3af' : '#185D7A',
  color: '#fff',
  fontSize: '0.875rem',
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
})

const ghostBtn: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: 7,
  border: '1.5px solid var(--ds-border)',
  background: '#fff',
  color: 'var(--ds-text-sub)',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const ROLE_OPTIONS: { value: WorkspaceLoginRole; label: string }[] = [
  { value: 'manufacturer_admin', label: 'Admin — full workspace access' },
  { value: 'manufacturer_reviewer', label: 'Reviewer — can verify, cannot manage users' },
  { value: 'manufacturer_viewer', label: 'Viewer — read only' },
]

function generatePassword(): string {
  // Readable temporary password: 3 lowercase + 4 digits + 3 lowercase, no ambiguous chars.
  // Uses the CSPRNG — Math.random() is predictable and this value is a credential.
  const letters = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const pick = (set: string, n: number) => {
    const bytes = new Uint32Array(n)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => set[b % set.length]).join('')
  }
  return `${pick(letters, 3)}-${pick(digits, 4)}-${pick(letters, 3)}`
}

function roleLabel(role: WorkspaceLoginRole): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label.split(' — ')[0] ?? role
}

export function AdminWorkspaceLoginManager({
  manufacturerId,
  manufacturerName,
  logins,
  defaultEmail,
  defaultFullName,
}: {
  manufacturerId: string
  manufacturerName: string
  logins: WorkspaceLogin[]
  defaultEmail: string
  defaultFullName: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Create form
  const [email, setEmail] = useState(defaultEmail)
  const [fullName, setFullName] = useState(defaultFullName)
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<WorkspaceLoginRole>('manufacturer_admin')
  const [error, setError] = useState<string | null>(null)
  const [createdBanner, setCreatedBanner] = useState<{ email: string; password: string } | null>(null)

  // Per-row reset state
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetDone, setResetDone] = useState<{ email: string; password: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function handleCreate() {
    setError(null)
    setCreatedBanner(null)
    if (!email.trim() || !password.trim()) {
      setError('Email and a temporary password are both required.')
      return
    }
    const submitted = { email: email.trim(), password: password.trim() }
    startTransition(async () => {
      const res = await createManufacturerLogin(manufacturerId, {
        email: submitted.email,
        password: submitted.password,
        fullName: fullName.trim() || null,
        role,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setCreatedBanner(submitted)
      setPassword('')
      router.refresh()
    })
  }

  function handleReset(authUserId: string, loginEmail: string) {
    setRowError(null)
    setResetDone(null)
    if (resetPassword.trim().length < 8) {
      setRowError('Password must be at least 8 characters.')
      return
    }
    const pw = resetPassword.trim()
    startTransition(async () => {
      const res = await resetManufacturerLoginPassword(manufacturerId, authUserId, pw)
      if (!res.ok) {
        setRowError(res.error)
        return
      }
      setResetDone({ email: loginEmail, password: pw })
      setResetFor(null)
      setResetPassword('')
      router.refresh()
    })
  }

  function handleToggleStatus(authUserId: string, next: 'active' | 'suspended') {
    setRowError(null)
    startTransition(async () => {
      const res = await setManufacturerLoginStatus(manufacturerId, authUserId, next)
      if (!res.ok) {
        setRowError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <section style={cardStyle}>
      <div style={sectionLabelStyle}>Workspace login</div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 1.25rem' }}>
        Create a real sign-in for {manufacturerName}. Set a temporary email and password — the account
        is activated immediately with no verification email, so they can sign in at{' '}
        <code>/login</code> right away and change their password later.
      </p>

      {/* Existing logins */}
      {logins.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {logins.map((l) => {
            const suspended = l.membershipStatus !== 'active'
            return (
              <div
                key={l.membershipId}
                style={{
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 9,
                  padding: '0.85rem 1rem',
                  background: suspended ? '#fafafa' : '#fff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ds-text)' }}>
                      {l.email}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--ds-text-muted)', marginTop: '0.15rem' }}>
                      {l.fullName ? `${l.fullName} · ` : ''}
                      {roleLabel(l.role)}
                      {' · '}
                      <span style={{ color: suspended ? '#b45309' : '#16a34a', fontWeight: 600 }}>
                        {suspended ? 'Suspended' : 'Active'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      disabled={pending || !l.authUserId}
                      style={ghostBtn}
                      onClick={() => {
                        setResetDone(null)
                        setRowError(null)
                        setResetPassword(generatePassword())
                        setResetFor(resetFor === l.membershipId ? null : l.membershipId)
                      }}
                    >
                      Set new password
                    </button>
                    <button
                      type="button"
                      disabled={pending || !l.authUserId}
                      style={ghostBtn}
                      onClick={() =>
                        l.authUserId &&
                        handleToggleStatus(l.authUserId, suspended ? 'active' : 'suspended')
                      }
                    >
                      {suspended ? 'Reactivate' : 'Suspend'}
                    </button>
                  </div>
                </div>

                {resetFor === l.membershipId && l.authUserId && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 180, fontFamily: 'monospace' }}
                    />
                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() => setResetPassword(generatePassword())}
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      style={primaryBtn(pending)}
                      onClick={() => handleReset(l.authUserId!, l.email)}
                    >
                      {pending ? 'Saving…' : 'Save password'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {resetDone && (
        <CredentialBanner
          title="Password updated"
          email={resetDone.email}
          password={resetDone.password}
          onDismiss={() => setResetDone(null)}
        />
      )}
      {rowError && (
        <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0 0 1rem' }}>{rowError}</p>
      )}

      {/* Create form */}
      <div style={{ borderTop: logins.length > 0 ? '1px solid var(--ds-border-soft)' : 'none', paddingTop: logins.length > 0 ? '1.25rem' : 0 }}>
        {logins.length > 0 && (
          <div style={{ ...sectionLabelStyle, marginBottom: '0.85rem' }}>Add another login</div>
        )}

        {createdBanner && (
          <CredentialBanner
            title="Login created — share these credentials"
            email={createdBanner.email}
            password={createdBanner.password}
            onDismiss={() => setCreatedBanner(null)}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Sign-in email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@theirbrand.com.au"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Temporary password</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
              <button type="button" style={ghostBtn} onClick={() => setPassword(generatePassword())}>
                Generate
              </button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Workspace role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as WorkspaceLoginRole)}
              style={inputStyle}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={handleCreate} disabled={pending} style={primaryBtn(pending)}>
            {pending ? 'Creating…' : 'Create login'}
          </button>
          {error && <span style={{ fontSize: '0.85rem', color: '#dc2626' }}>{error}</span>}
        </div>
      </div>
    </section>
  )
}

function CredentialBanner({
  title,
  email,
  password,
  onDismiss,
}: {
  title: string
  email: string
  password: string
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div
      style={{
        background: '#ecfdf5',
        border: '1.5px solid #a7f3d0',
        borderRadius: 10,
        padding: '0.9rem 1.1rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#065f46', marginBottom: '0.5rem', letterSpacing: '0.02em' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.85rem', color: '#065f46' }}>
        <div>
          <span style={{ opacity: 0.7 }}>Email: </span>
          <code>{email}</code>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>Password: </span>
          <code>{password}</code>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
        <button
          type="button"
          style={ghostBtn}
          onClick={() => {
            navigator.clipboard
              ?.writeText(`Email: ${email}\nPassword: ${password}\nSign in at /login`)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
              .catch(() => {})
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" style={ghostBtn} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
