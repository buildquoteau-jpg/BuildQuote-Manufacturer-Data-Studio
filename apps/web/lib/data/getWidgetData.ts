import { createStudioServiceClient } from '@/lib/supabase/service'
import { createProductionServiceClient } from '@/lib/supabase/production'

export type WidgetButtonConfig = {
  show_request_quote: boolean
  show_find_stockist: boolean
  show_general_enquiry: boolean
  show_hero: boolean
}

export const DEFAULT_BUTTON_CONFIG: WidgetButtonConfig = {
  show_request_quote: true,
  show_find_stockist: true,
  show_general_enquiry: true,
  show_hero: true,
}

export type WidgetManufacturer = {
  name: string
  slug: string
  logo_url: string | null
  hero_image_url: string | null
  hero_wide_image_url: string | null
  hero_wide_image_position_y: number | null
  website_url: string | null
  description: string | null
  widget_button_config: WidgetButtonConfig | null
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
  // Config lookups stay on data-studio (service role, server-side only).
  // System content is read from production — only published systems have a
  // production_system_id, so unpublished data is silently excluded.
  const studio = createStudioServiceClient()
  const prod   = createProductionServiceClient()

  // Resolve widget token (data-studio)
  const { data: widget, error: widgetError } = await studio
    .from('manufacturer_embed_widgets')
    .select('id, manufacturer_id')
    .eq('public_token', token)
    .eq('status', 'active')
    .single()

  if (widgetError || !widget) return null

  const w = widget as { id: string; manufacturer_id: string }

  // Manufacturer profile + widget system config in parallel (data-studio)
  const [mfrResult, widgetSystemsResult] = await Promise.all([
    studio
      .from('data_studio_manufacturers')
      .select('name, slug, logo_url, hero_image_url, hero_wide_image_url, hero_wide_image_position_y, website_url, description, widget_button_config')
      .eq('id', w.manufacturer_id)
      .single(),
    studio
      .from('manufacturer_embed_widget_systems')
      .select('staged_system_id, sort_order')
      .eq('embed_widget_id', w.id)
      .order('sort_order'),
  ])

  const manufacturer = mfrResult.data ? (mfrResult.data as WidgetManufacturer) : null
  const widgetSystems = (widgetSystemsResult.data ?? []) as { staged_system_id: string; sort_order: number }[]
  const stagedIds = widgetSystems.map(ws => ws.staged_system_id)

  if (stagedIds.length === 0) return { id: w.id, manufacturer, systems: [] }

  // Resolve staged → production IDs (data-studio).
  // Systems without a production_system_id have not been published — exclude them.
  const { data: idRows } = await studio
    .from('staged_systems')
    .select('id, production_system_id')
    .in('id', stagedIds)
    .not('production_system_id', 'is', null)

  const stagedToProduction = new Map(
    ((idRows ?? []) as { id: string; production_system_id: string }[])
      .map(r => [r.id, r.production_system_id])
  )
  const productionIds = Array.from(stagedToProduction.values())

  if (productionIds.length === 0) return { id: w.id, manufacturer, systems: [] }

  // All system content from production — verified, published data only.
  // Production uses unprefixed table names: systems, system_profiles, system_colours,
  // system_components, components (the staged_* tables are data-studio-only).
  const { data: systemRows } = await prod
    .from('systems')
    .select(
      'id, name, product_code, category, subcategory, description, dimensions, ' +
      'hero_image_url, hero_image_position_x, hero_image_position_y, ' +
      'website_url, install_guide_urls, design_guide_url, notes, ' +
      'fire_rating, acoustic_rating, moisture_resistant, structural_grade, ' +
      'bal_rating, australian_made, double_sided'
    )
    .in('id', productionIds)

  const [profilesRes, coloursRes, sysCompRes] = await Promise.all([
    prod
      .from('system_profiles')
      .select('id, system_id, profile_name, product_code, dimensions, length_mm, width_mm, height_mm, thickness_mm, uom, supplier_pack_qty, supplier_pack_uom, sort_order')
      .in('system_id', productionIds)
      .order('sort_order'),
    prod
      .from('system_colours')
      .select('system_id, colour_name, image_url, sort_order, is_stocked')
      .in('system_id', productionIds)
      .order('sort_order'),
    prod
      .from('system_components')
      .select('id, system_id, role, notes, sort_order, components(name, sku, description, category, uom, procurement_route)')
      .in('system_id', productionIds)
      .order('sort_order'),
  ])

  type ProfileRow = { id: string; system_id: string; profile_name: string | null; product_code: string | null; dimensions: string | null; length_mm: number | null; width_mm: number | null; height_mm: number | null; thickness_mm: number | null; uom: string | null; supplier_pack_qty: number | null; supplier_pack_uom: string | null; sort_order: number }
  type ColourRow  = { system_id: string; colour_name: string; image_url: string | null; sort_order: number; is_stocked: boolean }
  type SysCompRow = { id: string; system_id: string; role: string; notes: string | null; sort_order: number; components: any }

  const profilesMap   = new Map<string, WidgetProfile[]>()
  const coloursMap    = new Map<string, WidgetColour[]>()
  const componentsMap = new Map<string, WidgetComponent[]>()

  for (const r of (profilesRes.data ?? []) as ProfileRow[]) {
    const { system_id, ...rest } = r
    const list = profilesMap.get(system_id) ?? []
    list.push({ ...rest, name: rest.profile_name })
    profilesMap.set(system_id, list)
  }

  for (const r of (coloursRes.data ?? []) as ColourRow[]) {
    const { system_id, ...rest } = r
    const list = coloursMap.get(system_id) ?? []
    list.push(rest)
    coloursMap.set(system_id, list)
  }

  for (const r of (sysCompRes.data ?? []) as SysCompRow[]) {
    const comp = Array.isArray(r.components) ? r.components[0] : r.components
    const list = componentsMap.get(r.system_id) ?? []
    list.push({ id: r.id, role: r.role, notes: r.notes, sort_order: r.sort_order, components: comp ?? null })
    componentsMap.set(r.system_id, list)
  }

  // Preserve widget sort_order via staged → production ID chain
  const sortMap = new Map(
    widgetSystems
      .filter(ws => stagedToProduction.has(ws.staged_system_id))
      .map(ws => [stagedToProduction.get(ws.staged_system_id)!, ws.sort_order])
  )

  const systems: WidgetSystem[] = ((systemRows ?? []) as any[])
    .sort((a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0))
    .map(s => ({
      ...s,
      system_profiles:   profilesMap.get(s.id) ?? [],
      system_colours:    coloursMap.get(s.id)  ?? [],
      system_components: componentsMap.get(s.id) ?? [],
    }))

  return { id: w.id, manufacturer, systems }
}
