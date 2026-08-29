'use client'

// Applications & installation — design doc §7.3. The read side: every
// installation/application/performance fact the knowledge parser has
// extracted for this system, plus any company-wide answer (Company
// Knowledge panel, design doc §9.2) inherited onto it — same FactRow used
// by Identity and Attributes above, one mental model everywhere. Company-
// wide facts render read-only here (fixing/correcting one changes every
// card, so that only happens from the Brand profile's Company Knowledge
// panel, not from inside one system's workspace).

import { useState } from 'react'
import { FactRow } from './FactRow'
import type { FactViewModel } from './factViewModel'

export function ApplicationsSection({
  manufacturerId, manufacturerName, stagedSystemId, sourceDocumentId, facts,
}: {
  manufacturerId: string
  manufacturerName: string
  stagedSystemId: string
  sourceDocumentId: string | null
  facts: FactViewModel[]
}) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function run(dryRun: boolean) {
    if (!sourceDocumentId) return
    setState('running')
    setMessage(null)
    try {
      const res = await fetch('/api/pipeline/run-knowledge-parser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturerId, manufacturerName, stagedSystemId,
          sourceDocumentId, dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setState('error')
        setMessage(data.error ?? 'Could not start extraction.')
        return
      }
      setState('done')
      setMessage(
        dryRun
          ? `Dry run started (job ${data.jobId}) — check the Pipeline page for the extracted plan.`
          : `Extraction started (job ${data.jobId}) — refresh this page in a minute or two to see the facts land.`,
      )
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : 'Could not start extraction.')
    }
  }

  return (
    <div>
      {facts.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          {facts.map((f) => (
            <FactRow
              key={`${f.predicate}-${f.sourceDocumentId ?? 'company'}`}
              label={f.isCompanyLevel ? `${f.label} · Company-wide` : f.label}
              predicate={f.predicate} claimType={f.claimType}
              value={f.value} rawValue={f.rawValue} origin={f.origin} epistemicStatus={f.epistemicStatus}
              sourceLine={f.sourceLine} systemId={stagedSystemId} manufacturerId={manufacturerId}
              readOnly={f.isCompanyLevel}
            />
          ))}
        </div>
      )}

      {!sourceDocumentId && facts.length === 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
          Link a source document to this system (Documents tab) before extracting installation
          and application facts from it.
        </p>
      )}

      {sourceDocumentId && (
        <div style={{ borderTop: facts.length > 0 ? '1px solid var(--ds-border, #e5e7eb)' : 'none', paddingTop: facts.length > 0 ? '0.8rem' : 0 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0 0 0.6rem', lineHeight: 1.55 }}>
            {facts.length > 0
              ? 'Re-run the knowledge parser if you’ve updated the linked source document.'
              : 'Installation methods, fixing requirements and applications aren’t extracted for this system yet. Run the knowledge parser over its linked source document to pull them out — each fact will carry its page and verbatim source text, same as the sections above.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => run(true)} disabled={state === 'running'}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: state === 'running' ? 'not-allowed' : 'pointer', opacity: state === 'running' ? 0.5 : 1 }}>
              Preview (dry run)
            </button>
            <button type="button" onClick={() => run(false)} disabled={state === 'running'}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: state === 'running' ? 'not-allowed' : 'pointer', opacity: state === 'running' ? 0.5 : 1 }}>
              {state === 'running' ? 'Starting…' : facts.length > 0 ? 'Re-extract' : 'Extract now'}
            </button>
          </div>
          {message && (
            <div style={{ fontSize: '0.8rem', marginTop: '0.6rem', color: state === 'error' ? '#b91c1c' : '#16a34a' }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
