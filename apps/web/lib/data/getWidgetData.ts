import { createClient } from '@supabase/supabase-js'

function getDataStudioClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

export type WidgetManufacturer = {
  name: string
  slug: string
  logo_url: string | null
  hero_image_url: string | null
  website_url: string | null
  description: string | null
}

export type WidgetColour = {
  colour_name: string
  image_url: string | null
  sort_order: number
  is_stocked: boolean
}

export type WidgetComponent = {
  id: string
  role: string
  notes: string | null
  sort_order: number
  components: {
    name: string
    sku: string | null
    description: string | null
    category: string | null
    uom: string | null
    procurement_route: 'specialist_supplier' | 'trade_merchant' | null
  } | null
}

export type WidgetProfile = {
  id: string
  profile_name: string | null
  name: string | null
  product_code: string | null
  dimensions: string | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number
}

export type WidgetSystem = {
  id: string
  name: string
  product_code: string | null
  category: string
  subcategory: string | null
  description: string | null
  dimensions: string | null
  hero_image_url: string | null
  hero_image_position_x: number | null
  hero_image_position_y: number | null
  website_url: string | null
  install_guide_urls: { label: string; url: string }[] | null
  design_guide_url: string | null
  notes: string | null
  fire_rating: string | null
  acoustic_rating: string | null
  moisture_resistant: boolean
  structural_grade: string | null
  bal_rating: string | null
  australian_made: boolean | null
  double_sided: boolean
  system_colours: WidgetColour[]
  system_components: WidgetComponent[]
  system_profiles: WidgetProfile[]
}

export type WidgetData = {
  id: string
  manufacturer: WidgetManufacturer | null
  systems: WidgetSystem[]
}

export async function getWidgetData(token: string): Promise<WidgetData | null> {
  const supabase = getDataStudioClient()

  // Resolve widget
  const { data: widget, error: widgetError } = await supabase
    .from('manufacturer_embed_widgets')
    .select('id, manufacturer_id')
    .eq('public_token', token)
    .eq('status', 'active')
    .single()

  if (widgetError || !widget) return null

  const w = widget as { id: string; manufacturer_id: string }

  // Fetch manufacturer + widget systems in parallel
  const [mfrResult, widgetSystemsResult] = await Promise.all([
    supabase
      .from('data_studio_manufacturers')
      .select('name, slug, logo_url, hero_image_url, website_url, description')
      .eq('id', w.manufacturer_id)
      .single(),
    supabase
      .from('manufacturer_embed_widget_systems')
      .select('staged_system_id, sort_order')
      .eq('embed_widget_id', w.id)
      .order('sort_order'),
  ])

  const manufacturer = mfrResult.data
    ? (mfrResult.data as WidgetManufacturer)
    : null

  const widgetSystems = (widgetSystemsResult.data ?? []) as { staged_system_id: string; sort_order: number }[]
  const systemIds = widgetSystems.map(ws => ws.staged_system_id)

  if (systemIds.length === 0) {
    return { id: w.id, manufacturer, systems: [] }
  }

  // Fetch full system data
  const { data: systemRows } = await supabase
    .from('staged_systems')
    .select(
      'id, name, product_code, category, subcategory, description, dimensions, ' +
      'hero_image_url, hero_image_position_x, hero_image_position_y, ' +
      'website_url, install_guide_urls, design_guide_url, notes, ' +
      'fire_rating, acoustic_rating, moisture_resistant, structural_grade, ' +
      'bal_rating, australian_made, double_sided'
    )
    .in('id', systemIds)

  // Fetch profiles, colours, components for all systems
  const [profilesRes, coloursRes, sysCompRes] = await Promise.all([
    supabase
      .from('staged_system_profiles')
      .select('id, staged_system_id, profile_name, product_code, dimensions, length_mm, width_mm, height_mm, thickness_mm, uom, supplier_pack_qty, supplier_pack_uom, sort_order')
      .in('staged_system_id', systemIds)
      .order('sort_order'),
    supabase
      .from('staged_system_colours')
      .select('staged_system_id, colour_name, image_url, sort_order, is_stocked')
      .in('staged_system_id', systemIds)
      .order('sort_order'),
    supabase
      .from('staged_system_components')
      .select('id, staged_system_id, role, notes, sort_order, staged_components(name, sku, description, category, uom, procurement_route)')
      .in('staged_system_id', systemIds)
      .order('sort_order'),
  ])

  type ProfileRow = { id: string; staged_system_id: string; profile_name: string | null; product_code: string | null; dimensions: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; thickness_mm: number | null; uom: string | null; supplier_pack_qty: number | null; supplier_pack_uom: string | null; sort_order: number }
  type ColourRow  = { staged_system_id: string; colour_name: string; image_url: string | null; sort_order: number; is_stocked: boolean }
  type SysCompRow = { id: string; staged_system_id: string; role: string; notes: string | null; sort_order: number; staged_components: any }

  const profilesMap  = new Map<string, WidgetProfile[]>()
  const coloursMap   = new Map<string, WidgetColour[]>()
  const componentsMap = new Map<string, WidgetComponent[]>()

  for (const r of (profilesRes.data ?? []) as ProfileRow[]) {
    const { staged_system_id, ...rest } = r
    const list = profilesMap.get(staged_system_id) ?? []
    list.push({ ...rest, name: rest.profile_name })
    profilesMap.set(staged_system_id, list)
  }

  for (const r of (coloursRes.data ?? []) as ColourRow[]) {
    const { staged_system_id, ...rest } = r
    const list = coloursMap.get(staged_system_id) ?? []
    list.push(rest)
    coloursMap.set(staged_system_id, list)
  }

  for (const r of (sysCompRes.data ?? []) as SysCompRow[]) {
    const comp = Array.isArray(r.staged_components) ? r.staged_components[0] : r.staged_components
    const list = componentsMap.get(r.staged_system_id) ?? []
    list.push({ id: r.id, role: r.role, notes: r.notes, sort_order: r.sort_order, components: comp ?? null })
    componentsMap.set(r.staged_system_id, list)
  }

  // Preserve widget sort_order
  const sortMap = new Map(widgetSystems.map(ws => [ws.staged_system_id, ws.sort_order]))

  const systems: WidgetSystem[] = ((systemRows ?? []) as any[])
    .sort((a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0))
    .map(s => ({
      ...s,
      system_profiles:   profilesMap.get(s.id)   ?? [],
      system_colours:    coloursMap.get(s.id)     ?? [],
      system_components: componentsMap.get(s.id)  ?? [],
    }))

  return { id: w.id, manufacturer, systems }
}
