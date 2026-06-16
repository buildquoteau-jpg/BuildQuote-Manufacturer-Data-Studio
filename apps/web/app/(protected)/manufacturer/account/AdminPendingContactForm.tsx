'use client'

// Admin-only view of the "User profile" page, shown while browsing a
// manufacturer workspace via the admin gate (see manufacturer/layout.tsx
// impersonation banner).
//
// This intentionally does NOT touch data_studio_user_profiles, sign-in email,
// or password — those belong to whichever real auth account is signed in
// (the admin's own), and editing them here would silently change the
// admin's own login instead of anything belonging to the manufacturer. See
// pending-contact-actions.ts for why these fields live on
// data_studio_manufacturers instead.

import { useState, useTransition } from 'react'
import {
  savePendingContact,
  type PendingContactFields,
  type LoginPreference,
} from '@/lib/studio-admin/pending-contact-actions'

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

const radioRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.5rem',
  fontSize: '0.85rem', color: 'var(--ds-text)', cursor: 'pointer', marginBottom: '0.4rem',
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

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--ds-navy)'
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = 'var(--ds-border)'
}

export function AdminPendingContactForm({
  manufacturerId,
  manufacturerName,
  initialValues,
}: {
  manufacturerId: string
  manufacturerName: string
  initialValues: PendingContactFields
}) {
  const [fields, setFields] = useState<PendingContactFields>(initialValues)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function setText(key: 'full_name' | 'email_primary' | 'email_secondary') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setFields(prev => ({ ...prev, [key]: e.target.value }))
      setSaved(false)
    }
  }

  function setPreference(pref: LoginPreference) {
    setFields(prev => ({ ...prev, login_preference: pref }))
    setSaved(false)
  }

  function handleSave() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await savePendingContact(manufacturerId, fields)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

      {/* Notice — what this page is and isn't */}
      <div style={{
        padding: '0.9rem 1.1rem', background: '#fffbeb', border: '1.5px solid #fde68a',
        borderRadius: 10, fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5,
      }}>
        You're pre-filling the authorised verifier details for <strong>{manufacturerName}</strong> ahead
        of their first login. This is saved against their workspace, not your own admin account — no
        account is created and no email is sent. They'll see these details ready to go once they sign in.
      </div>

      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Authorised verifier</div>

        <Field
          label="Full name"
          hint="Name of the person authorised to verify and approve this manufacturer's system cards."
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

      <section style={cardStyle}>
        <div style={sectionLabelStyle}>Company emails</div>

        <Field label="Company email" hint="Primary company email address.">
          <input
            type="email"
            value={fields.email_primary ?? ''}
            onChange={setText('email_primary')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="jane@theirbrand.com.au"
            style={inputStyle}
          />
        </Field>

        <Field label="Second company email" hint="An alternate company email address.">
          <input
            type="email"
            value={fields.email_secondary ?? ''}
            onChange={setText('email_secondary')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="info@theirbrand.com.au"
            style={inputStyle}
          />
        </Field>

        <Field
          label="Preferred email for login"
          hint="Which company email they'll likely use to sign in once their account exists."
        >
          <label style={radioRow}>
            <input
              type="radio"
              name="pending_login_preference"
              checked={fields.login_preference === 'primary'}
              onChange={() => setPreference('primary')}
              style={{ accentColor: '#185D7A', cursor: 'pointer' }}
            />
            <span>{fields.email_primary?.trim() || 'Primary company email'}</span>
          </label>
          <label style={radioRow}>
            <input
              type="radio"
              name="pending_login_preference"
              checked={fields.login_preference === 'secondary'}
              onChange={() => setPreference('secondary')}
              style={{ accentColor: '#185D7A', cursor: 'pointer' }}
            />
            <span>{fields.email_secondary?.trim() || 'Second company email'}</span>
          </label>
        </Field>
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={pending}
          style={{
            padding: '0.6rem 1.5rem', borderRadius: 8, border: 'none',
            background: pending ? '#9ca3af' : '#185D7A', color: '#fff',
            fontSize: '0.875rem', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
          }}
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
        {saved && <span style={{ fontSize: '0.875rem', color: '#16a34a', fontWeight: 600 }}>Saved</span>}
        {error && <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>{error}</span>}
      </div>
    </div>
  )
}
