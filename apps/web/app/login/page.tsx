import { redirect } from 'next/navigation'
import { getStudioSession, resolvePostLoginPath } from '@/lib/studio-auth/session'
import { LoginForm } from '@/components/studio/LoginForm'

export default async function LoginPage() {
  // If the user already has a valid Studio profile, send them to the right area directly
  const session = await getStudioSession()
  if (session.profile) {
    redirect(resolvePostLoginPath(session))
  }

  const envMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return (
    <div
      className="studio-page"
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>BuildQuote Data Studio</h1>
          <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Private Manufacturer Admin
          </p>
        </div>

        {envMissing && (
          <div className="studio-warn" style={{ marginBottom: '1.5rem', fontSize: '0.83rem' }}>
            Supabase environment variables are not configured. Add{' '}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
            <code>apps/web/.env.local</code>.
          </div>
        )}

        <div
          style={{
            background: 'var(--ds-card-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 8,
            padding: '1.75rem',
          }}
        >
          <h2 style={{ fontSize: '1.05rem', marginBottom: '1.25rem' }}>Sign in to continue</h2>
          <LoginForm />
        </div>

        <p
          style={{
            marginTop: '1.25rem',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--ds-text-faint)',
            margin: '1.25rem 0 0',
          }}
        >
          Authorised users only. Contact BuildQuote to request access.
        </p>
      </div>
    </div>
  )
}
