'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function EnterInviteCodePage() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = input.trim()
    if (!trimmed) {
      setError('Paste your invitation link or code to continue.')
      return
    }
    // Accept either a full URL (https://studio.buildquote.com.au/invite/<code>) or the bare code
    const match = trimmed.match(/\/invite\/([^/?#]+)/i)
    const code = match ? decodeURIComponent(match[1]) : trimmed
    router.push(`/invite/${encodeURIComponent(code)}`)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #185D7A 0%, #1a7a9e 100%)',
            padding: '1.75rem 2rem',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
            BuildQuote Data Studio
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.35rem 0 0', color: '#ffffff' }}>
            Enter Workspace Invitation Code
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.75rem 2rem 2rem' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: 0, lineHeight: 1.55 }}>
            Paste the invitation code or full invite link sent by BuildQuote to unlock your manufacturer workspace.
          </p>

          <label
            htmlFor="invite-code"
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#475569',
              marginBottom: '0.35rem',
            }}
          >
            Invitation code or link
          </label>
          <input
            id="invite-code"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste invitation code or https://studio.buildquote.com.au/invite/…"
            autoFocus
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              border: error ? '1.5px solid #dc2626' : '1.5px solid #cbd5e1',
              borderRadius: 8,
              fontSize: '0.88rem',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: '0.45rem 0 0', fontWeight: 600 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: '1rem',
              padding: '0.7rem 1rem',
              border: 'none',
              borderRadius: 8,
              background: '#185D7A',
              color: '#fff',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Continue to workspace →
          </button>

          <div style={{ marginTop: '1.1rem', textAlign: 'center', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.6 }}>
            <div>
              Already have a workspace account?{' '}
              <a href="/login" style={{ color: '#185D7A', fontWeight: 700, textDecoration: 'none' }}>
                Sign in
              </a>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              Need an invite code?{' '}
              <a
                href="mailto:hello@buildquote.com.au?subject=BuildQuote%20Data%20Studio%20Invitation%20Code%20Request"
                style={{ color: '#185D7A', fontWeight: 700, textDecoration: 'none' }}
              >
                Request manufacturer access
              </a>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
