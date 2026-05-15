import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { StudioShell } from '@/components/studio/StudioShell'

export default async function DashboardPage() {
  const session = await getStudioSession()

  // (protected) layout ensures profile is non-null, but guard here for type safety
  if (!session.profile) redirect('/login')

  // Admin → always go straight to the admin workspace
  if (session.globalRole === 'buildquote_admin') {
    redirect('/admin/manufacturers')
  }

  // Manufacturer with at least one active membership → go to their workspace
  if (session.globalRole === 'manufacturer_user' && session.memberships.length > 0) {
    redirect('/manufacturer/dashboard')
  }

  // Reviewer or manufacturer with no memberships → show a landing page below
  const isReviewer = session.globalRole === 'buildquote_reviewer'
  const isUnassignedMfr =
    session.globalRole === 'manufacturer_user' && session.memberships.length === 0

  const displayName = session.profile.fullName ?? session.profile.email

  return (
    <StudioShell role="dashboard" subtitle={displayName} notice={null}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Dashboard</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Signed in as <strong>{session.profile.email}</strong>
        {session.profile.fullName ? ` (${session.profile.fullName})` : ''} · Role:{' '}
        <code style={{ fontSize: '0.85em' }}>{session.globalRole}</code>
      </p>

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
