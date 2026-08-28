'use client'

// Manufacturer Response interface (design doc addendum §19-20). Structured,
// not one giant text box: an answer, what it applies to / doesn't apply to,
// a resolution type, and a required verification declaration before
// anything is written as a fact. Mirrors FactRow's run()/startTransition
// pattern for consistency with the rest of the workspace.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveKnowledgeGap, type ResolutionType } from '@/lib/studio-manufacturer/knowledge-gap-actions'

const RESOLUTION_OPTIONS: { value: ResolutionType; label: string; needsAnswer: boolean }[] = [
  { value: 'confirmed_yes', label: 'Confirmed — yes', needsAnswer: true },
  { value: 'confirmed_no', label: 'Confirmed — no', needsAnswer: true },
  { value: 'conditional', label: 'Conditional — yes, under conditions', needsAnswer: true },
  { value: 'info_not_available', label: 'Information not available', needsAnswer: false },
  { value: 'needs_review', label: 'Needs technical review (escalate)', needsAnswer: false },
]

export function KnowledgeGapResolutionForm({ gapId, manufacturerId }: { gapId: string; manufacturerId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resolutionType, setResolutionType] = useState<ResolutionType>('confirmed_yes')
  const [answer, setAnswer] = useState('')
  const [appliesTo, setAppliesTo] = useState('')
  const [doesNotApplyTo, setDoesNotApplyTo] = useState('')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const needsAnswer = RESOLUTION_OPTIONS.find((o) => o.value === resolutionType)?.needsAnswer ?? false
  const needsVerification = resolutionType === 'confirmed_yes' || resolutionType === 'confirmed_no' || resolutionType === 'conditional'
  const canSubmit = (!needsAnswer || answer.trim().length > 0) && (!needsVerification || verified)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await resolveKnowledgeGap(gapId, manufacturerId, {
        resolutionType,
        answer: answer.trim(),
        appliesTo: appliesTo.trim() || null,
        doesNotApplyTo: doesNotApplyTo.trim() || null,
        verified,
      })
      if (!res.ok) { setError(res.error); return }
      setDone(true)
      router.refresh()
    })
  }

  if (done) {
    return (
      <div style={{ padding: '1rem', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.88rem' }}>
        Response saved. This is now part of the product&apos;s verified knowledge.
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>Response</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {RESOLUTION_OPTIONS.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name="resolutionType" checked={resolutionType === o.value} onChange={() => setResolutionType(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      {needsAnswer && (
        <>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>Answer</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder="e.g. Yes, this board may be used as a tiled shower wall substrate when installed to the Installation Guide, subject to the specified waterproofing system."
              style={{ width: '100%', padding: '0.6rem 0.7rem', borderRadius: 8, border: '1.5px solid var(--ds-border, #d1d5db)', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Applies to (optional)</label>
              <input
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value)}
                placeholder="e.g. all profiles, wet areas"
                style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1.5px solid var(--ds-border, #d1d5db)', fontSize: '0.82rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Does not apply to (optional)</label>
              <input
                value={doesNotApplyTo}
                onChange={(e) => setDoesNotApplyTo(e.target.value)}
                placeholder="e.g. direct fix over foam insulation"
                style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: '1.5px solid var(--ds-border, #d1d5db)', fontSize: '0.82rem' }}
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', lineHeight: 1.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            I confirm this information is accurate for the current product as at today&apos;s date.
          </label>
        </>
      )}

      {error && <div style={{ fontSize: '0.82rem', color: '#b91c1c' }}>{error}</div>}

      <button
        type="submit"
        disabled={!canSubmit || pending}
        style={{
          alignSelf: 'flex-start', padding: '0.55rem 1.2rem', borderRadius: 8, border: 'none',
          background: '#185D7A', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
          cursor: !canSubmit || pending ? 'not-allowed' : 'pointer', opacity: !canSubmit || pending ? 0.5 : 1,
        }}
      >
        {pending ? 'Saving…' : 'Submit response'}
      </button>
    </form>
  )
}
