import { notFound } from 'next/navigation'
import { StudioShell } from '@/components/studio/StudioShell'
import { MessageThread } from '@/components/studio/MessageThread'
import { getManufacturerMessages, sendAdminReply } from '@/lib/studio-manufacturer/messages-actions'
import { getManufacturerInfo } from '@/lib/studio-manufacturer/workspace'

export const dynamic = 'force-dynamic'

export default async function AdminMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: manufacturerId } = await params

  const [mfrResult, messagesResult] = await Promise.all([
    getManufacturerInfo(manufacturerId),
    getManufacturerMessages(manufacturerId),
  ])

  if (!mfrResult.ok) notFound()

  return (
    <StudioShell role="admin" subtitle={`${mfrResult.manufacturer.name} · Messages`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <a href="/admin/messages" style={{ fontSize: '0.82rem', color: '#185D7A', textDecoration: 'none' }}>
          ← All messages
        </a>
        <h1 style={{ fontSize: '1.25rem' }}>{mfrResult.manufacturer.name}</h1>
      </div>

      {!messagesResult.ok ? (
        <div className="studio-warn">Could not load messages: {messagesResult.error}</div>
      ) : (
        <MessageThread
          manufacturerId={manufacturerId}
          initialMessages={messagesResult.messages}
          viewerRole="buildquote"
          sendMessage={sendAdminReply}
          placeholder={`Reply to ${mfrResult.manufacturer.name}…`}
        />
      )}
    </StudioShell>
  )
}
