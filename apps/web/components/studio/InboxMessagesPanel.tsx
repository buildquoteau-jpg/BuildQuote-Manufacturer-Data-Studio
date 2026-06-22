'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'
import { sendManufacturerMessage, acknowledgeAdminMessage } from '@/lib/studio-manufacturer/messages-actions'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function InboxMessagesPanel({
  manufacturerId,
  initialMessages,
}: {
  manufacturerId: string
  initialMessages: ManufacturerMessage[]
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function handleSend() {
    const body = draft.trim()
    if (!body) return
    setError(null)
    startTransition(async () => {
      const res = await sendManufacturerMessage(manufacturerId, body)
      if (!res.ok) { setError(res.error); return }
      setMessages(prev => [...prev, {
        id: `local-${Date.now()}`,
        manufacturer_id: manufacturerId,
        sender_type: 'manufacturer',
        sender_label: 'You',
        body,
        message_type: 'help',
        related_publish_batch_id: null,
        acknowledged_at: null,
        created_at: new Date().toISOString(),
      }])
      setDraft('')
    })
  }

  function handleAcknowledge(messageId: string) {
    startTransition(async () => {
      const res = await acknowledgeAdminMessage(messageId, manufacturerId)
      if (!res.ok) return
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, acknowledged_at: new Date().toISOString() } : m,
      ))
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '520px', border: '1px solid var(--ds-border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ds-text-faint)', textAlign: 'center', marginTop: '2rem' }}>
            No messages yet — send a message to BuildQuote below.
          </div>
        ) : (
          messages.map((m) => {
            const isFromAdmin = m.sender_type === 'buildquote'
            const isMine = !isFromAdmin
            const needsAck = isFromAdmin && !m.acknowledged_at

            return (
              <div key={m.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--ds-text-faint)', marginBottom: '3px', textAlign: isMine ? 'right' : 'left',
                }}>
                  {m.sender_label ?? (isFromAdmin ? 'BuildQuote' : 'You')}
                  {m.message_type === 'submission' && (
                    <span style={{ marginLeft: '6px', color: '#16a34a' }}>· Submission</span>
                  )}
                </div>
                <div style={{
                  padding: '8px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.45,
                  background: isMine ? '#185D7A' : needsAck ? '#fffbeb' : '#f1f5f9',
                  color: isMine ? '#fff' : '#1f2937',
                  border: needsAck ? '1.5px solid #fcd34d' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.body}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                }}>
                  <span style={{ fontSize: '10px', color: 'var(--ds-text-faint)' }}>
                    {formatDate(m.created_at)}
                  </span>
                  {needsAck && (
                    <button
                      type="button"
                      onClick={() => handleAcknowledge(m.id)}
                      disabled={pending}
                      style={{
                        fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                        background: '#f0fdf4', color: '#16a34a',
                        border: '1px solid #86efac', borderRadius: '4px',
                        padding: '2px 7px', lineHeight: 1.5,
                      }}
                    >
                      ✓ Acknowledge
                    </button>
                  )}
                  {isFromAdmin && m.acknowledged_at && (
                    <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>
                      ✓ Acknowledged
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--ds-border)', padding: '10px', display: 'flex', gap: '8px' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          placeholder="Send a message to BuildQuote…"
          rows={1}
          style={{
            flex: 1, resize: 'none', padding: '8px 10px',
            border: '1.5px solid var(--ds-border)', borderRadius: '8px',
            fontSize: '13px', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !draft.trim()}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: pending || !draft.trim() ? '#9ca3af' : '#185D7A', color: '#fff',
            fontSize: '13px', fontWeight: 700, cursor: pending || !draft.trim() ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
      {error && (
        <div style={{ padding: '0 10px 8px', fontSize: '11px', color: '#dc2626' }}>{error}</div>
      )}
    </div>
  )
}
