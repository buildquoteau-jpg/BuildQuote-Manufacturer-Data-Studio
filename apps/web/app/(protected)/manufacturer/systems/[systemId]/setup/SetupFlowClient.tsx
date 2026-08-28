'use client'

// The guided setup flow itself (design doc addendum 3 §C5) — four stacked
// steps (photos, links, documents, "set up my System Card"), each showing
// done/not-done, ending in a congratulations state that hands off to Verify
// systems. No jargon: a manufacturer never sees "assertion", "chunk", or
// "auto_chain" here — those are what's happening underneath.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { upsertFieldVerification } from '@/lib/studio-manufacturer/verification-actions'
import { PhotosStep, type GalleryPhoto } from './PhotosStep'
import { LinksSection } from '@/components/workspace/LinksSection'
import { DocumentsStep, type LinkedDocument } from './DocumentsStep'
import type { CustomDocumentLink } from '@/lib/studio-manufacturer/verification-actions'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

type ExtractionState = 'idle' | 'starting' | 'running' | 'done' | 'error'

type JobStatus = { id: string; jobType: string; status: string; errorMessage: string | null }

function StepShell({ n, title, done, doneLabel, children }: {
  n: number; title: string; done: boolean; doneLabel: string; children: React.ReactNode
}) {
  return (
    <div style={{
      border: '1px solid var(--ds-border)', borderRadius: 10,
      padding: '1rem 1.1rem 1.1rem', marginBottom: '1rem',
      background: 'var(--ds-surface, rgba(255,255,255,0.02))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.76rem', fontWeight: 700, flexShrink: 0,
          background: done ? '#16a34a' : 'var(--ds-border)', color: done ? '#fff' : 'var(--ds-text-muted)',
        }}>
          {done ? '✓' : n}
        </span>
        <h2 style={{ fontSize: '0.95rem', margin: 0, flex: 1 }}>{title}</h2>
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: done ? '#16a34a' : 'var(--ds-text-faint)' }}>
          {doneLabel}
        </span>
      </div>
      {children}
    </div>
  )
}

