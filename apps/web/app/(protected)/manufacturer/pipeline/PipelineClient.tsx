'use client'

import { useState, useEffect, useCallback } from 'react'
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

type RunStatus = 'idle' | 'running' | 'done' | 'error'

type RunLog = { ts: string; msg: string; type: 'info' | 'ok' | 'error' }

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
  { key: 'documents',   label: 'Source documents', description: 'PDFs uploaded' },
  { key: 'hints',       label: 'Hints file',        description: 'Extraction guidance' },
  { key: 'chunks',      label: 'Docling chunks',    description: '7-page markdown chunks' },
  { key: 'systems',     label: 'Staged systems',    description: 'AI parser stage 1' },
  { key: 'components',  label: 'Components',        description: 'AI parser stage 2' },
  { key: 'qa',          label: 'LLM QA review',     description: 'Gap analysis' },
  { key: 'verified',    label: 'Verified',           description: 'Human approved' },
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
  const [hintsContent, setHintsContent] = useState<string>('')
  const [hintsLoaded, setHintsLoaded] = useState(false)
  const [hintsSaving, setHintsSaving] = useState(false)
  const [hintsSaveMsg, setHintsSaveMsg] = useState<string | null>(null)
  const [hasHints, setHasHints] = useState(false)

  // QA report state
  const [qaReport, setQaReport] = useState<QaReport | null>(null)
  const [qaLoaded, setQaLoaded] = useState(false)

  // Run panel state
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id ?? '')
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runLogs, setRunLogs] = useState<RunLog[]>([])
  const [currentStep, setCurrentStep] = useState<string | null>(null)

  // Install guide secondary parse
  const [igDocId, setIgDocId] = useState<string>('')
  const [igSystemId, setIgSystemId] = useState<string>('')
  const [igStatus, setIgStatus] = useState<RunStatus>('idle')
  const [igLogs, setIgLogs] = useState<RunLog[]>([])

  const addLog = (logs: RunLog[], msg: string, type: RunLog['type'] = 'info'): RunLog[] => [
    ...logs,
    { ts: new Date().toLocaleTimeString('en-AU'), msg, type },
  ]

  // Load hints file
  const loadHints = useCallback(async () => {
    if (hintsLoaded) return
    const res = await fetch(`/api/pipeline/hints?manufacturerId=${manufacturerId}&slug=${manufacturerSlug}`)
    const data = await res.json()
    setHintsContent(data.content ?? '')
    setHasHints(!!data.exists)
    setHintsLoaded(true)
  }, [manufacturerId, manufacturerSlug, hintsLoaded])

  // Load QA report
  const loadQa = useCallback(async () => {
    if (qaLoaded) return
    const res = await fetch(`/api/pipeline/qa-report?manufacturerId=${manufacturerId}`)
    const data = await res.json()
    if (data.report) {
      setQaReport(data.report)
    }
    setQaLoaded(true)
  }, [manufacturerId, qaLoaded])

  useEffect(() => { loadHints() }, [loadHints])
  useEffect(() => { loadQa() }, [loadQa])

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

  async function runFullPipeline() {
    if (!selectedDocId) return
    setRunStatus('running')
    setRunLogs([])

    // Step 1: Docling
    setCurrentStep('docling')
    setRunLogs(l => addLog(l, `Starting Docling extraction for document ${selectedDocId}...`))
    const doclingRes = await fetch('/api/pipeline/run-docling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, documentId: selectedDocId }),
    })
    const doclingData = await doclingRes.json()
    if (!doclingData.ok) {
      setRunLogs(l => addLog(l, `Docling failed: ${doclingData.error}`, 'error'))
      setRunStatus('error')
      return
    }
    setRunLogs(l => addLog(l, `Docling complete — ${doclingData.chunkCount} chunks extracted (${doclingData.pageCount} pages)`, 'ok'))

    // Step 2: AI Parser
    setCurrentStep('parser')
    setRunLogs(l => addLog(l, 'Running AI parser stage 1 (systems, profiles, colours)...'))
    const parseRes = await fetch('/api/pipeline/run-parser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug, documentId: selectedDocId, dryRun: false }),
    })
    const parseData = await parseRes.json()
    if (!parseData.ok) {
      setRunLogs(l => addLog(l, `Parser failed: ${parseData.error}`, 'error'))
      setRunStatus('error')
      return
    }
    setRunLogs(l => addLog(l, `Parser complete — ${parseData.systemCount} systems, ${parseData.profileCount} profiles, ${parseData.componentCount} components`, 'ok'))

    // Step 3: LLM QA
    setCurrentStep('qa')
    setRunLogs(l => addLog(l, 'Running LLM QA review...'))
    const qaRes = await fetch('/api/pipeline/run-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug }),
    })
    const qaData = await qaRes.json()
    if (qaData.ok) {
      setQaReport(qaData.report)
      setQaLoaded(true)
      setRunLogs(l => addLog(l, `QA complete — score ${qaData.report.overallScore}/10. ${qaData.report.missingSystemsFromHints.length} gaps found.`, 'ok'))
    } else {
      setRunLogs(l => addLog(l, `QA warning: ${qaData.error}`, 'error'))
    }

    setCurrentStep(null)
    setRunStatus('done')
  }

  async function runInstallGuideParse() {
    if (!igDocId || !igSystemId) return
    setIgStatus('running')
    setIgLogs([])
    setIgLogs(l => addLog(l, 'Running Docling on install guide...'))

    const doclingRes = await fetch('/api/pipeline/run-docling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, documentId: igDocId }),
    })
    const doclingData = await doclingRes.json()
    if (!doclingData.ok) {
      setIgLogs(l => addLog(l, `Docling failed: ${doclingData.error}`, 'error'))
      setIgStatus('error')
      return
    }
    setIgLogs(l => addLog(l, `Docling done — ${doclingData.chunkCount} chunks`, 'ok'))
    setIgLogs(l => addLog(l, 'Running focused parser for selected system...'))

    const parseRes = await fetch('/api/pipeline/run-parser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug, documentId: igDocId, targetSystemId: igSystemId, dryRun: false }),
    })
    const parseData = await parseRes.json()
    if (!parseData.ok) {
      setIgLogs(l => addLog(l, `Parser failed: ${parseData.error}`, 'error'))
      setIgStatus('error')
      return
    }
    setIgLogs(l => addLog(l, `Done — enriched system with ${parseData.profileCount} profiles, ${parseData.componentCount} components`, 'ok'))
    setIgStatus('done')
  }

  async function runQaOnly() {
    setQaLoaded(false)
    const res = await fetch('/api/pipeline/run-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manufacturerId, manufacturerName, slug: manufacturerSlug }),
    })
    const data = await res.json()
    if (data.ok) {
      setQaReport(data.report)
    }
    setQaLoaded(true)
  }

  const installGuideDocs = documents.filter(d => d.documentType === 'installation_guide')
  const catalogueDocs = documents.filter(d => d.documentType !== 'installation_guide')

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Pipeline — {manufacturerName}</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--ds-border)', paddingBottom: '0.5rem' }}>
        {(['funnel', 'run', 'hints', 'qa'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 6,
              border: '1px solid var(--ds-border)',
              background: activeTab === tab ? 'var(--ds-teal, #0d7377)' : 'var(--ds-card-bg)',
              color: activeTab === tab ? '#fff' : 'var(--ds-text)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab === 'funnel' ? 'Funnel' : tab === 'run' ? 'Run pipeline' : tab === 'hints' ? 'Hints file' : 'QA report'}
          </button>
        ))}
      </div>

      {/* FUNNEL TAB */}
      {activeTab === 'funnel' && (
        <div className="studio-section" style={{ marginTop: 0 }}>
          <div className="studio-section-heading">Extraction funnel — {manufacturerName}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
            {STAGE_LABELS.map((stage, i) => {
              const count = stageCount(stage.key, stats, hasHints, !!qaReport)
              const active = stageActive(stage.key, stats, hasHints, !!qaReport)
              const pct = i === 0 ? 100 : stats.documents === 0 ? 0 : Math.min(100, Math.round(((count ?? 0) / Math.max(stats.documents, 1)) * 100))
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
                    <div style={{
                      height: '100%',
                      width: active ? `${pct}%` : '0%',
                      background: active ? 'var(--ds-teal, #0d7377)' : 'var(--ds-border-soft)',
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Systems', value: stats.systems },
              { label: 'Profiles', value: stats.profiles },
              { label: 'Components', value: stats.components },
              { label: 'Verified', value: stats.verified },
              { label: 'Pending', value: stats.pending },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--ds-card-bg)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8,
                padding: '0.75rem 1.25rem',
                minWidth: 90,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-teal, #0d7377)' }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RUN PIPELINE TAB */}
      {activeTab === 'run' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Main catalogue run */}
          <div className="studio-section" style={{ marginTop: 0 }}>
            <div className="studio-section-heading">Run full pipeline — catalogue</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '1rem' }}>
              Runs: Docling → AI parser (stage 1 + 2) → LLM QA review
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                  Source document
                </label>
                <select
                  value={selectedDocId}
                  onChange={e => setSelectedDocId(e.target.value)}
                  disabled={runStatus === 'running'}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', fontSize: '0.85rem' }}
                >
                  {documents.length === 0 && <option value="">No documents uploaded</option>}
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>{d.documentName}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={runFullPipeline}
                disabled={runStatus === 'running' || !selectedDocId}
                style={{
                  padding: '0.45rem 1.25rem',
                  borderRadius: 6,
                  border: 'none',
                  background: runStatus === 'running' ? 'var(--ds-border)' : 'var(--ds-teal, #0d7377)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: runStatus === 'running' ? 'not-allowed' : 'pointer',
                }}
              >
                {runStatus === 'running' ? `Running (${currentStep ?? '...'})` : 'Run pipeline'}
              </button>
            </div>

            {/* Progress steps */}
            {(runStatus === 'running' || runStatus === 'done' || runStatus === 'error') && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {[
                  { key: 'docling', label: '1. Docling' },
                  { key: 'parser', label: '2. AI Parser' },
                  { key: 'qa', label: '3. LLM QA' },
                ].map(step => {
                  const isDone = runStatus === 'done' || (currentStep && ['parser', 'qa'].includes(step.key) && currentStep === 'parser' && step.key === 'docling') || (currentStep === 'qa' && step.key !== 'qa')
                  const isActive = currentStep === step.key
                  return (
                    <div key={step.key} style={{
                      padding: '0.3rem 0.8rem',
                      borderRadius: 20,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: runStatus === 'done' ? '#d1fae5' : isActive ? '#fef3c7' : 'var(--ds-border)',
                      color: runStatus === 'done' ? '#065f46' : isActive ? '#92400e' : 'var(--ds-text-muted)',
                      border: isActive ? '1px solid #f59e0b' : '1px solid transparent',
                    }}>
                      {step.label}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Log output */}
            {runLogs.length > 0 && (
              <div style={{
                background: '#0f172a',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                maxHeight: 220,
                overflowY: 'auto',
              }}>
                {runLogs.map((log, i) => (
                  <div key={i} style={{ color: log.type === 'error' ? '#f87171' : log.type === 'ok' ? '#4ade80' : '#94a3b8', marginBottom: '0.2rem' }}>
                    <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>{log.ts}</span>{log.msg}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Install guide secondary parse */}
          <div className="studio-section">
            <div className="studio-section-heading">Secondary parse — install guide per system</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '1rem' }}>
              Merges an install guide document with catalogue chunks for a specific system. Use when QA flags a system as incomplete.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', display: 'block', marginBottom: '0.3rem' }}>Install guide document</label>
                <select
                  value={igDocId}
                  onChange={e => setIgDocId(e.target.value)}
                  disabled={igStatus === 'running'}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', fontSize: '0.85rem' }}
                >
                  <option value="">Select document…</option>
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>{d.documentName} ({d.documentType ?? 'doc'})</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', display: 'block', marginBottom: '0.3rem' }}>Target system</label>
                <select
                  value={igSystemId}
                  onChange={e => setIgSystemId(e.target.value)}
                  disabled={igStatus === 'running'}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: 6, border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)', color: 'var(--ds-text)', fontSize: '0.85rem' }}
                >
                  <option value="">Select system…</option>
                  {stats.systemList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={runInstallGuideParse}
                disabled={igStatus === 'running' || !igDocId || !igSystemId}
                style={{
                  padding: '0.45rem 1.25rem',
                  borderRadius: 6,
                  border: 'none',
                  background: igStatus === 'running' ? 'var(--ds-border)' : '#7c3aed',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: (igStatus === 'running' || !igDocId || !igSystemId) ? 'not-allowed' : 'pointer',
                }}
              >
                {igStatus === 'running' ? 'Running…' : 'Run install guide parse'}
              </button>
            </div>

            {igLogs.length > 0 && (
              <div style={{
                background: '#0f172a',
                borderRadius: 8,
                padding: '0.75rem 1rem',
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                maxHeight: 160,
                overflowY: 'auto',
              }}>
                {igLogs.map((log, i) => (
                  <div key={i} style={{ color: log.type === 'error' ? '#f87171' : log.type === 'ok' ? '#4ade80' : '#94a3b8', marginBottom: '0.2rem' }}>
                    <span style={{ opacity: 0.5, marginRight: '0.5rem' }}>{log.ts}</span>{log.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HINTS FILE TAB */}
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
                <span style={{ fontSize: '0.8rem', color: hintsSaveMsg.startsWith('Error') ? '#ef4444' : '#16a34a' }}>
                  {hintsSaveMsg}
                </span>
              )}
              <button
                onClick={generateHints}
                disabled={hintsSaving}
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: 6,
                  border: '1px solid #7c3aed',
                  background: 'transparent',
                  color: '#7c3aed',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: hintsSaving ? 'not-allowed' : 'pointer',
                }}
              >
                Generate with Claude
              </button>
              <button
                onClick={saveHints}
                disabled={hintsSaving}
                style={{
                  padding: '0.35rem 0.9rem',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--ds-teal, #0d7377)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: hintsSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {hintsSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <textarea
            value={hintsContent}
            onChange={e => setHintsContent(e.target.value)}
            placeholder={`# Extraction hints — ${manufacturerName}\n\nNo hints file found. Click "Generate with Claude" to create one, or type manually.`}
            style={{
              width: '100%',
              minHeight: 520,
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              padding: '0.75rem',
              borderRadius: 8,
              border: '1px solid var(--ds-border)',
              background: 'var(--ds-card-bg)',
              color: 'var(--ds-text)',
              resize: 'vertical',
              lineHeight: 1.55,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* QA REPORT TAB */}
      {activeTab === 'qa' && (
        <div className="studio-section" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="studio-section-heading" style={{ marginBottom: 0 }}>LLM QA report</div>
            <button
              onClick={runQaOnly}
              style={{
                padding: '0.35rem 0.9rem',
                borderRadius: 6,
                border: 'none',
                background: 'var(--ds-teal, #0d7377)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Re-run QA
            </button>
          </div>

          {!qaLoaded && (
            <div style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem' }}>Loading…</div>
          )}

          {qaLoaded && !qaReport && (
            <div className="studio-info">
              No QA report yet. Run the pipeline or click "Re-run QA" above.
            </div>
          )}

          {qaReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Score + summary */}
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{
                  background: qaReport.overallScore >= 8 ? '#d1fae5' : qaReport.overallScore >= 5 ? '#fef3c7' : '#fee2e2',
                  borderRadius: 12,
                  padding: '1rem 1.5rem',
                  textAlign: 'center',
                  minWidth: 100,
                }}>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: qaReport.overallScore >= 8 ? '#065f46' : qaReport.overallScore >= 5 ? '#92400e' : '#991b1b' }}>
                    {qaReport.overallScore}/10
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: '0.2rem' }}>QA score</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--ds-text)', lineHeight: 1.6 }}>{qaReport.summary}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.4rem' }}>
                    Generated {new Date(qaReport.generatedAt).toLocaleString('en-AU')}
                  </div>
                </div>
              </div>

              {/* Gap lists */}
              {qaReport.missingSystemsFromHints.length > 0 && (
                <QaSection title="Missing systems (expected from hints)" items={qaReport.missingSystemsFromHints} color="#fee2e2" textColor="#991b1b" />
              )}
              {qaReport.systemsWithNoProfiles.length > 0 && (
                <QaSection title="Systems with no profiles/SKUs" items={qaReport.systemsWithNoProfiles} color="#fef3c7" textColor="#92400e" />
              )}
              {qaReport.systemsWithNoComponents.length > 0 && (
                <QaSection title="Systems with no components" items={qaReport.systemsWithNoComponents} color="#fef3c7" textColor="#92400e" />
              )}
              {qaReport.duplicateNames.length > 0 && (
                <QaSection title="Duplicate system names" items={qaReport.duplicateNames} color="#fee2e2" textColor="#991b1b" />
              )}

              {/* Re-parse suggestions */}
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

              {/* Hints adjustment */}
              {qaReport.hintsAdjustmentSuggested && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '0.9rem 1.1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.4rem', color: '#166534' }}>Hints adjustment suggested</div>
                  <div style={{ fontSize: '0.82rem', color: '#15803d' }}>{qaReport.hintsAdjustmentNotes}</div>
                </div>
              )}

              {/* Raw markdown */}
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--ds-text-muted)', userSelect: 'none' }}>
                  Full QA report (markdown)
                </summary>
                <pre style={{
                  marginTop: '0.75rem',
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border)',
                  borderRadius: 8,
                  padding: '0.75rem',
                  fontSize: '0.78rem',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--ds-text)',
                  maxHeight: 400,
                  overflowY: 'auto',
                }}>
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

function QaSection({ title, items, color, textColor }: { title: string; items: string[]; color: string; textColor: string }) {
  return (
    <div style={{ background: color, borderRadius: 8, padding: '0.9rem 1.1rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: textColor, marginBottom: '0.4rem' }}>{title} ({items.length})</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {items.map((item, i) => (
          <span key={i} style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 4, padding: '0.2rem 0.5rem', fontSize: '0.78rem', color: textColor }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
