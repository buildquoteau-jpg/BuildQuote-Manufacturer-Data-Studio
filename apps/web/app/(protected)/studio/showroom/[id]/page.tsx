import { notFound } from 'next/navigation'
import { createStudioServerClient } from '@/lib/supabase/server'
import { ShowroomManufacturerClient } from './ShowroomManufacturerClient'

export const dynamic = 'force-dynamic'

export type ShowroomSystem = {
  id: string
  name: string
  product_code: string | null
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  australian_made: boolean | null
  notes: string | null
  staged_system_profiles: {
    id: string
    name: string | null
    profile_name: string | null
    product_code: string | null
    dimensions: string | null
    length_mm: number | null
    width_mm: number | null
    height_mm: number | null
    thickness_mm: number | null
    uom: string | null
  }[]
  staged_system_colours: {
    id: string
    colour_name: string
    image_url: string | null
    is_stocked: boolean
  }[]
  staged_system_components: {
    id: string
    notes: string | null
    staged_components: {
      id: string
      name: string
      sku: string | null
      uom: string | null
      description: string | null
    } | null
  }[]
}

export type ShowroomManufacturer = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  hero_image_position_y: number | null
  website_url: string | null
}

async function getData(id: string): Promise<{ manufacturer: ShowroomManufacturer; systems: ShowroomSystem[] } | null> {
  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return null
  }

  let { data: mfr, error: mfrError } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, description, logo_url, hero_image_url, hero_image_position_y, website_url')
    .eq('id', id)
    .single()

  if (mfrError) {
    // Migration 031 may not be applied yet — fall back without the new column.
    if (mfrError.code === '42703' || mfrError.message?.includes('hero_image_position_y')) {
      const { data: fb, error: fbErr } = await supabase
        .from('data_studio_manufacturers')
        .select('id, name, slug, description, logo_url, hero_image_url, website_url')
        .eq('id', id)
        .single()
      if (fbErr || !fb) return null
      mfr = { ...(fb as any), hero_image_position_y: null }
      mfrError = null
    } else {
      return null
    }
  }
  if (!mfr) return null

  const { data: systems, error: sysError } = await supabase
    .from('staged_systems')
    .select(`
      id, name, product_code, category, subcategory, description,
      hero_image_url, australian_made, notes,
      staged_system_profiles ( id, name, profile_name, product_code, dimensions,
        length_mm, width_mm, height_mm, thickness_mm, uom ),
      staged_system_colours ( id, colour_name, image_url, is_stocked ),
      staged_system_components (
        id, notes,
        staged_components ( id, name, sku, uom, description )
      )
    `)
    .eq('manufacturer_id', id)
    .order('name')

  if (sysError) return null

  return {
    manufacturer: mfr as ShowroomManufacturer,
    systems: (systems ?? []) as unknown as ShowroomSystem[],
  }
}

export default async function ShowroomManufacturerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getData(id)
  if (!data) notFound()
  return <ShowroomManufacturerClient manufacturer={data.manufacturer} systems={data.systems} />
}
