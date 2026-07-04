'use client'

// Interactive bits of the Packages page: Generate / Regenerate and per-package
// ZIP download. Data display stays in the server page.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateCardPackage, downloadPackageZip } from '@/lib/studio-manufacturer/package-actions'

export function GeneratePackageButton({
  manufacturerId,
  canGenerate,
  readyCount,
  hasExistingPackage,
}: {
  manufacturerId: string
  canGenerate: boolean
  readyCount: number
  hasExistingPackage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [buildLog, setBuildLog] = useState<string[]>([])

  function generate() {
    setMessage(null)
    setBuildLog([])
    startTransition(async () => {
      const result = await generateCardPackage(manufacturerId)
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error })
        router.refresh()
        return
      }
      setMessage({
        kind: 'ok',
        text: `Package v${result.packageVersion} generated with ${result.cardCount} card${result.cardCount === 1 ? '' : 's'} — download it below.`,
      })
      setBuildLog(result.buildLog)
      router.refresh()
    })
  }

  return (
    <div>
      <button
        className="studio-btn studio-btn-primary"
        onClick={generate}
        disabled={isPending || !canGenerate}
        title={!canGenerate ? 'Fix the readiness blockers above first' : undefined}
        style={!canGenerate ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
      >
        {isPending
          ? 'Generating package… (this can take a minute)'
          : hasExistingPackage
            ? `Regenerate package (${readyCount} card${readyCount === 1 ? '' : 's'})`
            : `Generate package (${readyCount} card${readyCount === 1 ? '' : 's'})`}
      </button>

      {message && (
        <p style={{
          fontSize: '0.82rem', fontWeight: 600, marginTop: '0.6rem',
          color: message.kind === 'ok' ? '#166534' : '#b91c1c',
        }}>
          {message.text}
        </p>
      )}

      {buildLog.length > 0 && (
        <details style={{ marginTop: '0.5rem', fontSize: '0.76rem', color: 'var(--ds-text-muted)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Build log</summary>
          <pre style={{
            margin: '0.4rem 0 0', padding: '0.6rem 0.8rem', background: '#f8fafc',
            border: '1px solid var(--ds-border-soft)', borderRadius: 6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {buildLog.join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}

export function DownloadZipButton({
  packageId,
  manufacturerId,
}: {
  packageId: string
  manufacturerId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState('')

  function download() {
    setErrorMsg('')
    startTransition(async () => {
      const result = await downloadPackageZip(packageId, manufacturerId)
      if (!result.ok) {
        setErrorMsg(result.error)
        return
      }
      window.location.assign(result.downloadUrl)
      router.refresh()
    })
  }

  return (
    <span>
      <button
        className="studio-btn studio-btn-ghost"
        onClick={download}
        disabled={isPending}
        style={{ fontSize: '0.78rem' }}
      >
        {isPending ? 'Preparing…' : 'Download ZIP'}
      </button>
      {errorMsg && (
        <span style={{ display: 'block', fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600, marginTop: 2 }}>
          {errorMsg}
        </span>
      )}
    </span>
  )
}
