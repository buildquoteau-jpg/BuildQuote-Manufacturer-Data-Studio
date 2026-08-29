'use client'

// Replaces the old SubmitForPublication box (per-user request, screenshot
// feedback): the approval-queue mechanism it drove — submitForPublication()
// creating a publish_batches/publish_batch_items row for a BuildQuote admin
// to later approve at /admin/publish — predates hybrid publishing
// (LIVE_PUBLISH_BYPASS_APPROVAL) and is no longer how a manufacturer's
// cards go live; that's the Publish tab now, direct and unattended. This
// box keeps the one part of the old one still worth having: a quick way to
// send BuildQuote a question or comment, landing in the same
// manufacturer_messages thread the Inbox already reads
// (sendManufacturerMessage — no new server action needed).

import { useState, useTransition } from 'react'
import { sendManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'

export function AdminMessageBox({ manufacturerId }: { manufacturerId: string }) {
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null)

  function handleSend() {
    if (!message.trim()) return
    setResult(null)
    startTransition(async () => {
      const res = await sendManufacturerMessage(manufacturerId, message.trim())
      if (!res.ok) { setResult({ ok: false, error: res.error }); return }
      setResult({ ok: true })
      setMessage('')
    })
  }

  return (
    <div style={{
      marginTop: '1.5rem', padding: '16px', borderRadius: '10px',
      background: '#fff', border: '1.5px solid #e2e8f0',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        Questions or comments for BuildQuote
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '10px' }}>
        Not required to publish — use the Publish tab to send a verified card live directly.
        This just reaches BuildQuote if you need help with something.
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. one of our documents won't upload, or a question about a specific product…"
        rows={3}
        disabled={pending}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '8px 10px',
          border: '1.5px solid #e2e8f0', borderRadius: '8px',
          fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.5,
          resize: 'vertical', outline: 'none', color: '#374151', marginBottom: '10px',
        }}
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={pending || !message.trim()}
        style={{
          padding: '8px 16px', borderRadius: '6px', border: 'none',
          background: pending || !message.trim() ? '#9ca3af' : '#185D7A', color: '#fff',
          fontSize: '13px', fontWeight: 700, cursor: pending || !message.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? 'Sending…' : 'Send to BuildQuote'}
      </button>
      {result?.ok && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
          Sent — check your Inbox for a reply.
        </div>
      )}
      {result && !result.ok && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{result.error}</div>
      )}
    </div>
  )
}
