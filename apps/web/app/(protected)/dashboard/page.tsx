import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { StudioShell } from '@/components/studio/StudioShell'

const ADMIN_MENU = [
  {
    title: 'Manufacturers',
    href: '/admin/manufacturers',
    description: 'View all manufacturer workspaces, documents, systems and components.',
    emoji: '🏭',
  },
  {
    title: 'System Card Preview',
    href: '/system-card-preview',
    description: 'Preview how system cards render for the BuildQuote widget.',
    emoji: '🃏',
  },
]

export default async function DashboardPage() {
  const session = await getStudioSession()

  if (!session.profile) redirect('/login')

  // Manufacturer with at least one active membership → go to their workspace
  if (session.globalRole === 'manufacturer_user' && session.memberships.length > 0) {
    redirect('/manufacturer/dashboard')
  }

  const isAdmin = session.globalRole === 'buildquote_admin'
  const isReviewer = session.globalRole === 'buildquote_reviewer'
  const isUnassignedMfr =
    session.globalRole === 'manufacturer_user' && session.memberships.length === 0

  const displayName = session.profile.fullName ?? session.profile.email

  return (
    <StudioShell role={isAdmin ? 'admin' : 'dashboard'} subtitle={displayName} notice={null}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>BuildQuote Data Studio</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
        Signed in as <strong>{session.profile.email}</strong>
        {session.profile.fullName ? ` · ${session.profile.fullName}` : ''}
      </p>

      {isAdmin && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1rem',
            // A short menu shouldn't stretch across a wide monitor — cap it so
            // the tiles form a tidy cluster instead of stranding top-left.
            maxWidth: 680,
          }}
        >
          {ADMIN_MENU.map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: 'block',
                background: 'var(--ds-card-bg)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8,
                padding: '1.25rem',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{item.emoji}</div>
              <div style={{ fontWeight: 600, color: 'var(--ds-navy)', marginBottom: '0.35rem' }}>
                {item.title}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', lineHeight: 1.45 }}>
                {item.description}
              </div>
            </a>
          ))}
        </div>
      )}

      {isReviewer && (
        <div className="studio-info">
          Review workspace coming next. Your access will be configured here once the review area
          is built.
        </div>
      )}

      {isUnassignedMfr && (
        <div className="studio-warn">
          No manufacturer workspace assigned yet. Contact BuildQuote admin to be added to a
          workspace.
        </div>
      )}
    </StudioShell>
  )
}
