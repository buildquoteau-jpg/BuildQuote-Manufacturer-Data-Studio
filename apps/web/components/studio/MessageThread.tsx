'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'

type SendResult = { ok: true } | { ok: false; error: string }

export function MessageThread({
  manufacturerId,
  initialMessages,
  viewerRole,
  sendMessage,
  placeholder,
}: {
  manufacturerId: string
  initialMessages: ManufacturerMessage[]
  viewerRole: 'manufacturer' | 'buildquote'
  sendMessage: (manufacturerId: string, body: string) => Promise<SendResult>
  placeholder?: string
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
      const res = await sendMessage(manufacturerId, body)
      if (!res.ok) { setError(res.error); return }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          manufacturer_id: manufacturerId,
          sender_type: viewerRole,
          sender_label: 'You',
          body,
          message_type: 'general',
          related_publish_batch_id: null,
          acknowledged_at: null,
          created_at: new Date().toISOString(),
        },
      ])
      setDraft('')
    })
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '440px',
      border: '1px solid var(--ds-border)', borderRadius: 10, overflow: 'hidden', background: '#fff',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ds-text-faint)', textAlign: 'center', marginTop: '2rem' }}>
            No messages yet — say hello 👋
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_type === viewerRole
            return (
              <div key={m.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  color: 'var(--ds-text-faint)', marginBottom: '3px', textAlign: isMine ? 'right' : 'left',
                }}>
                  {m.sender_label ?? (m.sender_type === 'buildquote' ? 'BuildQuote' : 'Manufacturer')}
                  {m.message_type === 'submission' && (
                    <span style={{ marginLeft: '6px', color: '#16a34a' }}>· Submission</span>
                  )}
                </div>
                <div style={{
                  padding: '8px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.45,
                  background: isMine ? '#185D7A' : '#f1f5f9',
                  color: isMine ? '#fff' : '#1f2937',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.body}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--ds-text-faint)', marginTop: '3px', textAlign: isMine ? 'right' : 'left' }}>
                  {new Date(m.created_at).toLocaleString('en-AU', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={placeholder ?? 'Type a message…'}
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
      {error && <div style={{ padding: '0 10px 8px', fontSize: '11px', color: '#dc2626' }}>{error}</div>}
    </div>
  )
}
