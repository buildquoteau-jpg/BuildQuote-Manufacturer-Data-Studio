import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import { getManufacturerMessages, sendManufacturerMessage, type ManufacturerMessage } from '@/lib/studio-manufacturer/messages-actions'
import { StudioShell } from '@/components/studio/StudioShell'
import { MessageThread } from '@/components/studio/MessageThread'

const HELP_SECTIONS = [
  {
    title: 'Uploading documents',
    body: 'Go to Documents and upload your product guides, installation guides, or catalogues as PDFs. Each file will be queued for AI extraction. Supported types: Product Guide, Installation Guide, Brochure/Catalogue.',
  },
  {
    title: 'Reviewing extracted data',
    body: 'After extraction completes, go to Review to check each extracted system, profile, component, and colour against your source documents. Approve correct data and flag anything that needs correction.',
  },
  {
    title: 'Public page / widget preview',
    body: 'Use the Preview page to see how your public manufacturer page and system cards will appear before anything is published. This is a Studio-only preview — nothing is live until BuildQuote admin approves and triggers publish.',
  },
  {
    title: 'Approvals and publishing',
    body: 'Once you have verified your data, mark your workspace as ready for BuildQuote review. BuildQuote will check and approve the data. Production publish is BuildQuote-admin gated — manufacturer users cannot trigger a production publish.',
  },
]

export default async function ManufacturerHelpPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  let workspaceName: string | null = null
  let initialMessages: ManufacturerMessage[] = []
  if (ctx.found) {
    const mfrResult = await getManufacturerInfo(ctx.manufacturerId)
    workspaceName = mfrResult.ok ? mfrResult.manufacturer.name : null

    const messagesResult = await getManufacturerMessages(ctx.manufacturerId)
    if (messagesResult.ok) initialMessages = messagesResult.messages
  }

  return (
    <StudioShell role="manufacturer" subtitle="Help & Support">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Help &amp; Support</h1>

      {workspaceName && (
        <div
          style={{
            fontSize: '0.83rem',
            color: 'var(--ds-text-faint)',
            marginBottom: '1.25rem',
            paddingLeft: '0.25rem',
          }}
        >
          Workspace: <strong style={{ color: 'var(--ds-text-sub)' }}>{workspaceName}</strong>
        </div>
      )}

      {/* Contact */}
      <div
        style={{
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border)',
          borderRadius: 8,
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Contact BuildQuote</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.2rem' }}>📧</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.1rem' }}>
                Email support
              </div>
              <a
                href="mailto:support@buildquote.com.au?subject=BuildQuote%20Data%20Studio%20Support"
                style={{ fontSize: '0.875rem', color: 'var(--ds-navy)' }}
              >
                support@buildquote.com.au
              </a>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              opacity: 0.55,
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>💬</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.1rem' }}>
                WhatsApp support
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                WhatsApp Business support coming later
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Message board */}
      {ctx.found && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Message BuildQuote</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '0.75rem' }}>
            Ask a question, flag an issue, or just say hi — BuildQuote sees this on their end too.
            Submitting verified systems from the Review page also posts a message here automatically.
          </p>
          <MessageThread
            manufacturerId={ctx.manufacturerId}
            initialMessages={initialMessages}
            viewerRole="manufacturer"
            sendMessage={sendManufacturerMessage}
            placeholder="Ask BuildQuote a question…"
          />
        </div>
      )}

      {/* Help sections */}
      <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Guides</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {HELP_SECTIONS.map((section) => (
          <div key={section.title} className="studio-help-section">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          fontSize: '0.82rem',
          color: 'var(--ds-text-faint)',
          padding: '0 0.25rem',
        }}
      >
        BuildQuote Data Studio is currently in early development. More documentation will be
        added as features are connected.
      </div>
    </StudioShell>
  )
}
