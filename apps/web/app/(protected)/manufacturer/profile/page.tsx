import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { BrandProfileForm } from './BrandProfileForm'

export const dynamic = 'force-dynamic'

type ManufacturerProfile = {
  id: string; name: string; slug: string; status: string
  description: string | null; website_url: string | null
  hero_image_url: string | null; hero_image_position_y: number | null
  hero_wide_image_url: string | null; hero_wide_image_position_y: number | null
  logo_url: string | null
  phone: string | null; abn: string | null
}

const FULL_COLUMNS =
  'id, name, slug, status, description, website_url, hero_image_url, hero_image_position_y, hero_wide_image_url, hero_wide_image_position_y, logo_url, phone, abn'
const BASE_COLUMNS =
  'id, name, slug, status, description, website_url, hero_image_url, logo_url, phone, abn'

async function getFullManufacturerProfile(manufacturerId: string): Promise<ManufacturerProfile | null> {
  try {
    const supabase = createStudioServerClient()
    const { data, error } = await supabase
      .from('data_studio_manufacturers')
      .select(FULL_COLUMNS)
      .eq('id', manufacturerId)
      .single()

    if (!error) return data as ManufacturerProfile

    // Migrations 031/034 may not be applied yet — fall back to a query without
    // the hero-position / wide-image columns and default them to null.
    if (error.code === '42703' || /hero_(image|wide_image)/.test(error.message ?? '')) {
      const { data: fallback, error: fbErr } = await supabase
        .from('data_studio_manufacturers')
        .select(BASE_COLUMNS)
        .eq('id', manufacturerId)
        .single()
      if (fbErr || !fallback) return null
      return {
        ...(fallback as Omit<ManufacturerProfile, 'hero_image_position_y' | 'hero_wide_image_url' | 'hero_wide_image_position_y'>),
        hero_image_position_y: null,
        hero_wide_image_url: null,
        hero_wide_image_position_y: null,
      }
    }

    return null
  } catch {
    return null
  }
}

export default async function ManufacturerProfilePage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Brand profile">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Brand profile</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const profile = await getFullManufacturerProfile(ctx.manufacturerId)

  if (!profile) {
    return (
      <StudioShell role="manufacturer" subtitle="Brand profile">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Brand profile</h1>
        <div className="studio-warn">Could not load brand profile.</div>
      </StudioShell>
    )
  }

  return (
    <StudioShell role="manufacturer" subtitle={`${profile.name} · Brand profile`}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>Brand profile</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: 0 }}>
          This information appears on your public BuildQuote manufacturer page. Keep it accurate and up to date.
        </p>
      </div>

      <BrandProfileForm
        manufacturerId={profile.id}
        initialValues={{
          description:    profile.description,
          website_url:    profile.website_url,
          hero_image_url: profile.hero_image_url,
          hero_image_position_y: profile.hero_image_position_y ?? 50,
          hero_wide_image_url: profile.hero_wide_image_url,
          hero_wide_image_position_y: profile.hero_wide_image_position_y ?? 50,
          logo_url:       profile.logo_url,
          phone:          profile.phone,
          abn:            profile.abn,
        }}
        manufacturerName={profile.name}
        slug={profile.slug}
      />
    </StudioShell>
  )
}
