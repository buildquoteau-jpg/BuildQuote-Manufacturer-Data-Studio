'use client'

// BuildQuote-staff triage action for a knowledge gap (design doc addendum
// §A6/§25) — for RETRIEVAL_GAP/SCHEMA_GAP rows especially, where the fix is
// a BuildQuote engineering/data-model task, not something a manufacturer can
// resolve by answering a question. Deliberately narrow: staff can mark a gap
// triaged/duplicate/out-of-scope/no-action, never write a knowledge_assertions
// row on a manufacturer's behalf — the manufacturer's own resolution flow
// (KnowledgeGapResolutionForm) is the only path that creates product facts.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setKnowledgeGapStatus } from '@/lib/studio-manufacturer/knowledge-gap-actions'

const OPTIONS: { value: 'TRIAGED' | 'NO_ACTION_REQUIRED' | 'DUPLICATE' | 'OUT_OF_SCOPE'; label: string }[] = [
  { value: 'TRIAGED', label: 'Triaged — routed for engineering/data follow-up' },
  { value: 'DUPLICATE', label: 'Duplicate of another gap' },
  { value: 'OUT_OF_SCOPE', label: 'Out of scope' },
  { value: 'NO_ACTION_REQUIRED', label: 'No action required' },
]

export function AdminGapTriageForm({ gapId }: { gapId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(status: typeof OPTIONS[number]['value']) {
    setError(null)
    startTransition(async () => {
      const res = await setKnowledgeGapStatus(gapId, status, notes.trim() || null)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Internal note (optional)"
        style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1.5px solid var(--ds-border, #d1d5db)', fontSize: '0.82rem', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            onClick={() => submit(o.value)}
            style={{
              padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid var(--ds-border, #d1d5db)',
              background: '#fff', color: '#374151', fontSize: '0.78rem', fontWeight: 600,
              cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.5 : 1,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c' }}>{error}</div>}
    </div>
  )
}
