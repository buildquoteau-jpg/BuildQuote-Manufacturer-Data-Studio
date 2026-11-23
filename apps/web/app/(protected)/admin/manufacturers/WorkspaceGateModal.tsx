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

type GeneratedInvite = {
  inviteUrl: string
  code: string
  expiresAt: string
  manufacturerName: string
  restrictedEmail: string | null
}

export function ManufacturersList({ manufacturers }: { manufacturers: Manufacturer[] }) {
  const [gating, setGating] = useState<Manufacturer | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Invite link modal state
  const [inviting, setInviting] = useState<Manufacturer | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDays, setInviteDays] = useState(30)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteErr, setInviteErr] = useState('')
  const [generated, setGenerated] = useState<GeneratedInvite | null>(null)
  const [copiedKey, setCopiedKey] = useState<'link' | 'email' | null>(null)

  useEffect(() => {
    if (gating) {
      setPassword('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [gating])

  function openInviteModal(m: Manufacturer) {
    setInviting(m)
    setInviteEmail('')
    setInviteDays(30)
    setInviteErr('')
    setGenerated(null)
    setCopiedKey(null)
  }

  async function handleGenerateInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviting) return
    setInviteBusy(true)
    setInviteErr('')
    try {
      const res = await fetch('/api/admin/manufacturer-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturerId: inviting.id,
          email: inviteEmail.trim() || undefined,
          ttlDays: inviteDays,
          role: 'manufacturer_admin',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setInviteErr(data.error || 'Could not generate invite link.')
        setInviteBusy(false)
        return
      }
      setGenerated({
        inviteUrl: data.inviteUrl,
        code: data.code,
        expiresAt: data.expiresAt,
        manufacturerName: data.manufacturerName,
        restrictedEmail: data.restrictedEmail ?? null,
      })
      setInviteBusy(false)
    } catch {
      setInviteErr('Network error. Please try again.')
      setInviteBusy(false)
    }
  }

  function buildInviteEmailText(inv: GeneratedInvite): string {
    const expStr = new Date(inv.expiresAt).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return [
      `Hi ${inv.manufacturerName} team,`,
      ``,
      `Your ${inv.manufacturerName} product workspace is ready to review and edit in BuildQuote Data Studio (powering Decks WA & BuildQuote).`,
      ``,
      `Open your direct workspace invitation link:`,
      inv.inviteUrl,
      ``,
      `From there you can set your password in 10 seconds and review or edit your Brand Profile, product System Cards, colours, specs, and Agent Ready checklist.`,
      ``,
      `This invitation link is valid until ${expStr}.`,
      ``,
      `Kind regards,`,
      `BuildQuote / Decks WA Team`,
    ].join('\n')
  }

  async function copyText(key: 'link' | 'email', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // Ignore clipboard failures
    }
  }

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
        window.location.href = '/manufacturer/start-here'
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
          <div
            key={m.id}
            style={{
              background: 'var(--ds-card-bg)',
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              padding: '0.85rem 1.15rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <button
              type="button"
              onClick={() => setGating(m)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                minWidth: 0,
                flex: '1 1 240px',
              }}
            >
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
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0, flexWrap: 'wrap' }}>
              <span
                className={`studio-badge studio-badge-${
                  m.status === 'active' ? 'approved' : 'draft'
                }`}
              >
                {m.status}
              </span>
              <button
                type="button"
                onClick={() => openInviteModal(m)}
                style={{
                  padding: '0.35rem 0.7rem',
                  borderRadius: 7,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#185D7A',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Invite link
              </button>
              <button
                type="button"
                onClick={() => setGating(m)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 7,
                  border: 'none',
                  background: '#185D7A',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Invite Manufacturer Modal */}
      {inviting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setInviting(null)
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: '1.75rem',
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#185D7A' }}>
                  Manufacturer Workspace Invitation
                </div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0 0' }}>
                  {inviting.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInviting(null)}
                aria-label="Close"
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                ×
              </button>
            </div>

            {!generated ? (
              <form onSubmit={handleGenerateInvite} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#475569', lineHeight: 1.5 }}>
                  Generate a signed invitation link so someone from <strong>{inviting.name}</strong> can create access in 10 seconds and edit their own workspace.
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', marginBottom: '0.3rem' }}>
                    Restrict to email (optional)
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Leave blank for any team member, or enter name@brand.com.au"
                    style={{
                      width: '100%',
                      padding: '0.58rem 0.78rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 8,
                      fontSize: '0.86rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', marginBottom: '0.3rem' }}>
                    Link expires after
                  </label>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setInviteDays(d)}
                        style={{
                          padding: '0.4rem 0.75rem',
                          borderRadius: 7,
                          border: inviteDays === d ? '1.5px solid #185D7A' : '1.5px solid #cbd5e1',
                          background: inviteDays === d ? '#185D7A' : '#fff',
                          color: inviteDays === d ? '#fff' : '#334155',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                </div>

                {inviteErr && (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
                    {inviteErr}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setInviting(null)}
                    style={{
                      flex: 1,
                      padding: '0.6rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 8,
                      background: '#fff',
                      color: '#64748b',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteBusy}
                    style={{
                      flex: 2,
                      padding: '0.6rem',
                      border: 'none',
                      borderRadius: 8,
                      background: inviteBusy ? '#94a3b8' : '#185D7A',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.86rem',
                      cursor: inviteBusy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {inviteBusy ? 'Creating invite link…' : 'Create invitation link'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>
                  Invitation link ready
                  {generated.restrictedEmail ? ` (locked to ${generated.restrictedEmail})` : ' (open to team)'}
                  {' · '}expires{' '}
                  {new Date(generated.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', marginBottom: '0.3rem' }}>
                    Direct workspace invitation link
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={generated.inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.7rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 8,
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      background: '#f8fafc',
                      color: '#0f172a',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                  <button
                    type="button"
                    onClick={() => copyText('link', generated.inviteUrl)}
                    style={{
                      padding: '0.6rem 0.8rem',
                      border: 'none',
                      borderRadius: 8,
                      background: copiedKey === 'link' ? '#16a34a' : '#185D7A',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedKey === 'link' ? 'Copied link ✓' : 'Copy invite link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('email', buildInviteEmailText(generated))}
                    style={{
                      padding: '0.6rem 0.8rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: 8,
                      background: copiedKey === 'email' ? '#f0fdf4' : '#fff',
                      color: copiedKey === 'email' ? '#166534' : '#1e293b',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedKey === 'email' ? 'Copied email ✓' : 'Copy invite email'}
                  </button>
                </div>

                <a
                  href={`mailto:${encodeURIComponent(generated.restrictedEmail ?? '')}?subject=${encodeURIComponent(`Your ${generated.manufacturerName} workspace on BuildQuote Data Studio`)}&body=${encodeURIComponent(buildInviteEmailText(generated))}`}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '0.55rem 0.8rem',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    color: '#185D7A',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    textDecoration: 'none',
                  }}
                >
                  Open pre-filled email draft ↗
                </a>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setGenerated(null)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Generate another
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviting(null)}
                    style={{ background: 'transparent', border: 'none', color: '#185D7A', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password modal (Admin gate) */}
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
