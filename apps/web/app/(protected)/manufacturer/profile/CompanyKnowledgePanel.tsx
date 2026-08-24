'use client'

// Company Knowledge panel (design doc §9.2) — a handful of manufacturer-
// wide questions, answered once here and inherited by every one of this
// manufacturer's cards in the AI knowledge layer. Deliberately small and
// fixed (COMPANY_QUESTIONS) rather than an open-ended form — the workload-
// killer is exactly that there are only a few of these.

import { useEffect, useState, useTransition } from 'react'
import {
  COMPANY_QUESTIONS,
  getCompanyKnowledge,
  setCompanyAnswer,
  type CompanyQuestionKey,
} from '@/lib/studio-manufacturer/company-knowledge-actions'

export function CompanyKnowledgePanel({ manufacturerId }: { manufacturerId: string }) {
  const [answers, setAnswers] = useState<Record<string, string> | null>(null)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState<CompanyQuestionKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCompanyKnowledge(manufacturerId).then((res) => {
      if (res.ok) setAnswers(Object.fromEntries(res.answers.map((a) => [a.key, a.value])))
      else setAnswers({})
    })
  }, [manufacturerId])

  function save(key: CompanyQuestionKey, value: string) {
    setError(null)
    startTransition(async () => {
      const res = await setCompanyAnswer(manufacturerId, key, value)
      if (!res.ok) setError(res.error)
      else { setSaved(key); setTimeout(() => setSaved((s) => (s === key ? null : s)), 1500) }
    })
  }

  return (
    <div style={{
      marginTop: '2rem', padding: '1.4rem', background: '#fff',
      border: '1px solid var(--ds-border, #e5e7eb)', borderRadius: 10,
    }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>Company knowledge</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', margin: '0 0 1.1rem', lineHeight: 1.55 }}>
        Answer these once — every one of your products inherits them in the machine-readable knowledge layer,
        so an AI agent never has to guess your company-wide policies on a per-product basis.
      </p>

      {answers === null ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-faint)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {COMPANY_QUESTIONS.map((q) => (
            <div key={q.key}>
              <label style={{ display: 'block', fontSize: '0.83rem', fontWeight: 700, color: 'var(--ds-text)', marginBottom: '0.3rem' }}>
                {q.label}
                {saved === q.key && <span style={{ marginLeft: '0.5rem', fontSize: '0.74rem', fontWeight: 600, color: '#16a34a' }}>Saved</span>}
              </label>
              <textarea
                defaultValue={answers[q.key] ?? ''}
                placeholder={q.placeholder}
                rows={2}
                onBlur={(e) => save(q.key, e.target.value)}
                disabled={pending}
                style={{
                  width: '100%', padding: '0.5rem 0.7rem', border: '1.5px solid var(--ds-border, #d1d5db)',
                  borderRadius: 8, fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: '0.6rem' }}>{error}</div>}
    </div>
  )
}
