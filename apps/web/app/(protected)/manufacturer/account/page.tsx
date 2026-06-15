import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { AccountProfileForm } from './AccountProfileForm'

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
