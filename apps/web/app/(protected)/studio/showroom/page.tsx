import { notFound } from 'next/navigation'
import { createStudioServerClient } from '@/lib/supabase/server'
import { ShowroomClient } from './ShowroomClient'

export const dynamic = 'force-dynamic'

export type ShowroomManufacturer = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  hero_image_position_y: number | null
  system_count: number
}

async function getShowroomManufacturers(): Promise<ShowroomManufacturer[]> {
  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return []
  }

  let { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, description, logo_url, hero_image_url, hero_image_position_y, staged_systems ( id )')
    .order('name')

  if (error) {
    // Migration 031 may not be applied yet — fall back without the new column.
    if (error.code === '42703' || error.message?.includes('hero_image_position_y')) {
      const { data: fb, error: fbErr } = await supabase
        .from('data_studio_manufacturers')
        .select('id, name, slug, description, logo_url, hero_image_url, staged_systems ( id )')
        .order('name')
      if (fbErr || !fb) return []
      data = (fb as any[]).map((m) => ({ ...m, hero_image_position_y: null }))
    } else {
      return []
    }
  }

  if (!data) return []

  return (data as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    description: m.description ?? null,
    logo_url: m.logo_url ?? null,
    hero_image_url: m.hero_image_url ?? null,
    hero_image_position_y: m.hero_image_position_y ?? null,
    system_count: (m.staged_systems ?? []).length,
  }))
}

export default function ShowroomPage() {
  notFound()
}
