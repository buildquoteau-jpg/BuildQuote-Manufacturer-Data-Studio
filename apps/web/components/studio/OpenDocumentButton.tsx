'use client'

import { useState, useTransition } from 'react'
import { getDocumentDownloadUrl } from '@/lib/studio-manufacturer/document-actions'

interface Props {
  documentId: string
  manufacturerId: string
  /** 'link' renders as a plain text link, 'button' as a styled button */
  variant?: 'link' | 'button'
}

export function OpenDocumentButton({ documentId, manufacturerId, variant = 'button' }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpen() {
    setError(null)
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(documentId, manufacturerId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.open(result.downloadUrl, '_blank', 'noopener,noreferrer')
    })
  }

  if (variant === 'link') {
    return (
      <span>
        <button
          onClick={handleOpen}
          disabled={isPending}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: isPending ? 'default' : 'pointer',
            color: '#185D7A',
            fontWeight: 600,
            fontSize: '0.75rem',
            textDecoration: 'underline',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Opening…' : 'Open'}
        </button>
        {error && (
          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#991b1b' }}>
            {error}
          </span>
        )}
      </span>
    )
  }

  return (
    <span>
      <button
        onClick={handleOpen}
        disabled={isPending}
        className="studio-btn studio-btn-ghost"
        style={{ fontSize: '0.78rem' }}
      >
        {isPending ? 'Opening…' : 'Open ↗'}
      </button>
      {error && (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#991b1b' }}>
          {error}
        </span>
      )}
    </span>
  )
}
