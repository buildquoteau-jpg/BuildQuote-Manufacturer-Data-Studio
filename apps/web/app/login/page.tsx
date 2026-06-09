import { redirect } from 'next/navigation'
import { getStudioSession, resolvePostLoginPath } from '@/lib/studio-auth/session'
import { LoginForm } from '@/components/studio/LoginForm'

export default async function LoginPage() {
  const session = await getStudioSession()
  if (session.profile) {
    redirect(resolvePostLoginPath(session))
  }

  const envMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
        padding: '1.5rem',
      }}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #185D7A 0%, #1a7a9e 100%)',
            padding: '2rem 2rem 1.75rem',
            textAlign: 'center',
          }}
        >
          {/* BQ monogram */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              marginBottom: '1rem',
              fontSize: '1.3rem',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.02em',
            }}
          >
            BQ
          </div>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 0.3rem',
              letterSpacing: '-0.01em',
            }}
          >
            BuildQuote Data Studio
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Manufacturer Portal
          </p>
        </div>

        {/* Form area */}
        <div style={{ padding: '1.75rem 2rem 2rem' }}>
          {envMissing && (
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: 8,
                padding: '0.7rem 1rem',
                fontSize: '0.8rem',
                color: '#92400e',
                marginBottom: '1.25rem',
              }}
            >
              Studio environment not configured. Add Supabase variables to <code>.env.local</code>.
            </div>
          )}

          <h2
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--ds-text)',
              marginBottom: '1.25rem',
            }}
          >
            Sign in to continue
          </h2>

          <LoginForm />
        </div>
      </div>

      <p
        style={{
          marginTop: '1.5rem',
          fontSize: '0.78rem',
          color: 'rgba(255,255,255,0.5)',
          textAlign: 'center',
        }}
      >
        Authorised users only · Contact BuildQuote to request access
      </p>
    </div>
  )
}