export function SetupFlowClient({
  systemId,
  systemName,
  manufacturerId,
  initialGallery,
  initialCustomDocumentLinks,
  linkLibrary,
  initialDocuments,
}: {
  systemId: string
  systemName: string
  manufacturerId: string
  initialGallery: GalleryPhoto[]
  initialCustomDocumentLinks: CustomDocumentLink[]
  linkLibrary: LinkLibraryEntry[]
  initialDocuments: LinkedDocument[]
}) {
  const [name, setName] = useState(systemName)
  const [photosCount, setPhotosCount] = useState(initialGallery.length)
  const [linksCount, setLinksCount] = useState(initialCustomDocumentLinks.length)
  const [documentsCount, setDocumentsCount] = useState(initialDocuments.length)

  const [extraction, setExtraction] = useState<ExtractionState>('idle')
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([])
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAttempts = useRef(0)

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current) }, [])

  function saveName(value: string) {
    upsertFieldVerification(systemId, manufacturerId, 'name', null, value, 'edited', null)
  }

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
  }

  function pollStatus(ids: string[]) {
    pollAttempts.current = 0
    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1
      try {
        const res = await fetch(`/api/manufacturer/systems/${systemId}/extraction-status?manufacturerId=${manufacturerId}`)
        const data = await res.json()
        if (!res.ok) { setExtractionError(data.error ?? 'Could not check status.'); stopPolling(); setExtraction('error'); return }
        const jobs = (data.jobs ?? []) as JobStatus[]
        const relevant = jobs.filter((j) => ids.includes(j.id))
        setJobStatuses(relevant)
        const allTerminal = relevant.length > 0 && relevant.every((j) => j.status === 'done' || j.status === 'error')
        if (allTerminal) {
          stopPolling()
          const anyError = relevant.some((j) => j.status === 'error')
          setExtraction(anyError ? 'error' : 'done')
          if (anyError) {
            setExtractionError(relevant.find((j) => j.status === 'error')?.errorMessage ?? 'One of the extraction jobs failed.')
          }
        } else if (pollAttempts.current > 90) {
          // ~6 minutes — stop polling but don't call it an error; large
          // documents can legitimately take a while. Verify systems will
          // show the result whenever it lands.
          stopPolling()
        }
      } catch {
        // Transient network hiccup — keep polling, don't flip to error.
      }
    }, 4000)
  }

  async function startExtraction() {
    setExtraction('starting')
    setExtractionError(null)
    try {
      const res = await fetch(`/api/manufacturer/systems/${systemId}/initiate-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId }),
      })
      const data = await res.json()
      if (!res.ok) { setExtraction('error'); setExtractionError(data.error ?? 'Could not start extraction.'); return }
      setExtraction('running')
      pollStatus(data.jobIds ?? [])
    } catch (err) {
      setExtraction('error')
      setExtractionError(err instanceof Error ? err.message : String(err))
    }
  }

  if (extraction === 'done') {
    return (
      <div style={{
        border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 10,
        padding: '1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.6rem', marginBottom: '0.4rem' }}>🎉</div>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem', color: '#166534' }}>Congratulations!</h2>
        <p style={{ fontSize: '0.85rem', color: '#166534', margin: '0 0 1rem', lineHeight: 1.6 }}>
          Your photos, links and System Card for <strong>{name}</strong> are loaded. The AI has read
          your documents and filled in what it could find — take a look and confirm it in Verify systems.
        </p>
        <Link href={`/manufacturer/workspace/${systemId}`} style={{
          display: 'inline-block', fontSize: '0.85rem', fontWeight: 700, color: '#fff', background: '#16a34a',
          borderRadius: 8, padding: '9px 20px', textDecoration: 'none',
        }}>
          Go to Verify systems →
        </Link>
      </div>
    )
  }

  const canExtract = documentsCount > 0 && extraction !== 'starting' && extraction !== 'running'

  return (
    <div>
      <div style={{ marginBottom: '1.2rem' }}>
        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', display: 'block', marginBottom: 4 }}>
          System name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => saveName(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
            border: '1px solid var(--ds-border)', background: 'var(--ds-surface, rgba(255,255,255,0.04))',
            color: 'inherit', fontSize: '1rem', fontWeight: 700, outline: 'none',
          }}
        />
      </div>

      <StepShell n={1} title="Photos" done={photosCount > 0} doneLabel={`${photosCount} photo${photosCount === 1 ? '' : 's'}`}>
        <PhotosStep systemId={systemId} manufacturerId={manufacturerId} initialGallery={initialGallery} onChanged={setPhotosCount} />
      </StepShell>

      <StepShell n={2} title="Links & resources" done={linksCount > 0} doneLabel={`${linksCount} link${linksCount === 1 ? '' : 's'}`}>
        <LinksSection
          systemId={systemId} manufacturerId={manufacturerId}
          initialLinks={initialCustomDocumentLinks} linkLibrary={linkLibrary}
          onChanged={setLinksCount}
        />
      </StepShell>

      <StepShell n={3} title="Source documents" done={documentsCount > 0} doneLabel={`${documentsCount} document${documentsCount === 1 ? '' : 's'}`}>
        <DocumentsStep systemId={systemId} manufacturerId={manufacturerId} initialDocuments={initialDocuments} onChanged={setDocumentsCount} />
      </StepShell>

      <StepShell
        n={4}
        title="Set up my System Card"
        done={false}
        doneLabel={documentsCount === 0 ? 'upload a document first' : 'ready'}
      >
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 0.8rem', lineHeight: 1.55 }}>
          We&apos;ll read the documents you uploaded and fill in the System Card fields and the
          machine-readable knowledge object for {name || 'this system'} — automatically, no admin needed.
          You&apos;ll confirm everything afterwards in Verify systems.
        </p>
        <button
          type="button"
          onClick={startExtraction}
          disabled={!canExtract}
          style={{
            fontSize: '0.88rem', fontWeight: 700, color: '#fff',
            background: canExtract ? '#185D7A' : '#94a3b8',
            border: 'none', borderRadius: 8, padding: '10px 22px',
            cursor: canExtract ? 'pointer' : 'default',
          }}
        >
          {extraction === 'starting' ? 'Starting…' : extraction === 'running' ? 'Working…' : 'Set up my System Card'}
        </button>

        {extraction === 'running' && (
          <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginTop: '0.7rem' }}>
            Reading your documents… this can take a few minutes for larger guides.
            {jobStatuses.length > 0 && (
              <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                {jobStatuses.map((j) => (
                  <li key={j.id}>{j.jobType.replace(/_/g, ' ')}: {j.status}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {extraction === 'error' && (
          <div style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.7rem' }}>
            {extractionError ?? 'Something went wrong.'}
          </div>
        )}
      </StepShell>
    </div>
  )
}
