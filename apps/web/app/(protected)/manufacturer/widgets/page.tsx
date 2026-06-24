import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { createStudioServerClient } from '@/lib/supabase/server'
import { createProductionServiceClient } from '@/lib/supabase/production'
import { WidgetManager } from './WidgetManager'

export default async function ManufacturerWidgetsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) redirect('/manufacturer/dashboard')

  const sb   = createStudioServerClient()
  const prod = createProductionServiceClient()

  // Manufacturer info + all staged systems in parallel (both from data-studio)
  const [mfrResult, systemsResult] = await Promise.all([
    sb
      .from('data_studio_manufacturers')
      .select('name, logo_url, slug')
      .eq('id', ctx.manufacturerId)
      .single(),
    sb
      .from('staged_systems')
      .select('id, name, category, product_code, verification_status, production_system_id, hero_image_url')
      .eq('manufacturer_id', ctx.manufacturerId)
      .order('sort_order'),
  ])

  const manufacturerName = (mfrResult.data as any)?.name ?? 'Your brand'
  const logoUrl          = (mfrResult.data as any)?.logo_url ?? null
  const slug             = (mfrResult.data as any)?.slug ?? null
  const allSystems       = (systemsResult.data ?? []) as any[]

  // Look up production manufacturer by slug
  let widgetRow: any = null
  let selectedSystemIds: string[] = []
  let buttonConfig: any = null

  if (slug) {
    const { data: prodMfr } = await prod
      .from('manufacturers')
      .select('id')
      .eq('slug', slug)
      .single()

    if (prodMfr) {
      // Widget + its systems in one joined query
      const { data: widget } = await prod
        .from('embed_widgets')
        .select('id, public_token, status, created_at, widget_button_config, embed_widget_systems(system_id, sort_order)')
        .eq('manufacturer_id', (prodMfr as any).id)
        .eq('status', 'active')
        .maybeSingle()

      if (widget) {
        widgetRow   = { id: widget.id, public_token: widget.public_token, status: widget.status, created_at: widget.created_at }
        buttonConfig = (widget as any).widget_button_config ?? null

        // Map production system IDs → staged system IDs using the already-loaded staged systems
        const prodToStaged = new Map(
          allSystems
            .filter((s: any) => s.production_system_id)
            .map((s: any) => [s.production_system_id, s.id])
        )

        selectedSystemIds = ((widget as any).embed_widget_systems ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((ws: any) => prodToStaged.get(ws.system_id))
          .filter(Boolean) as string[]
      }
    }
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

  return (
    <StudioShell role="manufacturer" workspaceName={manufacturerName}>
      <WidgetManager
        manufacturerId={ctx.manufacturerId}
        manufacturerName={manufacturerName}
        logoUrl={logoUrl}
        allSystems={allSystems}
        widget={widgetRow}
        selectedSystemIds={selectedSystemIds}
        origin={origin}
        buttonConfig={buttonConfig}
      />
    </StudioShell>
  )
}
