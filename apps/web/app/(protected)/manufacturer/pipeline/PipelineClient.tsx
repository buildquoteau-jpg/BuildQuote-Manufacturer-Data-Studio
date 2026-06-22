'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ManufacturerDocument } from '@/lib/studio-manufacturer/workspace'

type Stats = {
  documents: number
  chunks: number
  systems: number
  profiles: number
  components: number
  verified: number
  pending: number
  systemList: { id: string; name: string; verification_status: string }[]
}

type StepStatus = 'idle' | 'running' | 'done' | 'error'

type ChunkInfo = {
  index: number
  startPage: number
  endPage: number
  charCount: number
  status: 'ok' | 'empty' | 'short'
}

type DoclingResult = {
  chunkCount: number
  pageCount: number
  chunks: ChunkInfo[]
  failedChunks: ChunkInfo[]
}

type ParseResult = {
  systemCount: number
  profileCount: number
  componentCount: number
}

type QaReport = {
  generatedAt: string
  summary: string
  missingSystemsFromHints: string[]
  systemsWithNoProfiles: string[]
  systemsWithNoComponents: string[]
  duplicateNames: string[]
  reparseSuggestions: { system: string; reason: string }[]
  hintsAdjustmentSuggested: boolean
  hintsAdjustmentNotes: string
  overallScore: number
  rawMarkdown: string
}

type Props = {
  manufacturerId: string
  manufacturerName: string
  manufacturerSlug: string
  documents: ManufacturerDocument[]
  stats: Stats
}

const STAGE_LABELS = [
  { key: 'documents',  label: 'Source documents', description: 'PDFs uploaded' },
  { key: 'hints',      label: 'Hints file',        description: 'Extraction guidance' },
  { key: 'chunks',     label: 'Docling chunks',    description: '7-page markdown chunks' },
  { key: 'systems',    label: 'Staged systems',    description: 'AI parser stage 1' },
  { key: 'components', label: 'Components',        description: 'AI parser stage 2' },
  { key: 'qa',         label: 'LLM QA review',     description: 'Gap analysis' },
  { key: 'verified',   label: 'Verified',           description: 'Human approved' },
]

function stageCount(key: string, stats: Stats, hasHints: boolean, hasQa: boolean): number | null {
  if (key === 'hints') return hasHints ? 1 : 0
  if (key === 'qa') return hasQa ? 1 : 0
  if (key === 'verified') return stats.verified
  return (stats as any)[key] ?? null
}

function stageActive(key: string, stats: Stats, hasHints: boolean, hasQa: boolean): boolean {
  const c = stageCount(key, stats, hasHints, hasQa)
  return c !== null && c > 0
}

