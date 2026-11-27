'use client'

// The guided setup flow itself (design doc addendum 3 §C5). Five stacked
// steps (photos, colour swatches, links, source documents, "set up my
// System Card"), each showing done/not-done, ending in a congratulations
// state that hands off to Verify systems. No jargon: a manufacturer never
// sees "assertion", "chunk", or "auto_chain" here — those are what's
// happening underneath.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { upsertFieldVerification } from '@/lib/studio-manufacturer/verification-actions'
import { PhotosStep, type GalleryPhoto } from './PhotosStep'
import { LinksSection } from '@/components/workspace/LinksSection'
import { ColoursSection } from '@/components/workspace/ColoursSection'
import { DocumentsStep, type LinkedDocument } from './DocumentsStep'
import type { CustomDocumentLink } from '@/lib/studio-manufacturer/verification-actions'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'
import type { VerificationSystemColour } from '@/lib/studio-manufacturer/workspace'
import type { SlotAsset } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'

type ExtractionState = 'idle' | 'starting' | 'running' | 'done' | 'error'

type JobProgress = {
  totalPages?: number | null
  totalChunks?: number | null
  completedChunks?: unknown[]
  currentChunk?: { startPage?: number; endPage?: number } | null
  currentStage?: string
}

type JobStatus = {
  id: string
  jobType: string
  status: string
  errorMessage: string | null
  progress?: JobProgress | null
  autoChain?: boolean
  chainedJobIds?: string[]
  createdAt?: string
}

const JOB_LABELS: Record<string, string> = {
  fetch_url: 'Downloading PDF from link',
  docling: 'Reading PDF documents',
  system_identity_parser: 'Extracting product specs, dimensions & variants',
  knowledge_parser: 'Building technical & installation knowledge',
}

