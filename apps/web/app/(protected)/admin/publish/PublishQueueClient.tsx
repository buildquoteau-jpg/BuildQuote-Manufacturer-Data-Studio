'use client'

import { useState, useTransition } from 'react'
import { previewPublishBatch, runPublishBatch, dismissPublishBatch, type PendingBatch, type BatchSystem } from '@/lib/studio-admin/publish-actions'
import type { PublishBatchResult, PublishItemResult } from '@/lib/studio-admin/publish'

const CHANGE_COLOR: Record<string, { bg: string; color: string }> = {
  new:    { bg: '#dcfce7', color: '#15803d' },
  update: { bg: '#dbeafe', color: '#1d4ed8' },
}

const ACTION_COLOR: Record<string, string> = {
  created: '#16a34a',
  updated: '#185D7A',
  skipped: '#9ca3af',
}

// ─── System list (before preview) ─────────────────────────────────────────────

function SystemListRow({ sys }: { sys: BatchSystem }) {
  const ct = CHANGE_COLOR[sys.change_type] ?? { bg: '#f3f4f6', color: '#374151' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
      {/* Thumbnail */}
      <div style={{
        width: 44, height: 44, borderRadius: '6px', flexShrink: 0, overflow: 'hidden',
        background: '#e2e8f0',
        ...(sys.hero_image_url ? { backgroundImage: `url(${sys.hero_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sys.name}
        </div>
        {sys.category && (
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>{sys.category}</div>
        )}
      </div>
      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '20px', background: ct.bg, color: ct.color, flexShrink: 0 }}>
        {sys.change_type}
      </span>
      {sys.item_status === 'failed' && (
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: '20px', flexShrink: 0 }}>
          PREV FAILED
        </span>
      )}
    </div>
  )
}

// ─── Preview result row ────────────────────────────────────────────────────────

function ItemRow({ item }: { item: PublishItemResult }) {
  const ct = item.systemAction === 'created' ? CHANGE_COLOR.new : item.systemAction === 'updated' ? CHANGE_COLOR.update : { bg: '#f3f4f6', color: '#374151' }

  return (
    <div style={{
      borderRadius: '8px',
      border: `1px solid ${item.ok ? '#e5e7eb' : '#fecaca'}`,
      background: item.ok ? '#fff' : '#fef2f2',
      overflow: 'hidden',
    }}>
      {/* System row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
        {/* Thumbnail */}
        <div style={{
          width: 52, height: 52, borderRadius: '6px', flexShrink: 0, overflow: 'hidden',
          background: '#e2e8f0',
          ...(item.heroImageUrl ? { backgroundImage: `url(${item.heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}>
          {!item.heroImageUrl && (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>NO IMG</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{item.systemName}</strong>
            {item.ok && (
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '20px', background: ct.bg, color: ct.color }}>
                {item.systemAction}
              </span>
            )}
            {!item.ok && <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>FAILED</span>}
          </div>
          {item.category && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.category}</div>
          )}
          {item.description && (
            <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '480px' }}>
              {item.description}
            </div>
          )}
        </div>
      </div>

      {/* Detail bar */}
      {item.ok ? (
        <div style={{ padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Manufacturer: <strong style={{ color: ACTION_COLOR[item.manufacturerAction] }}>{item.manufacturerAction}</strong>
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Catalogue source: <strong style={{ color: ACTION_COLOR[item.catalogueSourceAction] }}>{item.catalogueSourceAction}</strong>
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {item.profiles.length} profile{item.profiles.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {item.colours.length} colour{item.colours.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {item.components.length} component{item.components.length !== 1 ? 's' : ''}
          </span>
          {!item.heroImageUrl && (
            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>⚠ No hero image</span>
          )}
          {!item.description && (
            <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>⚠ No description</span>
          )}
          {!item.hasSourceDoc && (
            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>✕ No source doc</span>
          )}
        </div>
      ) : (
        <div style={{ padding: '8px 12px', background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
          <div style={{ fontSize: '12px', color: '#dc2626' }}>{item.error}</div>
        </div>
      )}
    </div>
  )
}

// ─── Result summary ────────────────────────────────────────────────────────────

function ResultSummary({ result }: { result: PublishBatchResult }) {
  if (!result.ok) return <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>{result.error}</div>
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: result.failed > 0 ? '#d97706' : '#16a34a' }}>
        {result.dryRun ? 'Preview' : 'Publish'} result: {result.succeeded} succeeded
        {result.failed > 0 ? `, ${result.failed} failed` : ''}
      </div>
      {result.items.map((item) => <ItemRow key={item.systemId} item={item} />)}
    </div>
  )
}

// ─── Batch card ────────────────────────────────────────────────────────────────

function BatchCard({ batch, onDismissed }: { batch: PendingBatch; onDismissed: (id: string) => void }) {
  const [previewResult, setPreviewResult] = useState<PublishBatchResult | null>(null)
  const [publishResult, setPublishResult] = useState<PublishBatchResult | null>(null)
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  const [confirmingDismiss, setConfirmingDismiss] = useState(false)
  const [pending, startTransition] = useTransition()
  const [dismissPending, startDismissTransition] = useTransition()

  function handleDismiss() {
    startDismissTransition(async () => {
      const res = await dismissPublishBatch(batch.id)
      if (res.ok) onDismissed(batch.id)
    })
  }

  function handlePreview() {
    startTransition(async () => {
      const res = await previewPublishBatch(batch.id)
      setPreviewResult(res)
    })
  }

  function handlePublish() {
    setConfirmingPublish(false)
    startTransition(async () => {
      const res = await runPublishBatch(batch.id)
      setPublishResult(res)
    })
  }

  const isDone = publishResult?.ok && publishResult.failed === 0

  return (
    <div style={{
      background: '#fff',
      border: isDone ? '1.5px solid #bbf7d0' : '1px solid var(--ds-border)',
      borderRadius: 10, padding: '16px',
      transition: 'border-color 0.3s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1rem', color: 'var(--ds-navy)' }}>{batch.manufacturer_name}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
              {new Date(batch.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {batch.notes && (
            <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-sub)', marginTop: '4px', maxWidth: '520px' }}>
              "{batch.notes}"
            </div>
          )}
          <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '6px', display: 'flex', gap: '10px' }}>
            {batch.new_count > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>{batch.new_count} new</span>}
            {batch.update_count > 0 && <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{batch.update_count} update{batch.update_count !== 1 ? 's' : ''}</span>}
            {batch.failed_count > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{batch.failed_count} prev failed</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {isDone ? (
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '5px 12px', borderRadius: '20px' }}>
              Published ✓
            </span>
          ) : (
            <>
              <button type="button" onClick={handlePreview} disabled={pending || dismissPending}
                style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #185D7A', background: '#fff', color: '#185D7A', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                {pending && !confirmingPublish ? 'Loading…' : previewResult ? 'Refresh preview' : 'Preview'}
              </button>
              {confirmingPublish ? (
                <>
                  <button type="button" onClick={handlePublish} disabled={pending}
                    style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                    {pending ? 'Publishing…' : 'Confirm publish'}
                  </button>
                  <button type="button" onClick={() => setConfirmingPublish(false)} disabled={pending}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmingPublish(true)} disabled={pending || dismissPending}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                  Publish
                </button>
              )}
            </>
          )}

          {/* Dismiss */}
          {!confirmingPublish && (
            confirmingDismiss ? (
              <>
                <button type="button" onClick={handleDismiss} disabled={dismissPending}
                  style={{ padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #dc2626', background: '#fff', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: dismissPending ? 'not-allowed' : 'pointer', opacity: dismissPending ? 0.6 : 1 }}>
                  {dismissPending ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button type="button" onClick={() => setConfirmingDismiss(false)} disabled={dismissPending}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmingDismiss(true)} disabled={pending || dismissPending}
                title="Delete this batch from the queue"
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#9ca3af', fontSize: '13px', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            )
          )}
        </div>
      </div>

      {/* System list — always visible */}
      {!publishResult && batch.systems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: previewResult ? '12px' : 0 }}>
          {batch.systems.map((sys) => <SystemListRow key={sys.id} sys={sys} />)}
        </div>
      )}

      {/* Dry-run preview */}
      {previewResult && !publishResult && (
        <div style={{ paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            Dry run — nothing written yet
          </div>
          <ResultSummary result={previewResult} />
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div style={{ paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
          <ResultSummary result={publishResult} />
        </div>
      )}
    </div>
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function PublishQueueClient({ initialBatches }: { initialBatches: PendingBatch[] }) {
  const [batches, setBatches] = useState(initialBatches)

  function handleDismissed(id: string) {
    setBatches(prev => prev.filter(b => b.id !== id))
  }

  if (batches.length === 0) {
    return (
      <div style={{
        background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8,
        padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--ds-text-muted)', fontSize: '0.9rem',
      }}>
        Nothing waiting to publish.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {batches.map((b) => <BatchCard key={b.id} batch={b} onDismissed={handleDismissed} />)}
      <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '0.25rem' }}>
        Reload the page to refresh this list once you're done — published batches stay visible
        with their result until then so you can see what happened.
      </p>
    </div>
  )
}
