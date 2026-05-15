import { getStudioSession } from '@/lib/studio-auth/session'
import { StudioShell } from '@/components/studio/StudioShell'
import { logout } from '@/lib/studio-auth/actions'

/**
 * Auth-check test page — lives under the (protected) route group.
 *
 * Accessible at /auth-check. Redirects to /login if no valid session exists.
 * For local development verification of the login/logout round-trip.
 *
 * Shows session state without exposing tokens, cookies, or env vars.
 */
export default async function AuthCheckPage() {
  const session = await getStudioSession()

  // Truncate UUIDs for display — enough to identify, not a full token surface
  function truncate(id: string | undefined | null): string {
    if (!id) return '—'
    return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
  }

  return (
    <StudioShell role="dashboard" notice={null}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Auth check</h1>
        <span className="studio-badge studio-badge-approved">session valid</span>
      </div>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        You reached this page, so the protected route group is working. Session was verified
        via <code style={{ fontSize: '0.82rem' }}>supabase.auth.getUser()</code> — JWT
        re-validated server-side on this request.
      </p>

      {/* Auth user */}
      <Section title="Supabase Auth user">
        <Row label="Email">{session.user?.email ?? '—'}</Row>
        <Row label="Auth user ID">
          <code style={codeStyle}>{truncate(session.user?.id)}</code>
        </Row>
      </Section>

      {/* Studio profile */}
      <Section title="Studio profile (data_studio_user_profiles)">
        {session.profile ? (
          <>
            <Row label="Profile ID">
              <code style={codeStyle}>{truncate(session.profile.id)}</code>
            </Row>
            <Row label="Full name">{session.profile.fullName ?? '—'}</Row>
            <Row label="Email">{session.profile.email}</Row>
            <Row label="Global role">
              <code style={{ ...codeStyle, fontWeight: 700 }}>{session.profile.globalRole}</code>
            </Row>
            <Row label="Status">
              <span
                style={{
                  color: session.profile.status === 'active' ? '#166534' : '#92400e',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                {session.profile.status}
              </span>
            </Row>
          </>
        ) : (
          <Row label="Profile">
            <span style={{ color: 'var(--ds-text-faint)', fontStyle: 'italic' }}>
              No profile row found in data_studio_user_profiles.
              Run the SQL snippet in supabase/snippets/local-auth-test-user.sql.
            </span>
          </Row>
        )}
      </Section>

      {/* Memberships */}
      <Section title="Manufacturer memberships (manufacturer_users)">
        {session.globalRole === 'buildquote_admin' || session.globalRole === 'buildquote_reviewer' ? (
          <Row label="Access">
            <span style={{ color: 'var(--ds-text-sub)', fontStyle: 'italic' }}>
              Global — no membership rows needed for this role.
            </span>
          </Row>
        ) : session.memberships.length === 0 ? (
          <Row label="Memberships">
            <span style={{ color: 'var(--ds-text-faint)', fontStyle: 'italic' }}>
              None. Add a manufacturer_users row via the SQL snippet (STEP 2).
            </span>
          </Row>
        ) : (
          <>
            <Row label="Count">{session.memberships.length}</Row>
            {session.memberships.map((m, i) => (
              <Row key={m.id} label={`Membership ${i + 1}`}>
                <span style={{ fontSize: '0.82rem' }}>
                  <code style={codeStyle}>{truncate(m.manufacturerId)}</code>
                  {' · '}
                  <strong>{m.role}</strong>
                  {' · '}
                  {m.status}
                </span>
              </Row>
            ))}
          </>
        )}
      </Section>

      {/* Sign out */}
      <form action={logout} style={{ marginTop: '1.5rem' }}>
        <button type="submit" className="studio-btn studio-btn-ghost">
          Sign out
        </button>
      </form>

      <p style={{ marginTop: '1.25rem', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
        V1 auth gate only. Role-based authorization and RLS are not yet active.
        See <code style={{ fontSize: '0.75rem' }}>docs/local-auth-test-runbook.md</code> for
        the full test walkthrough.
      </p>
    </StudioShell>
  )
}

// ── Small layout helpers ────────────────────────────────────────────────────

const codeStyle: React.CSSProperties = {
  background: 'var(--ds-page-bg)',
  padding: '0.1rem 0.35rem',
  borderRadius: 4,
  fontSize: '0.82rem',
  fontFamily: 'monospace',
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--ds-card-bg)',
        border: '1px solid var(--ds-border)',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--ds-text-muted)',
          marginBottom: '0.75rem',
        }}
      >
        {title}
      </div>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '0.4rem 1.25rem',
          margin: 0,
        }}
      >
        {children}
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem', margin: 0 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: '0.875rem' }}>{children}</dd>
    </>
  )
}