function formatJobProgress(j: JobStatus): string {
  if (j.status === 'done') return 'Complete'
  if (j.status === 'error') return 'Failed'
  if (j.status === 'pending') return 'Queued…'
  if (j.jobType === 'docling' && j.progress) {
    const cur = j.progress.currentChunk
    const total = j.progress.totalPages
    if (cur?.startPage && cur?.endPage && total) {
      return `Reading pages ${cur.startPage}–${cur.endPage} of ${total}…`
    }
    if (total) return `Reading ${total} pages…`
  }
  return 'Working…'
}

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
  initialWebsiteUrl = '',
  initialGallery,
  initialColours,
  pickerAssets,
  initialCustomDocumentLinks,
  linkLibrary,
  initialDocuments,
}: {
  systemId: string
  systemName: string
  manufacturerId: string
  initialWebsiteUrl?: string
  initialGallery: GalleryPhoto[]
  initialColours: VerificationSystemColour[]
  pickerAssets: SlotAsset[]
  initialCustomDocumentLinks: CustomDocumentLink[]
  linkLibrary: LinkLibraryEntry[]
  initialDocuments: LinkedDocument[]
}) {
  const router = useRouter()
  const [name, setName] = useState(systemName)
  const [quickUrl, setQuickUrl] = useState(initialWebsiteUrl)
  const [replacePhotos, setReplacePhotos] = useState(false)
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickMsg, setQuickMsg] = useState<string | null>(null)
  const [quickErr, setQuickErr] = useState<string | null>(null)
  const [swatchUrl, setSwatchUrl] = useState(initialWebsiteUrl)
  const [swatchBusy, setSwatchBusy] = useState(false)
  const [swatchMsg, setSwatchMsg] = useState<string | null>(null)
  const [swatchErr, setSwatchErr] = useState<string | null>(null)
  const [photosCount, setPhotosCount] = useState(initialGallery.length)
  const [coloursCount, setColoursCount] = useState(initialColours.length)
  const [linksCount, setLinksCount] = useState(initialCustomDocumentLinks.length)
  const [documentsCount, setDocumentsCount] = useState(initialDocuments.length)

  const [extraction, setExtraction] = useState<ExtractionState>('idle')
  const [alreadyExtracted, setAlreadyExtracted] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([])
  const [pendingSlow, setPendingSlow] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAttempts = useRef(0)
  const trackedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Auto-resume if an extraction for this system is already pending/running
    // (e.g. manufacturer refreshed the page or returned from another tab).
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/manufacturer/systems/${systemId}/extraction-status?manufacturerId=${manufacturerId}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        const jobs = (data.jobs ?? []) as JobStatus[]
        const active = jobs.filter((j) => j.status === 'pending' || j.status === 'running')
        if (active.length > 0 && !cancelled) {
          setExtraction('running')
          setJobStatuses(active)
          pollStatus(active.map((j) => j.id))
        } else if (
          !cancelled &&
          jobs.some(
            (j) =>
              j.status === 'done' &&
              (j.jobType === 'system_identity_parser' || j.jobType === 'knowledge_parser'),
          )
        ) {
          setAlreadyExtracted(true)
        }
      } catch {
        // Non-fatal on mount
      }
    })()
    return () => {
      cancelled = true
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, manufacturerId])

  function saveName(value: string) {
    upsertFieldVerification(systemId, manufacturerId, 'name', null, value, 'edited', null)
  }

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null }
  }

  function pollStatus(initialIds: string[]) {
    stopPolling()
    trackedIds.current = new Set(initialIds)
    pollAttempts.current = 0
    setPendingSlow(false)

    pollTimer.current = setInterval(async () => {
      pollAttempts.current += 1
      try {
        const res = await fetch(`/api/manufacturer/systems/${systemId}/extraction-status?manufacturerId=${manufacturerId}`)
        const data = await res.json()
        if (!res.ok) { setExtractionError(data.error ?? 'Could not check status.'); stopPolling(); setExtraction('error'); return }
        const jobs = (data.jobs ?? []) as JobStatus[]

        // Expand tracked IDs with any auto-chained jobs (e.g. docling ->
        // system_identity_parser + knowledge_parser) and any active jobs for
        // this system so we never celebrate before the AI parsers finish.
        for (const j of jobs) {
          if (trackedIds.current.has(j.id) && Array.isArray(j.chainedJobIds)) {
            for (const cid of j.chainedJobIds) trackedIds.current.add(cid)
          }
          if (j.status === 'pending' || j.status === 'running') {
            trackedIds.current.add(j.id)
          }
        }

        const relevant = jobs
          .filter((j) => trackedIds.current.has(j.id))
          .reverse() // chronological order: docling -> parsers
        setJobStatuses(relevant)

        const allPending = relevant.length > 0 && relevant.every((j) => j.status === 'pending')
        setPendingSlow(allPending && pollAttempts.current >= 6) // ~24s with no worker pickup

        // Wait if any tracked docling job had autoChain=true and reported
        // chainedJobIds that haven't shown up in `relevant` yet.
        const awaitingChainedRows = relevant.some(
          (j) => j.status === 'done' && j.autoChain && (j.chainedJobIds?.length ?? 0) > 0 &&
            j.chainedJobIds!.some((cid) => !relevant.some((r) => r.id === cid)),
        )

        const allTerminal =
          relevant.length > 0 &&
          !awaitingChainedRows &&
          relevant.every((j) => j.status === 'done' || j.status === 'error')

        if (allTerminal) {
          stopPolling()
          setPendingSlow(false)
          const anyError = relevant.some((j) => j.status === 'error')
          setExtraction(anyError ? 'error' : 'done')
          if (anyError) {
            setExtractionError(relevant.find((j) => j.status === 'error')?.errorMessage ?? 'One of the extraction jobs failed.')
          }
        } else if (pollAttempts.current > 150) {
          // ~10 minutes — stop polling; Verify systems will show results once ready.
          stopPolling()
        }
      } catch {
        // Transient network hiccup — keep polling, don't flip to error.
      }
    }, 4000)
  }

  async function importFromProductUrl() {
    const trimmed = quickUrl.trim()
    if (!trimmed) return
    setQuickBusy(true)
    setQuickErr(null)
    setQuickMsg(null)
    try {
      const res = await fetch(`/api/manufacturer/systems/${systemId}/import-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId, url: trimmed, autoExtract: true, replacePhotos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setQuickErr(data.error ?? 'Could not import from that product page.')
        return
      }
      if (!swatchUrl.trim()) setSwatchUrl(trimmed)
      const parts: string[] = []
      if (data.photosAdded > 0) parts.push(`${data.photosAdded} photo${data.photosAdded === 1 ? '' : 's'}`)
      if (data.swatchesAdded > 0) parts.push(`${data.swatchesAdded} colour swatch${data.swatchesAdded === 1 ? '' : 'es'}`)
      if (data.linksAdded > 0) parts.push(`${data.linksAdded} product link`)
      if (data.pdfsQueued > 0) parts.push(`${data.pdfsQueued} PDF guide${data.pdfsQueued === 1 ? '' : 's'} queued for AI extraction`)
      setQuickMsg(
        parts.length > 0
          ? `Imported ${parts.join(', ')}. Refreshing steps below…`
          : 'Product page checked — everything found is already added.',
      )
      if (data.photosAdded > 0 || replacePhotos) setPhotosCount(data.totalPhotos ?? photosCount + data.photosAdded)
      if (data.swatchesAdded > 0) setColoursCount(data.totalColours ?? coloursCount + data.swatchesAdded)
      if (data.linksAdded > 0) setLinksCount((c) => c + data.linksAdded)
      if (data.pdfsQueued > 0) setDocumentsCount((c) => c + data.pdfsQueued)
      if (Array.isArray(data.jobIds) && data.jobIds.length > 0) {
        setExtraction('running')
        pollStatus(data.jobIds)
      }
      router.refresh()
    } catch (err) {
      setQuickErr(err instanceof Error ? err.message : String(err))
    } finally {
      setQuickBusy(false)
    }
  }

  async function pullSwatchesFromUrl() {
    const trimmed = (swatchUrl || quickUrl).trim()
    if (!trimmed) return
    setSwatchBusy(true)
    setSwatchErr(null)
    setSwatchMsg(null)
    try {
      const res = await fetch(`/api/manufacturer/systems/${systemId}/import-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId, url: trimmed, mode: 'swatches_only', autoExtract: false, replacePhotos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSwatchErr(data.error ?? 'Could not pull colour swatches from that page.')
        return
      }
      if (data.swatchesAdded > 0) {
        setColoursCount(data.totalColours ?? coloursCount + data.swatchesAdded)
        setSwatchMsg(`Pulled ${data.swatchesAdded} colour swatch${data.swatchesAdded === 1 ? '' : 'es'} from the page.`)
        router.refresh()
      } else {
        setSwatchMsg('No new colour swatches were found on that page (any already listed were skipped).')
      }
    } catch (err) {
      setSwatchErr(err instanceof Error ? err.message : String(err))
    } finally {
      setSwatchBusy(false)
    }
  }

  async function startExtraction(forceReextract = false) {
    setExtraction('starting')
    setExtractionError(null)
    try {
      const res = await fetch(`/api/manufacturer/systems/${systemId}/initiate-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId, forceReextract }),
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
          Your photos, colours, links and System Card for <strong>{name}</strong> are loaded. The AI has read
          your documents and filled in what it could find — take a look and confirm it in Verify systems.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={`/manufacturer/workspace/${systemId}`} style={{
            display: 'inline-block', fontSize: '0.85rem', fontWeight: 700, color: '#fff', background: '#16a34a',
            borderRadius: 8, padding: '9px 20px', textDecoration: 'none',
          }}>
            Go to Verify systems →
          </Link>
          <Link href="/manufacturer/systems" style={{
            display: 'inline-block', fontSize: '0.85rem', fontWeight: 700, color: '#185D7A',
            background: '#fff', border: '1px solid rgba(24,93,122,0.35)',
            borderRadius: 8, padding: '9px 18px', textDecoration: 'none',
          }}>
            + Set up another system
          </Link>
        </div>
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

      <div style={{
        border: '1.5px solid #185D7A', borderRadius: 10,
        padding: '1rem 1.1rem', marginBottom: '1.1rem',
        background: 'rgba(24,93,122,0.06)',
      }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#185D7A', marginBottom: '0.25rem' }}>
          ⚡ Quick Start — Auto-fill from your product page
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', margin: '0 0 0.65rem', lineHeight: 1.5 }}>
          Paste your official product page URL and we&apos;ll pull product photos, colour swatches,
          add your link, and queue any PDF installation/spec guides on the page automatically.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="url"
            value={quickUrl}
            onChange={(e) => setQuickUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); importFromProductUrl() } }}
            placeholder="https://www.yourbrand.com.au/products/your-decking-system"
            disabled={quickBusy}
            style={{
              flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--ds-border)',
              background: 'var(--ds-surface, rgba(255,255,255,0.04))', color: 'inherit', fontSize: '0.84rem',
            }}
          />
          <button
            type="button"
            onClick={importFromProductUrl}
            disabled={quickBusy || !quickUrl.trim()}
            style={{
              fontSize: '0.84rem', fontWeight: 700, color: '#fff',
              background: quickBusy || !quickUrl.trim() ? '#94a3b8' : '#185D7A',
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: quickBusy || !quickUrl.trim() ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {quickBusy ? 'Importing…' : 'Auto-Fill'}
          </button>
        </div>
        {(photosCount > 0 || coloursCount > 0) && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.76rem', color: 'var(--ds-text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={replacePhotos}
              onChange={(e) => setReplacePhotos(e.target.checked)}
              style={{ accentColor: '#185D7A' }}
            />
            Replace existing photos &amp; swatches with images from this page
          </label>
        )}
        {quickMsg && <div style={{ fontSize: '0.78rem', color: '#16a34a', marginTop: '0.5rem', fontWeight: 600 }}>{quickMsg}</div>}
        {quickErr && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.5rem' }}>{quickErr}</div>}
      </div>

      <StepShell n={1} title="Upload photos" done={photosCount > 0} doneLabel={`${photosCount} photo${photosCount === 1 ? '' : 's'}`}>
        <PhotosStep systemId={systemId} manufacturerId={manufacturerId} initialGallery={initialGallery} onChanged={setPhotosCount} />
      </StepShell>

      <StepShell
        n={2}
        title="Upload colour swatches"
        done={coloursCount > 0}
        doneLabel={coloursCount > 0 ? `${coloursCount} colour${coloursCount === 1 ? '' : 's'}` : 'skip if not applicable'}
      >
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 0.7rem', lineHeight: 1.55 }}>
          Add a swatch image for each colour or finish this system comes in — or pull them
          automatically from your product page. Skip this step if it doesn&apos;t apply.
        </p>
        <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="url"
            value={swatchUrl}
            onChange={(e) => setSwatchUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pullSwatchesFromUrl() } }}
            placeholder={quickUrl || 'https://www.yourbrand.com.au/products/your-product'}
            disabled={swatchBusy}
            style={{
              flex: 1, minWidth: 220, padding: '6px 10px', borderRadius: 7,
              border: '1px solid var(--ds-border)',
              background: 'var(--ds-surface, rgba(255,255,255,0.04))',
              color: 'inherit', fontSize: '0.8rem',
            }}
          />
          <button
            type="button"
            onClick={pullSwatchesFromUrl}
            disabled={swatchBusy || !(swatchUrl || quickUrl).trim()}
            style={{
              fontSize: '0.78rem', fontWeight: 700, color: '#185D7A',
              background: 'rgba(24,93,122,0.08)',
              border: '1px solid rgba(24,93,122,0.35)', borderRadius: 7,
              padding: '6px 12px', cursor: swatchBusy || !(swatchUrl || quickUrl).trim() ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {swatchBusy ? 'Pulling swatches…' : '⚡ Pull swatches from page'}
          </button>
        </div>
        {swatchMsg && <div style={{ fontSize: '0.76rem', color: '#16a34a', marginBottom: '0.5rem', fontWeight: 600 }}>{swatchMsg}</div>}
        {swatchErr && <div style={{ fontSize: '0.76rem', color: '#dc2626', marginBottom: '0.5rem' }}>{swatchErr}</div>}
        <ColoursSection
          systemId={systemId} manufacturerId={manufacturerId}
          initialColours={initialColours} pickerAssets={pickerAssets}
          onChanged={setColoursCount}
        />
      </StepShell>

      <StepShell n={3} title="Links & resources" done={linksCount > 0} doneLabel={`${linksCount} link${linksCount === 1 ? '' : 's'}`}>
        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', margin: '0 0 0.6rem' }}>
          Recommended: 1–5 links per system. Choose the information most important to communicate
          to the end user — your own product page and a couple of the best web guides, not everything.
        </p>
        <LinksSection
          systemId={systemId} manufacturerId={manufacturerId}
          initialLinks={initialCustomDocumentLinks} linkLibrary={linkLibrary}
          onChanged={setLinksCount}
        />
      </StepShell>

      <StepShell n={4} title="Upload system source documents" done={documentsCount > 0} doneLabel={`${documentsCount} document${documentsCount === 1 ? '' : 's'}`}>
        <DocumentsStep
          systemId={systemId}
          manufacturerId={manufacturerId}
          initialDocuments={initialDocuments}
          onChanged={(nextCount) => {
            if (nextCount > documentsCount) setAlreadyExtracted(false)
            setDocumentsCount(nextCount)
          }}
        />
      </StepShell>

      <StepShell
        n={5}
        title="Create System Card"
        done={alreadyExtracted && extraction === 'idle'}
        doneLabel={
          extraction === 'running'
            ? 'working…'
            : alreadyExtracted
              ? 'already extracted'
              : documentsCount === 0
                ? 'upload a document first'
                : 'ready'
        }
      >
        {alreadyExtracted && extraction === 'idle' ? (
          <>
            <p style={{ fontSize: '0.82rem', color: '#166534', margin: '0 0 0.85rem', lineHeight: 1.55 }}>
              Already extracted — your documents for <strong>{name || 'this system'}</strong> have
              been read by the AI (no need to run this again unless you add new PDFs).
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Link
                href={`/manufacturer/workspace/${systemId}`}
                style={{
                  display: 'inline-block', fontSize: '0.88rem', fontWeight: 700, color: '#fff',
                  background: '#16a34a', borderRadius: 8, padding: '10px 20px', textDecoration: 'none',
                }}
              >
                Already extracted — go to Verify systems →
              </Link>
              <button
                type="button"
                onClick={() => startExtraction(false)}
                disabled={!canExtract}
                style={{
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--ds-text-muted)',
                  background: 'transparent', border: '1px solid var(--ds-border)',
                  borderRadius: 8, padding: '9px 14px', cursor: canExtract ? 'pointer' : 'default',
                }}
              >
                Re-run extraction
              </button>
              <button
                type="button"
                onClick={() => startExtraction(true)}
                disabled={!canExtract}
                title="Re-scans PDFs with Vision table transcription and refreshes unverified AI fields, profiles, components & assertions. Keeps approved/edited fields, photos, and colour swatches safe."
                style={{
                  fontSize: '0.8rem', fontWeight: 700, color: '#185D7A',
                  background: '#f0f9ff', border: '1px solid rgba(24,93,122,0.35)',
                  borderRadius: 8, padding: '9px 14px', cursor: canExtract ? 'pointer' : 'default',
                }}
              >
                Clean re-extract (Vision + refresh unverified)
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: '0 0 0.8rem', lineHeight: 1.55 }}>
              We&apos;ll initiate the pipeline and read the system source documents you uploaded for{' '}
              {name || 'this system'}. Once complete, you&apos;ll be prompted to verify all extracted
              information in Verify systems.
            </p>
            <button
              type="button"
              onClick={() => startExtraction(false)}
              disabled={!canExtract}
              style={{
                fontSize: '0.88rem', fontWeight: 700, color: '#fff',
                background: canExtract ? '#185D7A' : '#94a3b8',
                border: 'none', borderRadius: 8, padding: '10px 22px',
                cursor: canExtract ? 'pointer' : 'default',
              }}
            >
              {extraction === 'starting' ? 'Starting…' : extraction === 'running' ? 'Working…' : 'Create System Card'}
            </button>
          </>
        )}

        {extraction === 'running' && (
          <div style={{ marginTop: '0.85rem' }}>
            <div style={{
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              borderRadius: 9,
              padding: '0.85rem 1rem',
              marginBottom: '0.75rem',
            }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0c4a6e', marginBottom: '0.3rem' }}>
                ✓ We have everything we need for {name || 'this system'}!
              </div>
              <p style={{ fontSize: '0.8rem', color: '#0369a1', margin: '0 0 0.7rem', lineHeight: 1.55 }}>
                Our cloud AI is reading your documents in the background — you don&apos;t need to
                stay on this page. You can start setting up your next system, verify another
                product, or come back in a couple of minutes.
              </p>
              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <Link
                  href="/manufacturer/systems"
                  style={{
                    display: 'inline-block', fontSize: '0.8rem', fontWeight: 700, color: '#fff',
                    background: '#185D7A', borderRadius: 7, padding: '7px 14px', textDecoration: 'none',
                  }}
                >
                  + Start another system
                </Link>
                <Link
                  href="/manufacturer/review"
                  style={{
                    display: 'inline-block', fontSize: '0.8rem', fontWeight: 700, color: '#185D7A',
                    background: '#fff', border: '1px solid rgba(24,93,122,0.35)',
                    borderRadius: 7, padding: '7px 14px', textDecoration: 'none',
                  }}
                >
                  Verify another system →
                </Link>
              </div>
            </div>

            {jobStatuses.length > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                  Background progress ({jobStatuses.filter((j) => j.status === 'done').length} of {jobStatuses.length} steps complete):
                </div>
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
                  {jobStatuses.map((j) => (
                    <li key={j.id}>
                      <strong>{JOB_LABELS[j.jobType] ?? j.jobType.replace(/_/g, ' ')}</strong>:{' '}
                      <span style={{ color: j.status === 'done' ? '#16a34a' : j.status === 'error' ? '#dc2626' : 'inherit' }}>
                        {formatJobProgress(j)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pendingSlow && (
              <div style={{ fontSize: '0.78rem', marginTop: '0.5rem', color: '#d97706' }}>
                Your documents are safely queued and waiting for the cloud worker to pick them up.
              </div>
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