export function PipelineClient({ manufacturerId, manufacturerName, manufacturerSlug, documents, stats }: Props) {
  const [activeTab, setActiveTab] = useState<'funnel' | 'run' | 'hints' | 'qa'>('funnel')

  // Hints state
  const [hintsContent, setHintsContent] = useState('')
  const [hintsLoaded, setHintsLoaded] = useState(false)
  const [hintsSaving, setHintsSaving] = useState(false)
  const [hintsSaveMsg, setHintsSaveMsg] = useState<string | null>(null)
  const [hasHints, setHasHints] = useState(false)

  // QA report state
  const [qaReport, setQaReport] = useState<QaReport | null>(null)
  const [qaLoaded, setQaLoaded] = useState(false)

  // Step-by-step run state
  const [selectedDocId, setSelectedDocId] = useState(documents[0]?.id ?? '')

  const [doclingStatus, setDoclingStatus] = useState<StepStatus>('idle')
  const [doclingResult, setDoclingResult] = useState<DoclingResult | null>(null)
  const [doclingError, setDoclingError] = useState<string | null>(null)
  const [rerunningChunk, setRerunningChunk] = useState<number | null>(null)
  const [doclingLive, setDoclingLive] = useState<{
    totalChunks: number | null
    totalPages: number | null
    completedChunks: { chunkNo: number; startPage: number; endPage: number }[]
    currentChunk: { chunkNo: number; startPage: number; endPage: number } | null
    elapsedSecs: number
  } | null>(null)
  const doclingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const doclingStartRef = useRef<number | null>(null)

  const [parseStatus, setParseStatus] = useState<StepStatus>('idle')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseLiveStage, setParseLiveStage] = useState<string | null>(null)
  const parsePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [qaStatus, setQaStatus] = useState<StepStatus>('idle')
  const [qaError, setQaError] = useState<string | null>(null)

  // Install guide
  const [igDocId, setIgDocId] = useState('')
  const [igSystemId, setIgSystemId] = useState('')
  const [igDoclingStatus, setIgDoclingStatus] = useState<StepStatus>('idle')
  const [igDoclingResult, setIgDoclingResult] = useState<DoclingResult | null>(null)
  const [igParseStatus, setIgParseStatus] = useState<StepStatus>('idle')
  const [igParseResult, setIgParseResult] = useState<ParseResult | null>(null)

  const loadHints = useCallback(async () => {
    if (hintsLoaded) return
    const res = await fetch(`/api/pipeline/hints?manufacturerId=${manufacturerId}&slug=${manufacturerSlug}`)
    const data = await res.json()
    setHintsContent(data.content ?? '')
    setHasHints(!!data.exists)
    setHintsLoaded(true)
  }, [manufacturerId, manufacturerSlug, hintsLoaded])

  const loadQa = useCallback(async () => {
    if (qaLoaded) return
    const res = await fetch(`/api/pipeline/qa-report?manufacturerId=${manufacturerId}`)
    const data = await res.json()
    if (data.report) setQaReport(data.report)
    setQaLoaded(true)
  }, [manufacturerId, qaLoaded])

  useEffect(() => { loadHints() }, [loadHints])
  useEffect(() => { loadQa() }, [loadQa])

  // Stop polling on unmount
  useEffect(() => () => {
    if (doclingPollRef.current) clearInterval(doclingPollRef.current)
    if (parsePollRef.current) clearInterval(parsePollRef.current)
  }, [])

  // Reset step results when doc changes
  function selectDoc(id: string) {
    if (doclingPollRef.current) { clearInterval(doclingPollRef.current); doclingPollRef.current = null }
    setSelectedDocId(id)
    setDoclingStatus('idle')
    setDoclingResult(null)
    setDoclingError(null)
    setDoclingLive(null)
    setParseStatus('idle')
    setParseResult(null)
    setParseError(null)
    setQaStatus('idle')
    setQaError(null)
  }

  function startDoclingPolling(docId: string) {
    doclingStartRef.current = Date.now()
    doclingPollRef.current = setInterval(async () => {
      const res = await fetch(`/api/pipeline/docling-status?documentId=${docId}`)
      const data = await res.json()
      const elapsed = Math.round((Date.now() - (doclingStartRef.current ?? Date.now())) / 1000)

      if (data.status === 'running') {
        setDoclingLive({
          totalChunks: data.totalChunks,
          totalPages: data.totalPages,
          completedChunks: data.completedChunks ?? [],
          currentChunk: data.currentChunk,
          elapsedSecs: elapsed,
        })
      } else if (data.status === 'done') {
        if (doclingPollRef.current) { clearInterval(doclingPollRef.current); doclingPollRef.current = null }
        setDoclingLive(null)
        setDoclingResult({ chunkCount: data.totalChunks, pageCount: data.totalPages, chunks: data.chunks ?? [], failedChunks: data.failedChunks ?? [] })
        setDoclingStatus('done')
      } else if (data.status === 'error') {
        if (doclingPollRef.current) { clearInterval(doclingPollRef.current); doclingPollRef.current = null }
        setDoclingLive(null)
        setDoclingError(data.error ?? 'Unknown error')
        setDoclingStatus('error')
      }
    }, 2000)
  }

  async function saveHints() {
    setHintsSaving(true)
    setHintsSaveMsg(null)
    const res = await fetch('/api/pipeline/hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, slug: manufacturerSlug, content: hintsContent }),
    })
    const data = await res.json()
    setHintsSaving(false)
    setHintsSaveMsg(data.ok ? 'Saved.' : `Error: ${data.error}`)
    if (data.ok) setHasHints(true)
    setTimeout(() => setHintsSaveMsg(null), 3000)
  }

  async function generateHints() {
    setHintsSaving(true)
    setHintsSaveMsg('Generating hints with Claude...')
    const res = await fetch('/api/pipeline/generate-hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug }),
    })
    const data = await res.json()
    setHintsSaving(false)
    if (data.ok) {
      setHintsContent(data.content)
      setHasHints(true)
      setHintsSaveMsg('Hints generated and saved.')
    } else {
      setHintsSaveMsg(`Error: ${data.error}`)
    }
    setTimeout(() => setHintsSaveMsg(null), 4000)
  }

  async function runDocling() {
    if (!selectedDocId) return
    setDoclingStatus('running')
    setDoclingResult(null)
    setDoclingError(null)
    setDoclingLive({ totalChunks: null, totalPages: null, completedChunks: [], currentChunk: null, elapsedSecs: 0 })
    const res = await fetch('/api/pipeline/run-docling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, documentId: selectedDocId }),
    })
    const data = await res.json()
    if (!data.ok && !data.jobStarted) {
      setDoclingError(data.error ?? 'Unknown error')
      setDoclingStatus('error')
      setDoclingLive(null)
      return
    }
    // Job started in background — begin polling
    startDoclingPolling(selectedDocId)
  }

  async function rerunChunk(chunk: ChunkInfo) {
    setRerunningChunk(chunk.index)
    const res = await fetch('/api/pipeline/rerun-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, documentId: selectedDocId, startPage: chunk.startPage, endPage: chunk.endPage, chunkIndex: chunk.index }),
    })
    const data = await res.json()
    setRerunningChunk(null)
    if (data.ok && doclingResult) {
      const updatedChunks = doclingResult.chunks.map(c =>
        c.index === chunk.index ? { ...c, charCount: data.charCount, status: data.status } : c
      )
      setDoclingResult({
        ...doclingResult,
        chunks: updatedChunks,
        failedChunks: updatedChunks.filter(c => c.status !== 'ok'),
      })
    }
  }

  async function runParser() {
    if (!selectedDocId) return
    setParseStatus('running')
    setParseResult(null)
    setParseError(null)
    setParseLiveStage('Queuing job…')
    const res = await fetch('/api/pipeline/run-parser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug, documentId: selectedDocId, dryRun: false }),
    })
    const data = await res.json()
    if (!data.ok && !data.jobStarted) {
      setParseError(data.error ?? 'Unknown error')
      setParseStatus('error')
      setParseLiveStage(null)
      return
    }
    // Poll for completion
    parsePollRef.current = setInterval(async () => {
      const r = await fetch(`/api/pipeline/parser-status?documentId=${selectedDocId}`)
      const s = await r.json()
      if (s.status === 'running') {
        const stage = s.currentStage === 'stage2' ? 'Stage 2 — components & links…' : s.currentStage === 'stage1' ? 'Stage 1 — systems, profiles, colours…' : 'Running…'
        setParseLiveStage(stage)
      } else if (s.status === 'done') {
        if (parsePollRef.current) { clearInterval(parsePollRef.current); parsePollRef.current = null }
        setParseLiveStage(null)
        setParseResult({ systemCount: s.systemCount, profileCount: s.profileCount, componentCount: s.componentCount })
        setParseStatus('done')
      } else if (s.status === 'error') {
        if (parsePollRef.current) { clearInterval(parsePollRef.current); parsePollRef.current = null }
        setParseLiveStage(null)
        setParseError(s.error ?? 'Unknown error')
        setParseStatus('error')
      }
    }, 3000)
  }

  async function runQa() {
    setQaStatus('running')
    setQaError(null)
    const res = await fetch('/api/pipeline/run-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug }),
    })
    const data = await res.json()
    if (!data.ok) {
      setQaError(data.error ?? 'Unknown error')
      setQaStatus('error')
      return
    }
    setQaReport(data.report)
    setQaLoaded(true)
    setQaStatus('done')
  }

  async function runQaOnly() {
    setQaLoaded(false)
    await runQa()
  }

  async function runIgDocling() {
    if (!igDocId) return
    setIgDoclingStatus('running')
    setIgDoclingResult(null)
    const res = await fetch('/api/pipeline/run-docling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, documentId: igDocId }),
    })
    const data = await res.json()
    if (!data.ok) { setIgDoclingStatus('error'); return }
    setIgDoclingResult({ chunkCount: data.chunkCount, pageCount: data.pageCount, chunks: data.chunks ?? [], failedChunks: data.failedChunks ?? [] })
    setIgDoclingStatus('done')
  }

  async function runIgParser() {
    if (!igDocId || !igSystemId) return
    setIgParseStatus('running')
    setIgParseResult(null)
    const res = await fetch('/api/pipeline/run-parser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug, documentId: igDocId, targetSystemId: igSystemId, dryRun: false }),
    })
    const data = await res.json()
    if (!data.ok) { setIgParseStatus('error'); return }
    setIgParseResult({ systemCount: 1, profileCount: data.profileCount, componentCount: data.componentCount })
    setIgParseStatus('done')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Pipeline — {manufacturerName}</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--ds-border)', paddingBottom: '0.5rem' }}>
        {(['funnel', 'run', 'hints', 'qa'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '0.4rem 1rem', borderRadius: 6, border: '1px solid var(--ds-border)',
            background: activeTab === tab ? 'var(--ds-teal, #0d7377)' : 'var(--ds-card-bg)',
            color: activeTab === tab ? '#fff' : 'var(--ds-text)',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: activeTab === tab ? 600 : 400,
          }}>
            {tab === 'funnel' ? 'Funnel' : tab === 'run' ? 'Run pipeline' : tab === 'hints' ? 'Hints file' : 'QA report'}
          </button>
        ))}
      </div>

      {/* ── FUNNEL TAB ── */}
      {activeTab === 'funnel' && (
        <div className="studio-section" style={{ marginTop: 0 }}>
          <div className="studio-section-heading">Extraction funnel — {manufacturerName}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {STAGE_LABELS.map((stage, i) => {
              const count = stageCount(stage.key, stats, hasHints, !!qaReport)
              const active = stageActive(stage.key, stats, hasHints, !!qaReport)
              const pct = i === 0 ? 100 : Math.min(100, Math.round(((count ?? 0) / Math.max(stats.documents, 1)) * 100))
              return (
                <div key={stage.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 600, color: active ? 'var(--ds-text)' : 'var(--ds-text-faint)' }}>
                      {i + 1}. {stage.label}
                      <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: 'var(--ds-text-muted)' }}>{stage.description}</span>
                    </span>
                    <span style={{ color: active ? 'var(--ds-teal, #0d7377)' : 'var(--ds-text-faint)', fontWeight: 600 }}>
                      {count !== null ? count : '—'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--ds-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: active ? `${pct}%` : '0%', background: active ? 'var(--ds-teal, #0d7377)' : 'var(--ds-border-soft)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Systems', value: stats.systems },
              { label: 'Profiles', value: stats.profiles },
              { label: 'Components', value: stats.components },
              { label: 'Verified', value: stats.verified },
              { label: 'Pending', value: stats.pending },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.75rem 1.25rem', minWidth: 90, textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-teal, #0d7377)' }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RUN PIPELINE TAB ── */}
      {activeTab === 'run' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Document selector */}
          <div className="studio-section" style={{ marginTop: 0 }}>
            <div className="studio-section-heading">Select source document</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => selectDoc(doc.id)}
                  style={{
                    padding: '0.75rem 1rem', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                    border: `2px solid ${selectedDocId === doc.id ? 'var(--ds-teal, #0d7377)' : 'var(--ds-border)'}`,
                    background: selectedDocId === doc.id ? 'rgba(13,115,119,0.06)' : 'var(--ds-card-bg)',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>📄 {doc.documentName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>
                    {doc.documentType ?? 'document'} · {doc.status}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 1: Docling */}
          <StepCard
            number={1}
            title="Docling extraction"
            description="Splits the PDF into 7-page markdown chunks"
            status={doclingStatus}
            onRun={runDocling}
            disabled={!selectedDocId}
          >
            {/* Live tally while running */}
            {doclingStatus === 'running' && doclingLive && (
              <div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: '#d97706' }}>
                    ⏱ {Math.floor(doclingLive.elapsedSecs / 60)}:{String(doclingLive.elapsedSecs % 60).padStart(2, '0')}
                  </span>
                  {doclingLive.totalChunks && (
                    <span style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
                      {doclingLive.completedChunks.length} / {doclingLive.totalChunks} chunks done
                      {doclingLive.totalPages ? ` · ${doclingLive.totalPages} pages total` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {doclingLive.totalChunks && Array.from({ length: doclingLive.totalChunks }, (_, i) => i + 1).map(n => {
                    const done = doclingLive.completedChunks.find(c => c.chunkNo === n)
                    const active = doclingLive.currentChunk?.chunkNo === n
                    return (
                      <div key={n} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.35rem 0.75rem', borderRadius: 6,
                        background: done ? '#f0fdf4' : active ? '#fef3c7' : 'var(--ds-card-bg)',
                        border: `1px solid ${done ? '#86efac' : active ? '#fcd34d' : 'var(--ds-border)'}`,
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', minWidth: 56, color: 'var(--ds-text-muted)' }}>
                          Chunk {n}
                        </span>
                        {(done || active) && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                            pp. {(done ?? doclingLive.currentChunk)?.startPage}–{(done ?? doclingLive.currentChunk)?.endPage}
                          </span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700,
                          color: done ? '#16a34a' : active ? '#d97706' : 'var(--ds-text-faint)' }}>
                          {done ? '✓ done' : active ? '⟳ extracting…' : 'waiting'}
                        </span>
                      </div>
                    )
                  })}
                  {!doclingLive.totalChunks && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', fontStyle: 'italic' }}>
                      Starting up… (downloading PDF and counting pages)
                    </div>
                  )}
                </div>
              </div>
            )}

            {doclingStatus === 'done' && doclingResult && (
              <div>
                {/* Success metric */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                  <Metric label="Chunks" value={doclingResult.chunkCount} color="green" />
                  <Metric label="Pages" value={doclingResult.pageCount} color="green" />
                  <Metric label="Issues" value={doclingResult.failedChunks.length} color={doclingResult.failedChunks.length > 0 ? 'red' : 'green'} />
                </div>

                {/* Chunk table */}
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--ds-text-muted)' }}>
                  All chunks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 300, overflowY: 'auto' }}>
                  {doclingResult.chunks.map(chunk => (
                    <div key={chunk.index} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.45rem 0.75rem', borderRadius: 6,
                      background: chunk.status === 'ok' ? 'var(--ds-card-bg)' : chunk.status === 'empty' ? '#fee2e2' : '#fef3c7',
                      border: `1px solid ${chunk.status === 'ok' ? 'var(--ds-border)' : chunk.status === 'empty' ? '#fca5a5' : '#fcd34d'}`,
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', minWidth: 60, color: 'var(--ds-text-muted)' }}>
                        Chunk {chunk.index}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', minWidth: 80 }}>
                        pp. {chunk.startPage}–{chunk.endPage}
                      </span>
                      <span style={{ fontSize: '0.78rem', flex: 1, color: 'var(--ds-text-muted)' }}>
                        {chunk.charCount.toLocaleString()} chars
                      </span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 4,
                        background: chunk.status === 'ok' ? '#d1fae5' : chunk.status === 'empty' ? '#fee2e2' : '#fef3c7',
                        color: chunk.status === 'ok' ? '#065f46' : chunk.status === 'empty' ? '#991b1b' : '#92400e',
                      }}>
                        {chunk.status.toUpperCase()}
                      </span>
                      {chunk.status !== 'ok' && (
                        <button
                          onClick={() => rerunChunk(chunk)}
                          disabled={rerunningChunk === chunk.index}
                          style={{
                            fontSize: '0.72rem', padding: '0.15rem 0.6rem', borderRadius: 4,
                            border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed',
                            cursor: rerunningChunk === chunk.index ? 'not-allowed' : 'pointer', fontWeight: 600,
                          }}
                        >
                          {rerunningChunk === chunk.index ? 'Re-running…' : 'Re-run'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {doclingResult.failedChunks.length > 0 && (
                  <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.9rem', borderRadius: 6, background: '#fef3c7', border: '1px solid #fcd34d', fontSize: '0.8rem', color: '#92400e' }}>
                    ⚠ {doclingResult.failedChunks.length} chunk{doclingResult.failedChunks.length > 1 ? 's' : ''} returned little or no text (pages {doclingResult.failedChunks.map(c => `${c.startPage}–${c.endPage}`).join(', ')}). Re-run them individually above, or proceed to parsing and check for missing products in the QA step.
                  </div>
                )}
              </div>
            )}
            {doclingStatus === 'error' && (
              <ErrorBox message={doclingError ?? 'Unknown error'} />
            )}
          </StepCard>

          {/* Step 2: AI Parser */}
          <StepCard
            number={2}
            title="AI parser"
            description="Stage 1 (systems, profiles, colours) + Stage 2 (components, links)"
            status={parseStatus}
            onRun={runParser}
            disabled={doclingStatus !== 'done'}
            disabledReason="Run Docling first"
          >
            {parseStatus === 'running' && parseLiveStage && (
              <div style={{ fontSize: '0.85rem', color: '#d97706', fontStyle: 'italic' }}>⟳ {parseLiveStage}</div>
            )}
            {parseStatus === 'done' && parseResult && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <Metric label="Systems" value={parseResult.systemCount} color="green" />
                <Metric label="Profiles / SKUs" value={parseResult.profileCount} color="green" />
                <Metric label="Components" value={parseResult.componentCount} color="green" />
              </div>
            )}
            {parseStatus === 'error' && <ErrorBox message={parseError ?? 'Unknown error'} />}
          </StepCard>

          {/* Step 3: LLM QA */}
          <StepCard
            number={3}
            title="LLM QA review"
            description="Claude reviews staged data against the hints file and flags gaps"
            status={qaStatus}
            onRun={runQa}
            disabled={parseStatus !== 'done'}
            disabledReason="Run the AI parser first"
          >
            {qaStatus === 'done' && qaReport && (
              <div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <Metric label="QA score" value={`${qaReport.overallScore}/10`} color={qaReport.overallScore >= 8 ? 'green' : qaReport.overallScore >= 5 ? 'amber' : 'red'} />
                  <Metric label="Missing systems" value={qaReport.missingSystemsFromHints.length} color={qaReport.missingSystemsFromHints.length === 0 ? 'green' : 'red'} />
                  <Metric label="No profiles" value={qaReport.systemsWithNoProfiles.length} color={qaReport.systemsWithNoProfiles.length === 0 ? 'green' : 'amber'} />
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--ds-text)', lineHeight: 1.6, marginBottom: '0.5rem' }}>{qaReport.summary}</div>
                <button onClick={() => setActiveTab('qa')} style={{ fontSize: '0.8rem', color: 'var(--ds-teal, #0d7377)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  View full QA report →
                </button>
              </div>
            )}
            {qaStatus === 'error' && <ErrorBox message={qaError ?? 'Unknown error'} />}
          </StepCard>

          {/* Install guide secondary parse */}
          <div className="studio-section">
            <div className="studio-section-heading">Secondary parse — install guide per system</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '1rem' }}>
              Use when QA flags a system as incomplete. Runs Docling on an install guide then merges results into the selected system.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', display: 'block', marginBottom: '0.3rem' }}>Install guide document</label>
                <select value={igDocId} onChange={e => { setIgDocId(e.target.value); setIgDoclingStatus('idle'); setIgDoclingResult(null); setIgParseStatus('idle'); setIgParseResult(null) }}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', fontSize: '0.85rem' }}>
                  <option value="">Select document…</option>
                  {documents.map(d => <option key={d.id} value={d.id}>{d.documentName}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', display: 'block', marginBottom: '0.3rem' }}>Target system</label>
                <select value={igSystemId} onChange={e => setIgSystemId(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', fontSize: '0.85rem' }}>
                  <option value="">Select system…</option>
                  {stats.systemList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <StepCard number={1} title="Docling — install guide" description="Extract chunks from the install guide PDF"
              status={igDoclingStatus} onRun={runIgDocling} disabled={!igDocId} compact>
              {igDoclingStatus === 'done' && igDoclingResult && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Metric label="Chunks" value={igDoclingResult.chunkCount} color="green" />
                  <Metric label="Issues" value={igDoclingResult.failedChunks.length} color={igDoclingResult.failedChunks.length > 0 ? 'amber' : 'green'} />
                </div>
              )}
            </StepCard>
            <div style={{ height: '0.5rem' }} />
            <StepCard number={2} title="Focused parse" description="Enrich the selected system with install guide data"
              status={igParseStatus} onRun={runIgParser} disabled={igDoclingStatus !== 'done' || !igSystemId} disabledReason="Run Docling on the install guide first" compact>
              {igParseStatus === 'done' && igParseResult && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Metric label="Profiles added" value={igParseResult.profileCount} color="green" />
                  <Metric label="Components added" value={igParseResult.componentCount} color="green" />
                </div>
              )}
            </StepCard>
          </div>
        </div>
      )}

      {/* ── HINTS FILE TAB ── */}
      {activeTab === 'hints' && (
        <div className="studio-section" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div>
              <div className="studio-section-heading" style={{ marginBottom: 0 }}>Hints file</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>
                prompts/manufacturer-hints/{manufacturerSlug}.md
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {hintsSaveMsg && (
                <span style={{ fontSize: '0.8rem', color: hintsSaveMsg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>{hintsSaveMsg}</span>
              )}
              <button onClick={generateHints} disabled={hintsSaving} style={{ padding: '0.35rem 0.9rem', borderRadius: 6, border: '1px solid #7c3aed', background: 'transparent', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem', cursor: hintsSaving ? 'not-allowed' : 'pointer' }}>
                Generate with Claude
              </button>
              <button onClick={saveHints} disabled={hintsSaving} style={{ padding: '0.35rem 0.9rem', borderRadius: 6, border: 'none', background: 'var(--ds-teal, #0d7377)', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: hintsSaving ? 'not-allowed' : 'pointer' }}>
                {hintsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            value={hintsContent}
            onChange={e => setHintsContent(e.target.value)}
            placeholder={`# Extraction hints — ${manufacturerName}\n\nNo hints file found. Click "Generate with Claude" to create one, or type manually.`}
            style={{ width: '100%', minHeight: 520, fontFamily: 'monospace', fontSize: '0.82rem', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', resize: 'vertical', lineHeight: 1.55, boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* ── QA REPORT TAB ── */}
      {activeTab === 'qa' && (
        <div className="studio-section" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="studio-section-heading" style={{ marginBottom: 0 }}>LLM QA report</div>
            <button onClick={runQaOnly} style={{ padding: '0.35rem 0.9rem', borderRadius: 6, border: 'none', background: 'var(--ds-teal, #0d7377)', color: '#fff', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              Re-run QA
            </button>
          </div>

          {!qaLoaded && <div style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem' }}>Loading…</div>}
          {qaLoaded && !qaReport && <div className="studio-info">No QA report yet. Run the pipeline or click "Re-run QA" above.</div>}

          {qaReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ background: qaReport.overallScore >= 8 ? '#d1fae5' : qaReport.overallScore >= 5 ? '#fef3c7' : '#fee2e2', borderRadius: 12, padding: '1rem 1.5rem', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: qaReport.overallScore >= 8 ? '#065f46' : qaReport.overallScore >= 5 ? '#92400e' : '#991b1b' }}>{qaReport.overallScore}/10</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>QA score</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--ds-text)', lineHeight: 1.6 }}>{qaReport.summary}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.4rem' }}>Generated {new Date(qaReport.generatedAt).toLocaleString('en-AU')}</div>
                </div>
              </div>
              {qaReport.missingSystemsFromHints.length > 0 && <QaSection title="Missing systems (expected from hints)" items={qaReport.missingSystemsFromHints} color="#fee2e2" textColor="#991b1b" />}
              {qaReport.systemsWithNoProfiles.length > 0 && <QaSection title="Systems with no profiles/SKUs" items={qaReport.systemsWithNoProfiles} color="#fef3c7" textColor="#92400e" />}
              {qaReport.systemsWithNoComponents.length > 0 && <QaSection title="Systems with no components" items={qaReport.systemsWithNoComponents} color="#fef3c7" textColor="#92400e" />}
              {qaReport.duplicateNames.length > 0 && <QaSection title="Duplicate system names" items={qaReport.duplicateNames} color="#fee2e2" textColor="#991b1b" />}
              {qaReport.reparseSuggestions.length > 0 && (
                <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.9rem 1.1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.5rem' }}>Re-parse suggestions</div>
                  {qaReport.reparseSuggestions.map((s, i) => (
                    <div key={i} style={{ fontSize: '0.82rem', marginBottom: '0.35rem', display: 'flex', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{s.system}:</span>
                      <span style={{ color: 'var(--ds-text-muted)' }}>{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              {qaReport.hintsAdjustmentSuggested && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.9rem 1.1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.4rem', color: '#166534' }}>Hints adjustment suggested</div>
                  <div style={{ fontSize: '0.82rem', color: '#15803d' }}>{qaReport.hintsAdjustmentNotes}</div>
                </div>
              )}
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--ds-text-muted)', userSelect: 'none' }}>Full QA report (markdown)</summary>
                <pre style={{ marginTop: '0.75rem', background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.75rem', fontSize: '0.78rem', whiteSpace: 'pre-wrap', color: 'var(--ds-text)', maxHeight: 400, overflowY: 'auto' }}>
                  {qaReport.rawMarkdown}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function StepCard({ number, title, description, status, onRun, disabled, disabledReason, compact, children }: {
  number: number
  title: string
  description: string
  status: StepStatus
  onRun: () => void
  disabled?: boolean
  disabledReason?: string
  compact?: boolean
  children?: React.ReactNode
}) {
  const borderColor = status === 'done' ? '#86efac' : status === 'error' ? '#fca5a5' : status === 'running' ? '#fcd34d' : 'var(--ds-border)'
  const bgColor = status === 'done' ? '#f0fdf4' : status === 'error' ? '#fff1f1' : 'var(--ds-card-bg)'

  return (
    <div style={{ border: `1.5px solid ${borderColor}`, borderRadius: 10, padding: compact ? '0.75rem 1rem' : '1rem 1.2rem', background: bgColor, transition: 'border-color 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: children && status !== 'idle' ? '0.85rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
            background: status === 'done' ? '#16a34a' : status === 'error' ? '#dc2626' : status === 'running' ? '#d97706' : 'var(--ds-border)',
            color: status !== 'idle' ? '#fff' : 'var(--ds-text-muted)',
          }}>
            {status === 'done' ? '✓' : status === 'error' ? '✗' : status === 'running' ? '…' : number}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: compact ? '0.85rem' : '0.92rem' }}>{title}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>{description}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {disabled && disabledReason && status === 'idle' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>{disabledReason}</span>
          )}
          <button
            onClick={onRun}
            disabled={disabled || status === 'running'}
            style={{
              padding: compact ? '0.3rem 0.85rem' : '0.4rem 1.1rem', borderRadius: 6, border: 'none', fontWeight: 600,
              fontSize: '0.82rem', cursor: (disabled || status === 'running') ? 'not-allowed' : 'pointer',
              background: (disabled || status === 'running') ? 'var(--ds-border)' : status === 'done' ? '#16a34a' : 'var(--ds-teal, #0d7377)',
              color: (disabled || status === 'running') ? 'var(--ds-text-muted)' : '#fff',
              whiteSpace: 'nowrap',
            }}
          >
            {status === 'running' ? 'Running…' : status === 'done' ? 'Re-run' : 'Run'}
          </button>
        </div>
      </div>
      {children && status !== 'idle' && <div>{children}</div>}
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number | string; color: 'green' | 'amber' | 'red' }) {
  const colors = {
    green: { bg: '#d1fae5', text: '#065f46' },
    amber: { bg: '#fef3c7', text: '#92400e' },
    red:   { bg: '#fee2e2', text: '#991b1b' },
  }
  const c = colors[color]
  return (
    <div style={{ background: c.bg, borderRadius: 8, padding: '0.5rem 1rem', textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: c.text }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: c.text, opacity: 0.8, marginTop: '0.1rem' }}>{label}</div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ padding: '0.6rem 0.9rem', borderRadius: 6, background: '#fee2e2', border: '1px solid #fca5a5', fontSize: '0.8rem', color: '#991b1b' }}>
      {message}
    </div>
  )
}

function QaSection({ title, items, color, textColor }: { title: string; items: string[]; color: string; textColor: string }) {
  return (
    <div style={{ background: color, borderRadius: 8, padding: '0.9rem 1.1rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: textColor, marginBottom: '0.4rem' }}>{title} ({items.length})</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {items.map((item, i) => (
          <span key={i} style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.78rem', color: textColor }}>{item}</span>
        ))}
      </div>
    </div>
  )
}
