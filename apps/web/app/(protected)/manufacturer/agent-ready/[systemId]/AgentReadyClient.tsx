'use client'

// Agent Ready detail page:
// 1) "Point Your Company AI Agent Here" card at the top — signed read-only URL,
//    ready-to-paste audit prompt, inline prompt for air-gapped agents, and
//    1-click .jsonld / .md downloads so a human doesn't have to wade through JSON.
// 2) Collapsible JSON-LD tree and Markdown preview below for technical review.
// 3) Manufacturer sign-off panel at the bottom.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { JsonTreeView } from '@/components/agent-ready/JsonTreeView'
import { markAgentReadySignedOff, clearAgentReadySignOff } from '@/lib/studio-manufacturer/agent-ready-actions'
import type { KnowledgeObject } from '@/lib/knowledge/types'

type CopyKey = 'json' | 'md' | 'url' | 'prompt-url' | 'prompt-inline' | null

export function AgentReadyClient({
  systemId,
  manufacturerId,
  manufacturerName,
  systemName,
  systemSlug,
  knowledgeObject,
  markdown,
  agentReviewJsonUrl,
  agentReviewMdUrl,
  signedOffAt,
  signedOffNotes,
}: {
  systemId: string
  manufacturerId: string
  manufacturerName: string
  systemName: string
  systemSlug: string
  knowledgeObject: KnowledgeObject
  markdown: string
  agentReviewJsonUrl: string
  agentReviewMdUrl: string
  signedOffAt: string | null
  signedOffNotes: string | null
}) {
  const [notes, setNotes] = useState('')
  const [signed, setSigned] = useState(!!signedOffAt)
  const [signedAt, setSignedAt] = useState(signedOffAt)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyKey>(null)
  const [endpointFmt, setEndpointFmt] = useState<'jsonld' | 'markdown'>('jsonld')
  const [showRawJson, setShowRawJson] = useState(false)
  const [showRawMd, setShowRawMd] = useState(true)

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

  function copy(text: string, which: CopyKey) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1800)
    })
  }

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const jsonText = JSON.stringify(knowledgeObject, null, 2)
  const activeAgentUrl = endpointFmt === 'jsonld' ? agentReviewJsonUrl : agentReviewMdUrl

  // Lightweight stats from the JSON-LD object for quick human orientation
  const rawObj = knowledgeObject as unknown as Record<string, unknown>
  const assertionsCount = Array.isArray(rawObj['bq:assertions']) ? rawObj['bq:assertions'].length : 0
  const gapsCount = Array.isArray(rawObj['bq:knowledgeGaps']) ? rawObj['bq:knowledgeGaps'].length : 0

  const auditPromptWithUrl = [
    `You are auditing a BuildQuote System Card knowledge object for "${systemName}" by ${manufacturerName}.`,
    '',
    `1. Fetch the live ${endpointFmt === 'jsonld' ? 'JSON-LD' : 'Markdown'} payload here:`,
    activeAgentUrl,
    '',
    `2. Cross-check every claim, dimension, span, bushfire (BAL) rating, warranty term, SKU/component, compatibility rule, and knowledge gap against our official ${manufacturerName} technical literature.`,
    '',
    '3. Reply with a concise audit report using these 3 sections:',
    '   - VERIFIED ACCURATE: key facts confirmed correct',
    '   - CORRECTIONS NEEDED: exact field name, current BuildQuote value, and our official value',
    '   - MISSING HIGH-VALUE SPECS: important technical specs or documents we should add before signing off',
  ].join('\n')

  const auditPromptInline = [
    `You are auditing a BuildQuote System Card knowledge object for "${systemName}" by ${manufacturerName}.`,
    `Cross-check every claim, dimension, span, bushfire (BAL) rating, warranty term, SKU/component, and knowledge gap below against our official ${manufacturerName} technical literature.`,
    '',
    'Reply with a concise audit report:',
    '- VERIFIED ACCURATE: key facts confirmed correct',
    '- CORRECTIONS NEEDED: exact field name, current BuildQuote value, and our official value',
    '- MISSING HIGH-VALUE SPECS: important technical specs or documents we should add before signing off',
    '',
    '--- BUILDQUOTE SYSTEM CARD KNOWLEDGE OBJECT ---',
    endpointFmt === 'jsonld' ? jsonText : markdown,
  ].join('\n')

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
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
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 1rem', lineHeight: 1.6, maxWidth: 820 }}>
        This is what AI agents receive when they read this System Card. You don&apos;t need to read the raw
        JSON yourself — point your company&apos;s own AI agent at the review link below to audit every spec
        against your official documentation in seconds.
      </p>

      {/* Hero card: Point Your Company AI Agent Here */}
      <div style={{
        border: '1.5px solid #185D7A',
        borderRadius: 12,
        padding: '1.1rem 1.2rem',
        marginBottom: '1.1rem',
        background: 'linear-gradient(180deg, #f3f9fc 0%, #ffffff 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#185D7A' }}>
              Automated Company Agent Audit · No JSON Reading Required
            </div>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0.15rem 0 0', color: '#0f2533' }}>
              Point your own AI agent at this System Card
            </h2>
          </div>
          <div style={{ display: 'inline-flex', background: '#e6f0f5', borderRadius: 8, padding: 3, gap: 2 }}>
            {(['jsonld', 'markdown'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setEndpointFmt(fmt)}
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: endpointFmt === fmt ? '#185D7A' : 'transparent',
                  color: endpointFmt === fmt ? '#fff' : '#334155',
                }}
              >
                {fmt === 'jsonld' ? 'JSON-LD' : 'Markdown'}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#334155', margin: '0 0 0.75rem', lineHeight: 1.55 }}>
          Give this read-only signed URL to your internal AI assistant (ChatGPT Enterprise, Claude, Microsoft
          Copilot, Gemini, or custom RAG/MCP agent). It stays live and updates automatically whenever you edit
          specs in <strong>Verify systems</strong> (valid 14 days, no login needed for your agent).
        </p>

        {/* Signed URL bar */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
          <input
            type="text"
            readOnly
            value={activeAgentUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Read-only agent review URL"
            style={{
              flex: '1 1 280px',
              fontSize: '0.76rem',
              fontFamily: 'ui-monospace, monospace',
              padding: '0.5rem 0.7rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
            }}
          />
          <button
            type="button"
            onClick={() => copy(activeAgentUrl, 'url')}
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.5rem 0.95rem',
              borderRadius: 8,
              border: 'none',
              background: '#185D7A',
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {copied === 'url' ? 'Copied URL ✓' : 'Copy Agent URL'}
          </button>
        </div>

        {/* One-click audit prompt & file download actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => copy(auditPromptWithUrl, 'prompt-url')}
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.48rem 0.9rem',
              borderRadius: 8,
              border: '1.5px solid #185D7A',
              background: '#fff',
              color: '#185D7A',
              cursor: 'pointer',
            }}
          >
            {copied === 'prompt-url' ? 'Copied Audit Prompt ✓' : '⚡ Copy Ready-to-Paste Audit Prompt'}
          </button>
          <button
            type="button"
            onClick={() => copy(auditPromptInline, 'prompt-inline')}
            style={{
              fontSize: '0.76rem',
              fontWeight: 600,
              padding: '0.48rem 0.85rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              cursor: 'pointer',
            }}
            title="Use if your company AI agent cannot browse external URLs"
          >
            {copied === 'prompt-inline' ? 'Copied Prompt + Data ✓' : 'Copy Prompt + Inline Data (offline agents)'}
          </button>
          <button
            type="button"
            onClick={() => downloadFile(jsonText, `${systemSlug}.knowledge.jsonld`, 'application/ld+json')}
            style={{
              fontSize: '0.76rem',
              fontWeight: 600,
              padding: '0.48rem 0.8rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            ↓ Download .jsonld
          </button>
          <button
            type="button"
            onClick={() => downloadFile(markdown, `${systemSlug}.knowledge.md`, 'text/markdown')}
            style={{
              fontSize: '0.76rem',
              fontWeight: 600,
              padding: '0.48rem 0.8rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            ↓ Download .md
          </button>
        </div>

        {/* Quick stats strip */}
        <div style={{
          marginTop: '0.8rem',
          paddingTop: '0.65rem',
          borderTop: '1px solid #dce8ef',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          fontSize: '0.75rem',
          color: '#475569',
        }}>
          <span><strong>{assertionsCount}</strong> structured assertions</span>
          <span><strong>{gapsCount}</strong> flagged knowledge gap{gapsCount === 1 ? '' : 's'}</span>
          <span>Live read-only feed · auto-updates when edited in Verify systems</span>
        </div>
      </div>

      {/* Human-readable Markdown (expanded by default) */}
      <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.6rem 0.9rem', borderBottom: showRawMd ? '1px solid var(--ds-border, #e5e7eb)' : 'none',
          background: 'var(--ds-surface, rgba(255,255,255,0.03))',
        }}>
          <button
            type="button"
            onClick={() => setShowRawMd((v) => !v)}
            style={{ fontSize: '0.78rem', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>{showRawMd ? '▾' : '▸'}</span>
            <span>Human-readable summary (Markdown)</span>
          </button>
          <button
            type="button" onClick={() => copy(markdown, 'md')}
            style={{ fontSize: '0.74rem', fontWeight: 600, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied === 'md' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        {showRawMd && (
          <pre style={{
            margin: 0, padding: '0.9rem', maxHeight: 440, overflow: 'auto',
            fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace',
          }}>
            {markdown}
          </pre>
        )}
      </div>

      {/* Raw JSON-LD (collapsible so humans don't have to wade through it) */}
      <div style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10, marginBottom: '1.2rem', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.6rem 0.9rem', borderBottom: showRawJson ? '1px solid var(--ds-border, #e5e7eb)' : 'none',
          background: 'var(--ds-surface, rgba(255,255,255,0.03))',
        }}>
          <button
            type="button"
            onClick={() => setShowRawJson((v) => !v)}
            style={{ fontSize: '0.78rem', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span>{showRawJson ? '▾' : '▸'}</span>
            <span>Raw JSON-LD blob (advanced / developer view)</span>
          </button>
          <button
            type="button" onClick={() => copy(jsonText, 'json')}
            style={{ fontSize: '0.74rem', fontWeight: 600, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied === 'json' ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
        {showRawJson && (
          <div style={{ padding: '0.9rem', maxHeight: 480, overflow: 'auto' }}>
            <JsonTreeView data={knowledgeObject} />
          </div>
        )}
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
              Confirm you (or your company&apos;s AI agent) have audited the facts above and any corrections
              needed have been made in Verify systems.
            </p>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note — e.g. audited by internal product agent, spans & BAL confirmed"
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
