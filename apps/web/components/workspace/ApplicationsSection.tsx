'use client'

// Applications & installation — design doc §7.3. Until the knowledge
// parser (task #7) has run for this system's source document, there is
// nothing here to show, honestly — this section's job for now is to let a
// manufacturer/admin trigger that extraction, not to fake data that
// doesn't exist. Facts land here automatically once assertions with
// claimType installation_method/installation_requirement/application exist
// (a future pass wires the read side once real data is flowing).

import { useState } from 'react'

export function ApplicationsSection({
  manufacturerId, manufacturerName, stagedSystemId, sourceDocumentId,
}: {
  manufacturerId: string
  manufacturerName: string
  stagedSystemId: string
  sourceDocumentId: string | null
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
          : `Extraction started (job ${data.jobId}) — check the Pipeline page for progress.`,
      )
    } catch (e) {
      setState('error')
      setMessage(e instanceof Error ? e.message : 'Could not start extraction.')
    }
  }

  if (!sourceDocumentId) {
    return (
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
        Link a source document to this system (Documents tab) before extracting installation
        and application facts from it.
      </p>
    )
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0 0 0.7rem', lineHeight: 1.55 }}>
        Installation methods, fixing requirements and applications aren&apos;t extracted for this
        system yet. Run the knowledge parser over its linked source document to pull them out —
        each fact will carry its page and verbatim source text, same as the Identity and Attributes
        sections above.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={() => run(true)} disabled={state === 'running'}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: state === 'running' ? 'not-allowed' : 'pointer', opacity: state === 'running' ? 0.5 : 1 }}>
          Preview (dry run)
        </button>
        <button type="button" onClick={() => run(false)} disabled={state === 'running'}
          style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: state === 'running' ? 'not-allowed' : 'pointer', opacity: state === 'running' ? 0.5 : 1 }}>
          {state === 'running' ? 'Starting…' : 'Extract now'}
        </button>
      </div>
      {message && (
        <div style={{ fontSize: '0.8rem', marginTop: '0.6rem', color: state === 'error' ? '#b91c1c' : '#16a34a' }}>
          {message}
        </div>
      )}
    </div>
  )
}
