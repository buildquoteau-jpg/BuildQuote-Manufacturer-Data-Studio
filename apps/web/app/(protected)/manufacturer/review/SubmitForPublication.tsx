'use client'

import { useState, useTransition } from 'react'
import { submitForPublication } from '@/lib/studio-manufacturer/verification-actions'

export function SubmitForPublication({
  manufacturerId,
  verifiedCount,
  totalCount,
  liveCount,
  updateReadyCount,
}: {
  manufacturerId: string
  verifiedCount: number
  totalCount: number
  liveCount: number
  updateReadyCount: number
}) {
  const newCount = verifiedCount - liveCount
  const defaultMessage = updateReadyCount > 0 && newCount === 0
    ? `Hi BuildQuote, we have ${updateReadyCount} system card${updateReadyCount !== 1 ? 's' : ''} with updates ready to re-publish. Please push the changes live. Thanks.`
    : updateReadyCount > 0
      ? `Hi BuildQuote, we have ${newCount} new system${newCount !== 1 ? 's' : ''} and ${updateReadyCount} update${updateReadyCount !== 1 ? 's' : ''} to live systems ready to publish. Go.`
      : `Hi BuildQuote, we have verified ${verifiedCount} out of ${totalCount} systems and would like to publish the verified system cards please. Go.`
  const [message, setMessage] = useState(defaultMessage)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<
    { ok: true; systemCount: number; newCount?: number; updateCount?: number } | { ok: false; error: string } | null
  >(null)

  if (verifiedCount === 0) return null

  function handleSubmit() {
    setResult(null)
    startTransition(async () => {
      const res = await submitForPublication(manufacturerId, message.trim() || null)
      if (!res.ok) { setResult({ ok: false, error: res.error }); return }
      setResult({
        ok: true,
        systemCount: res.systemCount ?? verifiedCount,
        newCount: res.newCount,
        updateCount: res.updateCount,
      })
    })
  }

  if (result?.ok) {
    const breakdown = [
      result.newCount ? `${result.newCount} new` : null,
      result.updateCount ? `${result.updateCount} update${result.updateCount !== 1 ? 's' : ''} to live system${result.updateCount !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' and ')

    return (
      <div style={{
        marginTop: '1.5rem', padding: '16px', borderRadius: '10px',
        background: '#f0fdf4', border: '1px solid #bbf7d0',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', marginBottom: '4px' }}>
          Submitted to BuildQuote
        </div>
        <div style={{ fontSize: '12px', color: '#374151' }}>
          {result.systemCount} system{result.systemCount !== 1 ? 's' : ''} sent for publication review
          {breakdown ? ` (${breakdown})` : ''}. BuildQuote will check and publish them — you'll be
          notified once they go live.
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: '1.5rem', padding: '16px', borderRadius: '10px',
      background: '#fff', border: '1.5px solid #185D7A',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        Ready to publish?
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
        {verifiedCount} of {totalCount} system{totalCount !== 1 ? 's' : ''} verified
        {(newCount > 0 || updateReadyCount > 0) && (
          <> — {[
            newCount > 0 ? `${newCount} new` : null,
            updateReadyCount > 0 ? `${updateReadyCount} update${updateReadyCount !== 1 ? 's' : ''} to live systems` : null,
          ].filter(Boolean).join(', ')} ready to send</>
        )}
        . Submit your verified cards to BuildQuote for publication — you don't need to wait until every system is done.
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 10px',
          border: '1.5px solid #e2e8f0', borderRadius: '8px',
          fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.5,
          resize: 'vertical', outline: 'none', color: '#374151', marginBottom: '10px',
        }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending}
        style={{
          padding: '8px 16px', borderRadius: '6px', border: 'none',
          background: pending ? '#9ca3af' : '#16a34a', color: '#fff',
          fontSize: '13px', fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? 'Submitting…' : updateReadyCount > 0 && newCount === 0
          ? `Submit ${updateReadyCount} update${updateReadyCount !== 1 ? 's' : ''} to BuildQuote`
          : updateReadyCount > 0
            ? `Submit ${newCount} new + ${updateReadyCount} update${updateReadyCount !== 1 ? 's' : ''} to BuildQuote`
            : `Submit ${verifiedCount} verified system${verifiedCount !== 1 ? 's' : ''} to BuildQuote`}
      </button>
      {result && !result.ok && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{result.error}</div>
      )}
    </div>
  )
}
