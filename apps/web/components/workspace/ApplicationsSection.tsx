'use client'

// Applications & installation — grouped cleanly by source document with 1-click
// bulk approval (per guide or all at once) so a manufacturer with 40–80 extracted
// facts can confirm their own official guides in seconds and only open individual
// facts to edit outliers.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkVerifyAssertions } from '@/lib/studio-manufacturer/assertion-actions'
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
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [bulkPending, startBulk] = useTransition()
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const unverifiedSystemFacts = facts.filter(
    (f) => !f.isCompanyLevel && (f.epistemicStatus === 'unverified' || f.epistemicStatus === 'stale'),
  )

  // Group facts by source document name (stripping ", page X" suffix)
  const grouped = new Map<string, FactViewModel[]>()
  for (const f of facts) {
    const docTitle = f.isCompanyLevel
      ? 'Company-wide knowledge'
      : (f.sourceLine?.replace(/,\s*page\s+\d+$/i, '').trim() || 'Extracted technical facts')
    const list = grouped.get(docTitle) ?? []
    list.push(f)
    grouped.set(docTitle, list)
  }
  const groupEntries = Array.from(grouped.entries())

  function approveList(list: FactViewModel[]) {
    const targets = list.filter(
      (f) => !f.isCompanyLevel && (f.epistemicStatus === 'unverified' || f.epistemicStatus === 'stale'),
    )
    if (targets.length === 0) return
    setBulkError(null)
    startBulk(async () => {
      const res = await bulkVerifyAssertions(
        stagedSystemId,
        manufacturerId,
        targets.map((f) => ({
          assertionId: f.assertionId ?? null,
          predicate: f.predicate,
          claimType: f.claimType,
          objectValue: f.rawValue,
          origin: f.origin,
        })),
      )
      if (!res.ok) {
        const failed = res.results.filter((r) => !r.ok)
        setBulkError(`${failed.length} of ${targets.length} could not be approved: ${failed[0]?.error ?? 'unknown error'}`)
      } else {
        router.refresh()
      }
    })
  }

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
          {/* Top 1-click bulk approval bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap',
            padding: '0.6rem 0.75rem', borderRadius: 8, background: '#f8fafc', border: '1px solid var(--ds-border, #e5e7eb)',
            marginBottom: '0.75rem',
          }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #475569)' }}>
              <strong>{facts.length}</strong> facts across <strong>{groupEntries.length}</strong> source{groupEntries.length === 1 ? '' : 's'}
              {unverifiedSystemFacts.length > 0
                ? ` · ${unverifiedSystemFacts.length} awaiting confirmation`
                : ' · all confirmed ✓'}
            </div>
            {unverifiedSystemFacts.length > 0 && (
              <button
                type="button"
                disabled={bulkPending}
                onClick={() => approveList(unverifiedSystemFacts)}
                style={{
                  padding: '0.35rem 0.75rem', borderRadius: 6, border: 'none',
                  background: '#185D7A', color: '#fff', fontSize: '0.76rem', fontWeight: 700,
                  cursor: bulkPending ? 'default' : 'pointer',
                }}
              >
                {bulkPending ? 'Approving…' : `✓ Approve all (${unverifiedSystemFacts.length})`}
              </button>
            )}
          </div>
          {bulkError && <div style={{ fontSize: '0.76rem', color: '#b91c1c', marginBottom: '0.6rem' }}>{bulkError}</div>}

          {/* Collapsible per-document groups so 50+ facts stay tidy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {groupEntries.map(([docTitle, groupFacts]) => {
              const unverifiedInGroup = groupFacts.filter(
                (f) => !f.isCompanyLevel && (f.epistemicStatus === 'unverified' || f.epistemicStatus === 'stale'),
              )
              const isOpen = openGroups[docTitle] ?? (facts.length <= 8)
              return (
                <div key={docTitle} style={{ border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap',
                    padding: '0.55rem 0.75rem', background: '#fff',
                  }}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [docTitle]: !isOpen }))}
                      style={{
                        flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 700, color: '#0f172a',
                      }}
                    >
                      {isOpen ? '▾' : '▸'} {docTitle}{' '}
                      <span style={{ fontWeight: 500, color: '#64748b' }}>
                        ({groupFacts.length}{unverifiedInGroup.length > 0 ? ` · ${unverifiedInGroup.length} unverified` : ' · verified'})
                      </span>
                    </button>
                    {unverifiedInGroup.length > 0 && (
                      <button
                        type="button"
                        disabled={bulkPending}
                        onClick={() => approveList(unverifiedInGroup)}
                        style={{
                          padding: '0.25rem 0.6rem', borderRadius: 5, border: '1px solid #185D7A',
                          background: '#fff', color: '#185D7A', fontSize: '0.72rem', fontWeight: 700,
                          cursor: bulkPending ? 'default' : 'pointer',
                        }}
                      >
                        ✓ Approve guide ({unverifiedInGroup.length})
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0 0.75rem', borderTop: '1px solid var(--ds-border, #e5e7eb)' }}>
                      {groupFacts.map((f, idx) => (
                        <FactRow
                          key={f.assertionId ?? `${f.predicate}-${idx}`}
                          assertionId={f.assertionId}
                          label={f.isCompanyLevel ? `${f.label} · Company-wide` : f.label}
                          predicate={f.predicate} claimType={f.claimType}
                          value={f.value} rawValue={f.rawValue} origin={f.origin} epistemicStatus={f.epistemicStatus}
                          sourceLine={f.sourceLine} systemId={stagedSystemId} manufacturerId={manufacturerId}
                          readOnly={f.isCompanyLevel}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!sourceDocumentId && facts.length === 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0.4rem 0' }}>
          Link a source document to this system (Setup &amp; PDFs) before extracting installation
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
