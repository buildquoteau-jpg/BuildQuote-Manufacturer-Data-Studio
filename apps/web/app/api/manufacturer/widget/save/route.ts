import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const session = await getStudioSession()
    const ctx     = await resolveWorkspaceContextFromRequest(session)
    if (!ctx.found) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const { manufacturer_id, widget_id, system_ids } = await req.json()

    // Guard: ensure the manufacturer_id matches the session
    if (manufacturer_id !== ctx.manufacturerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!Array.isArray(system_ids)) {
      return NextResponse.json({ error: 'system_ids must be an array' }, { status: 400 })
    }

    // Use service role so admin-impersonation works (auth.uid() is admin, not manufacturer user)
    const sb = createStudioServiceClient()

    // Validate: all provided system_ids must belong to this manufacturer and be approved/live
    if (system_ids.length > 0) {
      const { data: systems } = await sb
        .from('staged_systems')
        .select('id, verification_status, production_system_id')
        .eq('manufacturer_id', manufacturer_id)
        .in('id', system_ids)

      const valid = new Set(
        ((systems ?? []) as any[])
          .filter((s: any) => s.verification_status === 'approved' || s.production_system_id)
          .map((s: any) => s.id)
      )

      const invalid = system_ids.filter(id => !valid.has(id))
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'Some systems are not approved' }, { status: 400 })
      }
    }

    let resolvedWidgetId = widget_id as string | null

    // Create widget if it doesn't exist yet
    if (!resolvedWidgetId) {
      const { data: newWidget, error: createErr } = await sb
        .from('manufacturer_embed_widgets')
        .insert({ manufacturer_id, status: 'active' })
        .select('id')
        .single()

      if (createErr || !newWidget) {
        console.error('Widget create error:', createErr)
        return NextResponse.json({ error: 'Failed to create widget' }, { status: 500 })
      }
      resolvedWidgetId = (newWidget as any).id
    }

    // Replace widget systems: delete existing, insert new
    await sb
      .from('manufacturer_embed_widget_systems')
      .delete()
      .eq('embed_widget_id', resolvedWidgetId)

    if (system_ids.length > 0) {
      const rows = system_ids.map((id: string, i: number) => ({
        embed_widget_id:  resolvedWidgetId,
        staged_system_id: id,
        sort_order:       i,
      }))

      const { error: insertErr } = await sb
        .from('manufacturer_embed_widget_systems')
        .insert(rows)

      if (insertErr) {
        console.error('Widget systems insert error:', insertErr)
        return NextResponse.json({ error: 'Failed to save systems' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, widget_id: resolvedWidgetId })
  } catch (err) {
    console.error('Widget save error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
