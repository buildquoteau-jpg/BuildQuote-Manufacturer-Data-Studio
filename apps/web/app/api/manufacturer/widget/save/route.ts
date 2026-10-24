import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { createProductionServiceClient } from '@/lib/supabase/production'

export async function POST(req: NextRequest) {
  try {
    const session = await getStudioSession()
    const ctx     = await resolveWorkspaceContextFromRequest(session)
    if (!ctx.found) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { manufacturer_id, widget_id, system_ids, button_config } = await req.json()

    if (manufacturer_id !== ctx.manufacturerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!Array.isArray(system_ids)) {
      return NextResponse.json({ error: 'system_ids must be an array' }, { status: 400 })
    }

    const sb   = createStudioServiceClient()
    const prod = createProductionServiceClient()

    // Validate systems against staged_systems and collect production IDs in order
    let productionSystemIds: string[] = []
    if (system_ids.length > 0) {
      const { data: systems, error: systemsErr } = await sb
        .from('staged_systems')
        .select('id, verification_status, production_system_id')
        .eq('manufacturer_id', manufacturer_id)
        .in('id', system_ids)

      // Without this list every system looks unapproved below, which would
      // report a validation failure for what is really a database error.
      if (systemsErr) {
        console.error('Widget save: could not load staged systems:', systemsErr)
        return NextResponse.json({ error: 'Could not verify the selected systems' }, { status: 500 })
      }

      const rows = (systems ?? []) as { id: string; verification_status: string | null; production_system_id: string | null }[]

      const invalid = system_ids.filter(id => {
        const s = rows.find(r => r.id === id)
        return !s || (s.verification_status !== 'approved' && !s.production_system_id)
      })
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'Some systems are not approved' }, { status: 400 })
      }

      // Map staged IDs → production IDs, preserving the requested sort order
      productionSystemIds = system_ids
        .map(id => rows.find(r => r.id === id)?.production_system_id)
        .filter((id): id is string => id != null)
    }

    let resolvedWidgetId = widget_id as string | null

    if (!resolvedWidgetId) {
      // Bridge data-studio manufacturer → production manufacturer via slug
      const { data: mfrRow, error: mfrErr } = await sb
        .from('data_studio_manufacturers')
        .select('slug')
        .eq('id', manufacturer_id)
        .maybeSingle()

      if (mfrErr) {
        console.error('Widget save: could not load manufacturer:', mfrErr)
        return NextResponse.json({ error: 'Could not load the manufacturer' }, { status: 500 })
      }
      if (!mfrRow?.slug) {
        return NextResponse.json({ error: 'Manufacturer not found' }, { status: 404 })
      }

      const { data: prodMfr, error: prodMfrErr } = await prod
        .from('manufacturers')
        .select('id')
        .eq('slug', (mfrRow as any).slug)
        .maybeSingle()

      if (prodMfrErr) {
        console.error('Widget save: could not load production manufacturer:', prodMfrErr)
        return NextResponse.json({ error: 'Could not load the manufacturer' }, { status: 500 })
      }
      if (!prodMfr) {
        return NextResponse.json({ error: 'Manufacturer not yet published to production' }, { status: 400 })
      }

      const { data: newWidget, error: createErr } = await prod
        .from('embed_widgets')
        .insert({ manufacturer_id: (prodMfr as any).id, status: 'active', widget_button_config: button_config ?? null })
        .select('id')
        .single()

      if (createErr || !newWidget) {
        console.error('Widget create error:', createErr)
        return NextResponse.json({ error: 'Failed to create widget' }, { status: 500 })
      }
      resolvedWidgetId = (newWidget as any).id
    } else if (button_config && typeof button_config === 'object') {
      const { error: configErr } = await prod
        .from('embed_widgets')
        .update({ widget_button_config: button_config })
        .eq('id', resolvedWidgetId)

      if (configErr) {
        console.error('Widget button config update error:', configErr)
        return NextResponse.json({ error: 'Failed to save the widget button settings' }, { status: 500 })
      }
    }

    // Replace widget systems: delete existing, insert new with production
    // system IDs. A failed delete followed by the insert below would leave the
    // widget with both the old and the new set.
    const { error: clearErr } = await prod
      .from('embed_widget_systems')
      .delete()
      .eq('embed_widget_id', resolvedWidgetId)

    if (clearErr) {
      console.error('Widget systems clear error:', clearErr)
      return NextResponse.json({ error: 'Failed to save systems' }, { status: 500 })
    }

    if (productionSystemIds.length > 0) {
      const { error: insertErr } = await prod
        .from('embed_widget_systems')
        .insert(
          productionSystemIds.map((id, i) => ({
            embed_widget_id: resolvedWidgetId,
            system_id:       id,
            sort_order:      i,
          }))
        )

      if (insertErr) {
        console.error('Widget systems insert error:', insertErr)
        return NextResponse.json({ error: 'Failed to save systems' }, { status: 500 })
      }
    }

    revalidateTag('widget-data')
    return NextResponse.json({ ok: true, widget_id: resolvedWidgetId })
  } catch (err) {
    console.error('Widget save error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
