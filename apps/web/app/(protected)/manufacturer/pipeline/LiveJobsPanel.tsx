'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// Live pipeline-job feed (2026-07-18 audit): shows every recent run — worker
// jobs and manual terminal runs alike — with real progress, a STALLED state
// for runs whose heartbeat went quiet (previously an eternal spinner), loud
// error banners, and optional browser notifications on failure. Polls
// /api/pipeline/jobs every 5s while the tab is visible.

type Job = {
  id: string
  jobType: string
  status: 'pending' | 'running' | 'done' | 'error' | string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  heartbeatAt: string | null
  workerId: string | null
  documentId: string | null
  progress: Record<string, any>
  result: Record<string, any>
  errorMessage: string | null
  logTail: string[]
}

const JOB_TYPE_LABELS: Record<string, string> = {
  docling: 'Docling extraction',
  parser: 'AI parser',
  web_enricher: 'Web enricher',
  fetch_url: 'Fetch source URL',
  embed: 'Card embeddings',
  rerun_chunk: 'Chunk re-run',
}

// A running job whose heartbeat is older than this is rendered as stalled.
// Worker lease reclaim (15 min) will eventually retry it; the UI flags it
// much sooner so nobody watches a dead spinner.
const STALL_AFTER_MS = 3 * 60 * 1000

function jobLabel(t: string): string {
  return JOB_TYPE_LABELS[t] ?? t
}

