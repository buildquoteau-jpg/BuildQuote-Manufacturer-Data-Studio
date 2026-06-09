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
  system_count: number
}

async function getShowroomManufacturers(): Promise<ShowroomManufacturer[]> {
  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return []
  }

  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, description, logo_url, hero_image_url, staged_systems ( id )')
    .order('name')

  if (error || !data) return []

  return (data as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
    description: m.description ?? null,
    logo_url: m.logo_url ?? null,
    hero_image_url: m.hero_image_url ?? null,
    system_count: (m.staged_systems ?? []).length,
  }))
}

export default async function ShowroomPage() {
  const manufacturers = await getShowroomManufacturers()
  return <ShowroomClient manufacturers={manufacturers} />
}
