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
    <StudioShell role="manufacturer" workspaceName={manufacturerName} subtitle="Embeds & Links">
      <div style={{ maxWidth: '760px' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.25rem' }}>
          Embeds &amp; Links
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
          Ways to get your System Cards in front of customers. The preferred home for your cards is
          your own website — BuildQuote-hosted embeds are the compatibility path.
        </p>

        {/* Option 1 — Website Package (preferred) */}
        <div style={{
          background: '#fff', border: '1.5px solid #185D7A', borderRadius: '14px',
          padding: '18px 20px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Website Package</span>
            <span style={{
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: '#185D7A', color: '#fff', padding: '2px 8px', borderRadius: 999,
            }}>
              Recommended
            </span>
          </div>
          <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.55 }}>
            A self-contained static website installed on your own site at <code>/system-cards/</code>.
            You own the URLs, pages load from your domain, and every card works without BuildQuote —
            selectable line items, shopping list and PNG sharing included. The ZIP also contains
            ready-made link buttons and iframe snippets (<code>embed-snippets.html</code>), a card
            URL list (<code>card-link-list.csv</code>) and a print-ready QR code per card.
          </p>
          <a href="/manufacturer/packages" className="studio-btn studio-btn-primary" style={{ fontSize: '0.83rem' }}>
            Go to Packages
          </a>
        </div>

        {/* Option 2 — static snippets note */}
        <div style={{
          background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px',
          padding: '16px 20px', marginBottom: '28px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
            Static embed &amp; link snippets
          </div>
          <p style={{ fontSize: '0.83rem', color: '#64748b', margin: 0, lineHeight: 1.55 }}>
            Once your package is installed on your website, use the snippets from the ZIP to link or
            iframe individual cards anywhere — quotes, emails, landing pages, other sites. No
            BuildQuote hosting involved. On Wix and similar builders that can&apos;t host uploaded
            folders, use the BuildQuote-hosted widget below instead.
          </p>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', marginBottom: '28px' }} />
      </div>

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
