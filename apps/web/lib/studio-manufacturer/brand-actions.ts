'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

// ─── Auth gate ────────────────────────────────────────────────────────────────

async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  if (session.globalRole === 'buildquote_admin') return { allowed: true, userId: session.user!.id }
  if (session.globalRole !== 'manufacturer_user') return { allowed: false, error: 'Access denied.' }
  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) return { allowed: false, error: 'Not a member of this workspace.' }
  return { allowed: true, userId: session.user!.id }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrandProfileFields = {
  description: string | null
  website_url: string | null
  hero_image_url: string | null
  hero_image_position_y: number
  hero_wide_image_url: string | null
  hero_wide_image_position_y: number
  logo_url: string | null
  phone: string | null
  abn: string | null
}

export type BrandActionResult = { ok: true } | { ok: false; error: string }

// Clamp the hero vertical-position percentage to the DB-enforced 0–100 range.
function clampPositionY(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(100, Math.max(0, Math.round(value)))
}

// ─── saveBrandProfile ─────────────────────────────────────────────────────────
// Updates the data_studio_manufacturers record with brand profile fields.
// Manufacturer users may only update their own workspace.

export async function saveBrandProfile(
  manufacturerId: string,
  fields: BrandProfileFields,
): Promise<BrandActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const payload = {
    description:    fields.description?.trim()    || null,
    website_url:    fields.website_url?.trim()    || null,
    hero_image_url: fields.hero_image_url?.trim() || null,
    hero_image_position_y: clampPositionY(fields.hero_image_position_y),
    hero_wide_image_url: fields.hero_wide_image_url?.trim() || null,
    hero_wide_image_position_y: clampPositionY(fields.hero_wide_image_position_y),
    logo_url:       fields.logo_url?.trim()       || null,
    phone:          fields.phone?.trim()           || null,
    abn:            fields.abn?.trim()             || null,
    updated_at:     new Date().toISOString(),
  }

  const { error } = await supabase
    .from('data_studio_manufacturers')
    .update(payload)
    .eq('id', manufacturerId)

  if (!error) return { ok: true }

  // Migrations 031/034 may not be applied yet — retry without whichever
  // hero-position / wide-image columns the live schema is missing.
  if (error.code === '42703' || /hero_(image|wide_image)/.test(error.message ?? '')) {
    const {
      hero_image_position_y: _p1,
      hero_wide_image_url: _w1,
      hero_wide_image_position_y: _w2,
      ...payloadWithout
    } = payload
    const { error: retryErr } = await supabase
      .from('data_studio_manufacturers')
      .update(payloadWithout)
      .eq('id', manufacturerId)
    if (!retryErr) return { ok: true }
    return { ok: false, error: retryErr.message }
  }

  return { ok: false, error: error.message }
}
