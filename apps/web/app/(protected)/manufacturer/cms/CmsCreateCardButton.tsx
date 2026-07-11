'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBlankSystem } from '@/lib/studio-manufacturer/verification-actions'

// Same action as the Verify-systems "Create a system" button, but lands the
// user straight in the CMS editor for the new card.
export function CmsCreateCardButton({ manufacturerId }: { manufacturerId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createBlankSystem(manufacturerId)
      if (!res.ok) { setError(res.error); return }
      router.push(`/manufacturer/cms/${res.id}`)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 18px', borderRadius: 8,
          border: '1.5px solid #185D7A', background: '#185D7A', color: '#fff',
          fontSize: '13px', fontWeight: 700,
          cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '-1px' }}>+</span>
        {pending ? 'Creating…' : 'New System Card'}
      </button>
      {error && <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>}
    </div>
  )
}