function fmtElapsed(fromIso: string | null, toIso: string | null, nowIso: string): string {
  if (!fromIso) return ''
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso ?? nowIso).getTime()
  const secs = Math.max(0, Math.round((to - from) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function isStalled(job: Job, nowIso: string): boolean {
  if (job.status !== 'running') return false
  const last = job.heartbeatAt ?? job.startedAt ?? job.createdAt
  if (!last) return false
  return new Date(nowIso).getTime() - new Date(last).getTime() > STALL_AFTER_MS
}

function progressInfo(job: Job): { pct: number | null; text: string | null } {
  const p = job.progress ?? {}
  const stage = p.currentStage ? String(p.currentStage) : null
  // Parser shape: {currentStage, chunk, totalChunks}
  if (typeof p.chunk === 'number' && typeof p.totalChunks === 'number' && p.totalChunks > 0) {
    return {
      pct: Math.round((p.chunk / p.totalChunks) * 100),
      text: `${stage ?? 'chunk'} ${p.chunk}/${p.totalChunks}`,
    }
  }
  // Enricher shape: {row, totalRows, name}
  if (typeof p.row === 'number' && typeof p.totalRows === 'number' && p.totalRows > 0) {
    return {
      pct: Math.round((p.row / p.totalRows) * 100),
      text: `row ${p.row}/${p.totalRows}${p.name ? ` — ${p.name}` : ''}`,
    }
  }
  // Docling/worker shape: {totalChunks, completedChunks[], currentChunk}
  if (typeof p.totalChunks === 'number' && p.totalChunks > 0) {
    const doneCount = Array.isArray(p.completedChunks) ? p.completedChunks.length : 0
    const current = p.currentChunk?.chunkNo ?? null
    return {
      pct: Math.round((doneCount / p.totalChunks) * 100),
      text: current ? `chunk ${current}/${p.totalChunks}` : `${doneCount}/${p.totalChunks} chunks`,
    }
  }
  return { pct: null, text: stage }
}

function statusChip(job: Job, stalled: boolean): { label: string; bg: string; fg: string } {
  if (stalled) return { label: 'STALLED', bg: '#b45309', fg: '#fff' }
  switch (job.status) {
    case 'running': return { label: 'RUNNING', bg: 'var(--ds-teal, #0d7377)', fg: '#fff' }
    case 'done':    return { label: 'DONE', bg: '#15803d', fg: '#fff' }
    case 'error':   return { label: 'FAILED', bg: '#b91c1c', fg: '#fff' }
    case 'pending': return { label: 'QUEUED', bg: 'var(--ds-border)', fg: 'var(--ds-text)' }
    default:        return { label: job.status.toUpperCase(), bg: 'var(--ds-border)', fg: 'var(--ds-text)' }
  }
}

export function LiveJobsPanel({ manufacturerId }: { manufacturerId: string }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [now, setNow] = useState<string>(new Date().toISOString())
  const [loaded, setLoaded] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [notifState, setNotifState] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const knownErrorsRef = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifState(Notification.permission)
    }
  }, [])

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const res = await fetch(`/api/pipeline/jobs?manufacturerId=${manufacturerId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setJobs(data.jobs ?? [])
      setNow(data.now ?? new Date().toISOString())
      setFetchError(null)

      // Browser notification on NEW failures (not ones already on screen at
      // first load — those are history, not news).
      for (const j of (data.jobs ?? []) as Job[]) {
        if (j.status === 'error' && !knownErrorsRef.current.has(j.id)) {
          knownErrorsRef.current.add(j.id)
          if (!firstLoadRef.current
              && typeof window !== 'undefined'
              && 'Notification' in window
              && Notification.permission === 'granted') {
            new Notification(`Pipeline ${jobLabel(j.jobType)} failed`, {
              body: (j.errorMessage ?? 'Unknown error').slice(0, 180),
            })
          }
        }
      }
      firstLoadRef.current = false
      setLoaded(true)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    }
  }, [manufacturerId])

  useEffect(() => {
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [poll])

  const active = jobs.filter(j => j.status === 'running' || j.status === 'pending')
  const finished = jobs.filter(j => j.status !== 'running' && j.status !== 'pending')

  return (
    <div className="studio-section" style={{ marginTop: 0, marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="studio-section-heading" style={{ marginBottom: 0 }}>
          Live pipeline activity
          {active.length > 0 && (
            <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-teal, #0d7377)' }}>
              {active.length} active
            </span>
          )}
        </div>
        {notifState === 'default' && (
          <button
            onClick={async () => setNotifState(await Notification.requestPermission())}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: 6,
                     border: '1px solid var(--ds-border)', background: 'var(--ds-card-bg)',
                     color: 'var(--ds-text)', cursor: 'pointer' }}>
            🔔 Alert me on failures
          </button>
        )}
      </div>

      {fetchError && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#b91c1c' }}>
          Could not load job feed: {fetchError}
        </div>
      )}

      {loaded && jobs.length === 0 && !fetchError && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
          No pipeline runs in the last 48 hours. Runs started from the terminal appear here too.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: jobs.length ? '0.9rem' : 0 }}>
        {[...active, ...finished].map(job => {
          const stalled = isStalled(job, now)
          const chip = statusChip(job, stalled)
          const prog = progressInfo(job)
          const running = job.status === 'running'
          return (
            <div key={job.id} style={{
              border: `1px solid ${job.status === 'error' ? '#b91c1c' : stalled ? '#b45309' : 'var(--ds-border)'}`,
              borderRadius: 8, padding: '0.7rem 0.9rem', background: 'var(--ds-card-bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                  padding: '0.15rem 0.5rem', borderRadius: 999, background: chip.bg, color: chip.fg,
                }}>
                  {chip.label}
                </span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{jobLabel(job.jobType)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                  {running || job.status === 'pending'
                    ? `started ${fmtElapsed(job.startedAt ?? job.createdAt, null, now)} ago`
                    : `${fmtElapsed(job.startedAt ?? job.createdAt, job.completedAt, now)} · ${new Date(job.createdAt).toLocaleTimeString()}`}
                </span>
                {job.workerId && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint)' }}>{job.workerId}</span>
                )}
              </div>

              {stalled && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#b45309' }}>
                  No heartbeat for over 3 minutes — the process has probably died or lost connection.
                  The worker will retry it automatically after the 15-minute lease expires.
                </div>
              )}

              {(running || job.status === 'pending') && prog.pct !== null && (
                <div style={{ marginTop: '0.55rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--ds-text-muted)', marginBottom: '0.25rem' }}>
                    <span>{prog.text}</span>
                    <span>{prog.pct}%</span>
                  </div>
                  <div style={{ height: 7, background: 'var(--ds-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${prog.pct}%`, borderRadius: 4, transition: 'width 0.4s ease',
                                  background: stalled ? '#b45309' : 'var(--ds-teal, #0d7377)' }} />
                  </div>
                </div>
              )}
              {(running || job.status === 'pending') && prog.pct === null && prog.text && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>{prog.text}</div>
              )}

              {job.status === 'error' && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
                  {job.errorMessage ?? 'Unknown error'}
                </div>
              )}

              {job.status === 'done' && Object.keys(job.result ?? {}).length > 0 && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.76rem', color: 'var(--ds-text-muted)' }}>
                  {Object.entries(job.result)
                    .filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
                    .slice(0, 6)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </div>
              )}

              {job.logTail.length > 0 && (
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ fontSize: '0.74rem', color: 'var(--ds-text-muted)', cursor: 'pointer' }}>
                    Log ({job.logTail.length} recent lines)
                  </summary>
                  <pre style={{
                    marginTop: '0.4rem', padding: '0.6rem', borderRadius: 6, maxHeight: 220, overflow: 'auto',
                    background: 'var(--ds-bg, #111)', color: 'var(--ds-text)', fontSize: '0.72rem', whiteSpace: 'pre-wrap',
                  }}>
                    {job.logTail.join('\n')}
                  </pre>
                </details>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
