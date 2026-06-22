'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBlankSystem } from '@/lib/studio-manufacturer/verification-actions'

export function CreateSystemButton({ manufacturerId }: { manufacturerId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const router = useRouter()

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createBlankSystem(manufacturerId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '7px 16px',
          borderRadius: '8px',
          border: '1.5px solid #185D7A',
          background: hovered && !pending ? '#185D7A' : '#fff',
          color: hovered && !pending ? '#fff' : '#185D7A',
          fontSize: '13px', fontWeight: 700,
          cursor: pending ? 'default' : 'pointer',
          opacity: pending ? 0.6 : 1,
          transition: 'background 0.15s, color 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1, marginTop: '-1px' }}>+</span>
        {pending ? 'Creating…' : 'Create a system'}
      </button>
      {error && (
        <div style={{ fontSize: '11px', color: '#dc2626' }}>{error}</div>
      )}
    </div>
  )
}
