'use client'

// Top half: the actual JSON-LD blob, collapsible ("layered reveal"). Bottom
// half: the same blob as markdown. A human verifies/edits (via Verify
// systems — this page views, it doesn't re-implement fact editing) and
// signs off. Per the user's exact spec for this tab.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { JsonTreeView } from '@/components/agent-ready/JsonTreeView'
import { markAgentReadySignedOff, clearAgentReadySignOff } from '@/lib/studio-manufacturer/agent-ready-actions'
import type { KnowledgeObject } from '@/lib/knowledge/types'

export function AgentReadyClient({
  systemId,
  manufacturerId,
  systemName,
  knowledgeObject,
  markdown,
  signedOffAt,
  signedOffNotes,
}: {
  systemId: string
  manufacturerId: string
  systemName: string
  knowledgeObject: KnowledgeObject
  markdown: string
  signedOffAt: string | null
  signedOffNotes: string | null
}) {
  const [notes, setNotes] = useState('')
  const [signed, setSigned] = useState(!!signedOffAt)
  const [signedAt, setSignedAt] = useState(signedOffAt)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'json' | 'md' | null>(null)

  function signOff() {
    setError(null)
    startTransition(async () => {
      const res = await markAgentReadySignedOff(systemId, manufacturerId, notes || signedOffNotes)
      if (!res.ok) { setError(res.error); return }
      setSigned(true)
      setSignedAt(new Date().toISOString())
    })
  }

  function reopen() {
    setError(null)
    startTransition(async () => {
      const res = await clearAgentReadySignOff(systemId, manufacturerId)
      if (!res.ok) { setError(res.error); return }
      setSigned(false)
      setSignedAt(null)
    })
  }

  function copy(text: string, which: 'json' | 'md') {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const jsonText = JSON.stringify(knowledgeObject, null, 2)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.15rem', margin: 0, flex: 1, minWidth: 0 }}>{systemName} — Agent Ready</h1>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: signed ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${signed ? '#bbf7d0' : '#fde68a'}`,
          color: signed ? '#16a34a' : '#d97706',
        }}>
          {signed ? 'Signed off' : 'Needs review'}
        </span>
        <Link href={`/manufacturer/workspace/${systemId}`} style={{ fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', textDecoration: 'none' }}>
          Make changes in Verify systems →
        </Link>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 1rem', lineHeight: 1.6, maxWidth: 780 }}>
        This is exactly what an AI agent receives when it reads this System Card — every fact, its
        verification status, and where it came from. Review it below; if something needs fixing,
        correct it in Verify systems (the fields it&apos;s built from), then come back and sign off.
      </p>

      {/* Top half — JSON-LD, layered reveal */}
      <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--ds-border, #e5e7eb)',
          background: 'var(--ds-surface, rgba(255,255,255,0.03))',
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>JSON-LD (the actual blob)</span>
          <button
            type="button" onClick={() => copy(jsonText, 'json')}
            style={{ fontSize: '0.74rem', fontWeight: 600, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied === 'json' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <div style={{ padding: '0.9rem', maxHeight: 480, overflow: 'auto' }}>
          <JsonTreeView data={knowledgeObject} />
        </div>
      </div>

      {/* Bottom half — same blob, markdown */}
      <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, marginBottom: '1.2rem', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--ds-border, #e5e7eb)',
          background: 'var(--ds-surface, rgba(255,255,255,0.03))',
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Markdown (same information, human-readable)</span>
          <button
            type="button" onClick={() => copy(markdown, 'md')}
            style={{ fontSize: '0.74rem', fontWeight: 600, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied === 'md' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        <pre style={{
          margin: 0, padding: '0.9rem', maxHeight: 480, overflow: 'auto',
          fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
        }}>
          {markdown}
        </pre>
      </div>

      {/* Sign-off */}
      <div style={{
        border: `1.5px solid ${signed ? '#bbf7d0' : '#185D7A'}`, borderRadius: 10,
        padding: '1rem 1.1rem', background: signed ? '#f0fdf4' : '#fff',
      }}>
        {signed ? (
          <>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#166534', marginBottom: '0.3rem' }}>
              Signed off{signedAt ? ` — ${new Date(signedAt).toLocaleDateString('en-AU')}` : ''}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#166534', margin: '0 0 0.7rem' }}>
              You&apos;ve confirmed this knowledge object is accurate for AI agents to read and cite.
              Made a change since? Reopen it to sign off again.
            </p>
            <button type="button" onClick={reopen} disabled={pending}
              style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534', background: '#fff', border: '1.5px solid #bbf7d0', borderRadius: 8, padding: '7px 16px', cursor: pending ? 'default' : 'pointer' }}>
              {pending ? 'Reopening…' : 'Reopen for changes'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.3rem' }}>Sign off this knowledge object</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', margin: '0 0 0.6rem' }}>
              Confirm you&apos;ve reviewed the facts above and any corrections needed have been made in
              Verify systems.
            </p>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note — e.g. what you checked or changed"
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', border: '1.5px solid var(--ds-border, #d1d5db)', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', marginBottom: '0.7rem' }}
            />
            <button type="button" onClick={signOff} disabled={pending}
              style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', background: '#185D7A', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: pending ? 'default' : 'pointer' }}>
              {pending ? 'Signing off…' : 'Sign off — this is accurate'}
            </button>
          </>
        )}
        {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.6rem' }}>{error}</div>}
      </div>
    </div>
  )
}
