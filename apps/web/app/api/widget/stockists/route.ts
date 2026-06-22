import { NextRequest, NextResponse } from 'next/server'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getRfqServerClient } from '@/lib/supabase/rfq-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const token            = searchParams.get('token')
    const systemId = searchParams.get('system_id')
    const postcode = searchParams.get('postcode')?.trim() ?? ''
    const state    = searchParams.get('state')?.trim() ?? ''

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const studio = createStudioServerClient()

    // Validate the widget token
    const { data: widget } = await studio
      .from('manufacturer_embed_widgets')
      .select('id')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    // system_id is already a production ID (getWidgetData now returns production IDs)
    const productionSystemId: string | null = systemId ?? null

    if (!productionSystemId) {
      return NextResponse.json({ stockists: [], direct: true })
    }

    // Look up suppliers stocking this system in RFQ Supabase
    const rfq = getRfqServerClient()
    const { data: supplierSystems } = await rfq
      .from('supplier_systems')
      .select('supplier_id')
      .eq('system_id', productionSystemId)

    const supplierIds = ((supplierSystems ?? []) as any[]).map((r: any) => r.supplier_id)

    if (supplierIds.length === 0) {
      // No stockists — manufacturer sells direct
      return NextResponse.json({ stockists: [], direct: true })
    }

    const { data: suppliers } = await rfq
      .from('suppliers')
      .select('id, name, suburb, state, address, phone, email, website_url, google_maps_url, service_postcodes, region, opening_hours')
      .in('id', supplierIds)
      .order('state')
      .order('suburb')

    let stockists = (suppliers ?? []) as any[]

    // Filter by postcode or state if provided
    if (postcode && postcode.length >= 4) {
      const filtered = stockists.filter((s: any) => {
        if (!s.service_postcodes) return true
        const pcs = s.service_postcodes.split(/[,\s]+/).map((p: string) => p.trim()).filter(Boolean)
        return pcs.includes(postcode)
      })
      // Fall back to all if none match (postcode data may be incomplete)
      if (filtered.length > 0) stockists = filtered
    } else if (state) {
      const stateUpper = state.toUpperCase()
      const filtered = stockists.filter((s: any) => s.state?.toUpperCase() === stateUpper)
      if (filtered.length > 0) stockists = filtered
    }

    return NextResponse.json({ stockists, direct: false })
  } catch (err) {
    console.error('Widget stockists error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
