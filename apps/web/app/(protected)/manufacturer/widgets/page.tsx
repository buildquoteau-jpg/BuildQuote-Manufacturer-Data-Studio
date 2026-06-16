import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { createStudioServerClient } from '@/lib/supabase/server'
import { WidgetManager } from './WidgetManager'

export default async function ManufacturerWidgetsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) redirect('/manufacturer/dashboard')

  const sb = createStudioServerClient()

  // Manufacturer info
  const { data: mfrRow } = await sb
    .from('data_studio_manufacturers')
    .select('name, logo_url')
    .eq('id', ctx.manufacturerId)
    .single()
  const manufacturerName = (mfrRow as any)?.name ?? 'Your brand'
  const logoUrl          = (mfrRow as any)?.logo_url ?? null

  // All staged systems for this manufacturer
  const { data: allSystems } = await sb
    .from('staged_systems')
    .select('id, name, category, product_code, verification_status, production_system_id, hero_image_url')
    .eq('manufacturer_id', ctx.manufacturerId)
    .order('sort_order')

  // Existing widget (one per manufacturer)
  const { data: widgetRow } = await sb
    .from('manufacturer_embed_widgets')
    .select('id, public_token, status, created_at')
    .eq('manufacturer_id', ctx.manufacturerId)
    .eq('status', 'active')
    .maybeSingle()

  // Systems currently in the widget
  let selectedSystemIds: string[] = []
  if (widgetRow) {
    const { data: wSystems } = await sb
      .from('manufacturer_embed_widget_systems')
      .select('staged_system_id')
      .eq('embed_widget_id', (widgetRow as any).id)
    selectedSystemIds = ((wSystems ?? []) as any[]).map((r: any) => r.staged_system_id)
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

  return (
    <StudioShell role="manufacturer" workspaceName={manufacturerName}>
      <WidgetManager
        manufacturerId={ctx.manufacturerId}
        manufacturerName={manufacturerName}
        logoUrl={logoUrl}
        allSystems={(allSystems ?? []) as any[]}
        widget={widgetRow as any}
        selectedSystemIds={selectedSystemIds}
        origin={origin}
      />
    </StudioShell>
  )
}
