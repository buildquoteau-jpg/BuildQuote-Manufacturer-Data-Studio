'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadWidget } from './UploadWidget'
import { AddUrlWidget } from './AddUrlWidget'

interface Props {
  manufacturerId: string
}

type Mode = 'upload' | 'url'

export function DocumentsClient({ manufacturerId }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('upload')

  function handleUploaded() {
    router.refresh()
  }

  return (
    <div>
      {/* Source toggle: upload files vs add from a URL */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setMode('upload')}
          className={`studio-btn ${mode === 'upload' ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
          style={{ fontSize: '0.82rem' }}
        >
          Upload files
        </button>
        <button
          onClick={() => setMode('url')}
          className={`studio-btn ${mode === 'url' ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
          style={{ fontSize: '0.82rem' }}
        >
          Add from URL
        </button>
      </div>

      {mode === 'upload' ? (
        <UploadWidget manufacturerId={manufacturerId} onUploaded={handleUploaded} />
      ) : (
        <AddUrlWidget manufacturerId={manufacturerId} onAdded={handleUploaded} />
      )}
    </div>
  )
}
