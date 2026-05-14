import { getStudioSession } from '@/lib/studio-auth/session'
import { StudioShell } from '@/components/studio/StudioShell'
import { logout } from '@/lib/studio-auth/actions'

/**
 * Auth-check test page — lives under the (protected) route group.
 *
 * Accessible at /auth-check. If you can see this page, the protected layout
 * successfully verified your session. If you are signed out, you will be
 * redirected to /login before this page renders.
 *
 * This page is for local development verification only.
 * It can be removed or moved once the main Studio routes are protected.
 */
export default async function AuthCheckPage() {
  // Session is already verified by layout.tsx — this is purely for display
  const session = await getStudioSession()

  return (
    <StudioShell role="dashboard" notice={null}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Auth check</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        If you can see this page, the protected route group is working correctly.
      </p>

      <div className="studio-info" style={{ marginBottom: '1.5rem' }}>
        Session verified via{' '}
        <code style={{ fontSize: '0.82rem' }}>supabase.auth.getUser()</code> in{' '}
        <code style={{ fontSize: '0.82rem' }}>getStudioSession()</code>. JWT re-validated
        server-side on this request.
      </div>

      <div
        style={{
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border)',
          borderRadius: 8,
          padding: '1.25rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            fontSize: '0.82rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--ds-text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          Session
        </div>
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '0.4rem 1rem',
            fontSize: '0.875rem',
          }}
        >
          <dt style={{ color: 'var(--ds-text-muted)' }}>Auth email</dt>
          <dd style={{ margin: 0 }}>{session.user?.email ?? '—'}</dd>

          <dt style={{ color: 'var(--ds-text-muted)' }}>Global role</dt>
          <dd style={{ margin: 0 }}>
            {session.globalRole ? (
              <code
                style={{
                  background: 'var(--ds-page-bg)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: 4,
                  fontSize: '0.82rem',
                }}
              >
                {session.globalRole}
              </code>
            ) : (
              <span style={{ color: 'var(--ds-text-faint)' }}>no profile</span>
            )}
          </dd>

          <dt style={{ color: 'var(--ds-text-muted)' }}>Profile status</dt>
          <dd style={{ margin: 0 }}>{session.profile?.status ?? '—'}</dd>

          <dt style={{ color: 'var(--ds-text-muted)' }}>Memberships</dt>
          <dd style={{ margin: 0 }}>
            {session.memberships.length === 0
              ? 'none (admin/reviewer have global access)'
              : session.memberships.map((m) => `${m.manufacturerId} (${m.role})`).join(', ')}
          </dd>
        </dl>
      </div>

      <form action={logout}>
        <button type="submit" className="studio-btn studio-btn-ghost">
          Sign out
        </button>
      </form>

      <p
        style={{
          marginTop: '1.5rem',
          fontSize: '0.78rem',
          color: 'var(--ds-text-faint)',
        }}
      >
        V1 auth gate only — role-based authorization and RLS policies are not yet active.
        Existing Studio routes remain accessible without login until the next chunk moves
        them under the protected group.
      </p>
    </StudioShell>
  )
}
