import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getAdminImpersonatedManufacturerId, getManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
import { getPendingContact } from '@/lib/studio-admin/pending-contact-actions'
import { StudioShell } from '@/components/studio/StudioShell'
import { AccountProfileForm } from './AccountProfileForm'
import { AdminPendingContactForm } from './AdminPendingContactForm'

export const dynamic = 'force-dynamic'

async function getAccountFields(authUserId: string) {
  try {
    const supabase = createStudioServerClient()
    const { data, error } = await supabase
      .from('data_studio_user_profiles')
      .select('full_name, company_email_primary, company_email_secondary, login_email_preference')
      .eq('auth_user_id', authUserId)
      .single()
    if (error || !data) return null
    return data as {
      full_name: string | null
      company_email_primary: string | null
      company_email_secondary: string | null
      login_email_preference: 'primary' | 'secondary' | null
    }
  } catch {
    return null
  }
}

export default async function ManufacturerAccountPage() {
  const session = await getStudioSession()

  if (!session.profile || !session.user) {
    return (
      <StudioShell role="manufacturer" subtitle="User profile">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>User profile</h1>
        <div className="studio-info">No account found. Please sign in again.</div>
      </StudioShell>
    )
  }

  // Admin browsing a manufacturer workspace via the gate (impersonation):
  // this page must NOT edit the admin's own data_studio_user_profiles row —
  // that row is shared across every workspace the admin views, which is
  // exactly what caused the cross-manufacturer data leak. Instead, show a
  // manufacturer-scoped "pending contact" pre-fill form. No sign-in email or
  // password fields — there's no real account to change yet.
  if (session.globalRole === 'buildquote_admin') {
    const manufacturerId = await getAdminImpersonatedManufacturerId()
    if (manufacturerId) {
      const [mfrResult, contactResult] = await Promise.all([
        getManufacturerInfo(manufacturerId),
        getPendingContact(manufacturerId),
      ])

      if (!mfrResult.ok || !contactResult.ok) {
        return (
          <StudioShell role="manufacturer" subtitle="User profile">
            <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>User profile</h1>
            <div className="studio-info">
              {!mfrResult.ok ? mfrResult.error : !contactResult.ok ? contactResult.error : 'Could not load.'}
            </div>
          </StudioShell>
        )
      }

      return (
        <StudioShell role="manufacturer" subtitle="User profile">
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>User profile</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: 0 }}>
              Pre-fill {mfrResult.manufacturer.name}&rsquo;s authorised verifier details ahead of their first login.
            </p>
          </div>

          <AdminPendingContactForm
            manufacturerId={manufacturerId}
            manufacturerName={mfrResult.manufacturer.name}
            initialValues={contactResult.fields}
          />
        </StudioShell>
      )
    }
  }

  // Real manufacturer_user (or admin with no active impersonation) — own profile.
  const fields = await getAccountFields(session.user.id)

  return (
    <StudioShell role="manufacturer" subtitle="User profile">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>User profile</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: 0 }}>
          Details of the person authorised to verify your system cards, plus your sign-in and password settings.
        </p>
      </div>

      <AccountProfileForm
        signInEmail={session.user.email ?? session.profile.email}
        initialValues={{
          full_name:               fields?.full_name ?? '',
          company_email_primary:   fields?.company_email_primary ?? '',
          company_email_secondary: fields?.company_email_secondary ?? '',
          login_email_preference:  fields?.login_email_preference ?? 'primary',
        }}
      />
    </StudioShell>
  )
}
