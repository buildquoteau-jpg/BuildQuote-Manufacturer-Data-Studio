'use client'

import { useState, useTransition } from 'react'
import { previewPublishBatch, runPublishBatch, type PendingBatch } from '@/lib/studio-admin/publish-actions'
import type { PublishBatchResult, PublishItemResult } from '@/lib/studio-admin/publish'

const ACTION_COLOR: Record<string, string> = {
  created: '#16a34a',
  updated: '#185D7A',
  skipped: '#9ca3af',
}

function ItemRow({ item }: { item: PublishItemResult }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: '8px',
      border: `1px solid ${item.ok ? '#e5e7eb' : '#fecaca'}`,
      background: item.ok ? '#fff' : '#fef2f2',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '13px', color: '#0f172a' }}>{item.systemName}</strong>
        <span style={{ fontSize: '11px', fontWeight: 700, color: ACTION_COLOR[item.systemAction] }}>
          {item.systemAction.toUpperCase()}
        </span>
        {!item.ok && <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>FAILED</span>}
      </div>

      {item.ok ? (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
          manufacturer: {item.manufacturerAction} · catalogue source: {item.catalogueSourceAction} ·{' '}
          {item.profiles.length} profile{item.profiles.length !== 1 ? 's' : ''} ·{' '}
          {item.colours.length} colour{item.colours.length !== 1 ? 's' : ''} ·{' '}
          {item.components.length} component{item.components.length !== 1 ? 's' : ''}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>{item.error}</div>
      )}
    </div>
  )
}

function ResultSummary({ result }: { result: PublishBatchResult }) {
  if (!result.ok) return <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>{result.error}</div>
  return (
    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: result.failed > 0 ? '#d97706' : '#16a34a' }}>
        {result.dryRun ? 'Preview' : 'Publish'} result: {result.succeeded} succeeded
        {result.failed > 0 ? `, ${result.failed} failed` : ''}
      </div>
      {result.items.map((item) => <ItemRow key={item.systemId} item={item} />)}
    </div>
  )
}

function BatchCard({ batch }: { batch: PendingBatch }) {
  const [expanded, setExpanded] = useState(false)
  const [previewResult, setPreviewResult] = useState<PublishBatchResult | null>(null)
  const [publishResult, setPublishResult] = useState<PublishBatchResult | null>(null)
  const [confirmingPublish, setConfirmingPublish] = useState(false)
  const [pending, startTransition] = useTransition()

  function handlePreview() {
    setExpanded(true)
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
      background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.95rem', color: 'var(--ds-navy)' }}>{batch.manufacturer_name}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
              {new Date(batch.created_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {batch.notes && (
            <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-sub)', marginTop: '4px', maxWidth: '520px' }}>
              "{batch.notes}"
            </div>
          )}
          <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '6px' }}>
            {batch.new_count > 0 && <span style={{ color: '#16a34a', fontWeight: 600, marginRight: '10px' }}>{batch.new_count} new</span>}
            {batch.update_count > 0 && <span style={{ color: '#185D7A', fontWeight: 600, marginRight: '10px' }}>{batch.update_count} update{batch.update_count !== 1 ? 's' : ''}</span>}
            {batch.failed_count > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>{batch.failed_count} previously failed</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button type="button" onClick={handlePreview} disabled={pending}
            style={{ padding: '6px 14px', borderRadius: '6px', border: '1.5px solid #185D7A', background: '#fff', color: '#185D7A', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
            Preview
          </button>
          {!isDone && (
            confirmingPublish ? (
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
              <button type="button" onClick={() => setConfirmingPublish(true)} disabled={pending}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>
                Publish
              </button>
            )
          )}
        </div>
      </div>

      {expanded && previewResult && !publishResult && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dry run — nothing written yet
          </div>
          <ResultSummary result={previewResult} />
        </div>
      )}

      {publishResult && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Published
          </div>
          <ResultSummary result={publishResult} />
        </div>
      )}
    </div>
  )
}

export function PublishQueueClient({ initialBatches }: { initialBatches: PendingBatch[] }) {
  if (initialBatches.length === 0) {
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
      {initialBatches.map((b) => <BatchCard key={b.id} batch={b} />)}
      <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '0.25rem' }}>
        Reload the page to refresh this list once you're done — published batches stay visible
        with their result until then so you can see what happened.
      </p>
    </div>
  )
}
