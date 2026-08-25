'use client'

// Evidence-group bulk verification — design doc §9.2 workload-killer #1:
// "Facts are grouped by the page they came from ... one click clears nine
// facts, because a person who wrote the page can confirm the page." Sits
// above the accordion sections, only rendering groups where two or more
// still-unverified facts share the same source document + page. Individual
// facts stay reachable and reviewable in their normal sections below — this
// is a shortcut for the common case, not a replacement for the fact rows.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkVerifyAssertions } from '@/lib/studio-manufacturer/assertion-actions'
import type { FactViewModel } from './factViewModel'

function groupKey(f: FactViewModel): string {
  return `${f.sourceDocumentId}::${f.sourcePageNumber}`
}

export function EvidenceGroupBulkVerify({
  facts, systemId, manufacturerId, onChanged,
}: {
  facts: FactViewModel[]
  systemId: string
  manufacturerId: string
  onChanged?: () => void
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const groups = new Map<string, FactViewModel[]>()
  for (const f of facts) {
    if (!f.sourceDocumentId || !f.sourcePageNumber) continue
    if (f.epistemicStatus !== 'unverified' && f.epistemicStatus !== 'stale') continue
    const key = groupKey(f)
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }

  const entries = Array.from(groups.entries())
    .filter(([key, list]) => list.length >= 2 && !dismissed.has(key))

  if (entries.length === 0) return null

  return (
    <div style={{ marginBottom: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {entries.map(([key, list]) => (
        <EvidenceGroupCard
          key={key}
          groupKey={key}
          facts={list}
          expanded={expanded.has(key)}
          onToggleExpand={() => setExpanded((s) => toggle(s, key))}
          onDismiss={() => setDismissed((s) => new Set(s).add(key))}
          systemId={systemId}
          manufacturerId={manufacturerId}
          onChanged={onChanged}
        />
      ))}
    </div>
  )
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function EvidenceGroupCard({
  facts, expanded, onToggleExpand, onDismiss, systemId, manufacturerId, onChanged,
}: {
  groupKey: string
  facts: FactViewModel[]
  expanded: boolean
  onToggleExpand: () => void
  onDismiss: () => void
  systemId: string
  manufacturerId: string
  onChanged?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const sourceLine = facts[0].sourceLine ?? `page ${facts[0].sourcePageNumber}`

  function allCorrect() {
    setError(null)
    startTransition(async () => {
      const res = await bulkVerifyAssertions(
        systemId, manufacturerId,
        facts.map((f) => ({ predicate: f.predicate, claimType: f.claimType, objectValue: f.rawValue, origin: f.origin })),
      )
      if (!res.ok) {
        const failed = res.results.filter((r) => !r.ok)
        setError(`${failed.length} of ${facts.length} could not be verified: ${failed[0]?.error ?? 'unknown error'}`)
      } else {
        setDone(true)
        onChanged?.()
        router.refresh()
      }
    })
  }

  if (done) return null

  return (
    <div style={{
      border: '1px solid var(--ds-brand-subtle, #bfdbfe)', background: '#eff6ff', borderRadius: 10, padding: '0.8rem 1rem',
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ds-text, #0f172a)' }}>
        📄 {sourceLine} — {facts.length} facts extracted
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #4b5563)', marginTop: '0.35rem' }}>
        {expanded
          ? facts.map((f) => `${f.label} — ${f.value}`).join(' · ')
          : facts.slice(0, 4).map((f) => f.label).join(' · ') + (facts.length > 4 ? ` · +${facts.length - 4} more` : '')}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={allCorrect} disabled={pending}
          style={{
            padding: '0.35rem 0.75rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff',
            fontSize: '0.78rem', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1,
          }}>
          {pending ? 'Verifying…' : '✓ All correct'}
        </button>
        <button type="button" onClick={onToggleExpand} disabled={pending}
          style={{
            padding: '0.35rem 0.75rem', borderRadius: 6, border: '1.5px solid #bfdbfe', background: '#fff', color: '#1d4ed8',
            fontSize: '0.78rem', fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
          }}>
          {expanded ? 'Show less' : 'Review individually'}
        </button>
        {expanded && (
          <button type="button" onClick={onDismiss} disabled={pending}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', color: '#374151',
              fontSize: '0.78rem', fontWeight: 600, cursor: pending ? 'not-allowed' : 'pointer',
            }}>
            Dismiss — I&apos;ll handle these below
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
