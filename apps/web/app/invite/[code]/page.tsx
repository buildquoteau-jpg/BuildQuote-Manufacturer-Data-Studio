import { createStudioServiceClient } from '@/lib/supabase/service'
import { createStudioServerClient } from '@/lib/supabase/server'
import { verifyWorkspaceInviteCode } from '@/lib/studio-auth/inviteToken'
import { InviteAcceptClient } from './InviteAcceptClient'

export const dynamic = 'force-dynamic'

export default async function InviteRedeemPage({
  params,
}: {
  params: { code: string }
}) {
  const rawCode = decodeURIComponent(params.code || '')
  const verified = verifyWorkspaceInviteCode(rawCode)

  if (!verified.ok) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: '#fff',
            borderRadius: 16,
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b91c1c' }}>
            Invitation link unavailable
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: '0.45rem 0 0.75rem' }}>
            We couldn&rsquo;t open this invite
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.55, margin: '0 0 1.4rem' }}>
            {verified.reason}
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href="/invite"
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: 8,
                background: '#185D7A',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              Try another code
            </a>
            <a
              href="/login"
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: 8,
                border: '1.5px solid #cbd5e1',
                color: '#334155',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
              }}
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    )
  }

  const { payload } = verified
  const service = createStudioServiceClient()
  const [{ data: mfr }, { count: systemCount }] = await Promise.all([
    service
      .from('data_studio_manufacturers')
      .select('id, name, slug, logo_url')
      .eq('id', payload.mid)
      .maybeSingle(),
    service
      .from('staged_systems')
      .select('*', { count: 'exact', head: true })
      .eq('manufacturer_id', payload.mid)
      .neq('verification_status', 'archived'),
  ])

  if (!mfr) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f3a4d 0%, #185D7A 60%, #1a7a9e 100%)',
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: 420, background: '#fff', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.6rem' }}>Workspace not found</h1>
          <p style={{ fontSize: '0.88rem', color: '#475569' }}>
            This manufacturer workspace could not be found. Contact BuildQuote for a new invite link.
          </p>
        </div>
      </div>
    )
  }

  let signedInEmail: string | null = null
  try {
    const serverSb = createStudioServerClient()
    const {
      data: { user },
    } = await serverSb.auth.getUser()
    signedInEmail = user?.email ?? null
  } catch {
    signedInEmail = null
  }

  const expiresLabel = new Date(payload.exp * 1000).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

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
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          overflow: 'hidden',
        }}
      >
        {/* Brand header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #102b3a 0%, #185D7A 100%)',
            padding: '1.75rem 2rem 1.5rem',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#bae6fd' }}>
            BuildQuote Data Studio · Workspace Invitation
          </div>

          {mfr.logo_url && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.96)',
                borderRadius: 10,
                padding: '6px 14px',
                marginTop: '0.85rem',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mfr.logo_url}
                alt={mfr.name}
                style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain', display: 'block' }}
              />
            </div>
          )}

          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0.75rem 0 0.3rem', letterSpacing: '-0.01em' }}>
            {mfr.name}
          </h1>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(255,255,255,0.82)' }}>
            You&rsquo;ve been invited to review and edit your product workspace
            {typeof systemCount === 'number' && systemCount > 0
              ? ` (${systemCount} system${systemCount === 1 ? '' : 's'} ready)`
              : ''}.
          </p>
        </div>

        {/* Form body */}
        <div style={{ padding: '1.6rem 2rem 1.8rem' }}>
          <InviteAcceptClient
            code={rawCode}
            manufacturerName={mfr.name}
            restrictedEmail={payload.email ?? null}
            signedInEmail={signedInEmail}
            expiresLabel={expiresLabel}
          />
        </div>
      </div>

      <p style={{ marginTop: '1.25rem', fontSize: '0.76rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        BuildQuote Data Studio · Manufacturer Product Verification Portal
      </p>
    </div>
  )
}
