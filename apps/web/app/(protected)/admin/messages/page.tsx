import { StudioShell } from '@/components/studio/StudioShell'
import { getAllMessageThreads } from '@/lib/studio-manufacturer/messages-actions'

export const dynamic = 'force-dynamic'

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  submission: { label: 'Submission', color: '#16a34a', bg: '#f0fdf4' },
  help:       { label: 'Help',       color: '#d97706', bg: '#fffbeb' },
  general:    { label: 'Message',    color: '#185D7A', bg: '#eef6fa' },
}

export default async function AdminMessagesPage() {
  const result = await getAllMessageThreads()

  return (
    <StudioShell role="admin" subtitle="Manufacturer messages">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Manufacturer messages</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.25rem' }}>
        Submissions, help requests, and general notes from manufacturer workspaces. Click a thread to read and reply.
      </p>

      {!result.ok ? (
        <div className="studio-warn">Could not load messages: {result.error}</div>
      ) : result.threads.length === 0 ? (
        <div
          style={{
            background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8,
            padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--ds-text-muted)', fontSize: '0.9rem',
          }}
        >
          No messages yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {result.threads.map((t) => {
            const badge = TYPE_BADGE[t.last_message.message_type] ?? TYPE_BADGE.general
            return (
              <a
                key={t.manufacturer_id}
                href={`/admin/messages/${t.manufacturer_id}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
                  background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 10,
                  padding: '0.9rem 1.1rem', textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--ds-navy)' }}>{t.manufacturer_name}</strong>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: '20px',
                    }}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
                      {t.message_count} message{t.message_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.85rem', color: 'var(--ds-text-sub)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      {t.last_message.sender_type === 'buildquote' ? 'You: ' : ''}
                    </span>
                    {t.last_message.body}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', whiteSpace: 'nowrap' }}>
                  {new Date(t.last_message.created_at).toLocaleString('en-AU', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </a>
            )
          })}
        </div>
      )}
    </StudioShell>
  )
}
