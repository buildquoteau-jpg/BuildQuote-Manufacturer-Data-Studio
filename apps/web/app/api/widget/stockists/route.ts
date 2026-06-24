import { NextRequest, NextResponse } from 'next/server'
import { createProductionServiceClient } from '@/lib/supabase/production'
import { getRfqServerClient } from '@/lib/supabase/rfq-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const token    = searchParams.get('token')
    const systemId = searchParams.get('system_id')
    const postcode = searchParams.get('postcode')?.trim() ?? ''
    const state    = searchParams.get('state')?.trim() ?? ''

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const prod = createProductionServiceClient()

    // Validate the widget token against production
    const { data: widget } = await prod
      .from('embed_widgets')
      .select('id')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    if (!systemId) {
      return NextResponse.json({ stockists: [], direct: true })
    }

    // Look up suppliers stocking this system
    const rfq = getRfqServerClient()
    const { data: supplierSystems } = await rfq
      .from('supplier_systems')
      .select('supplier_id')
      .eq('system_id', systemId)

    const supplierIds = ((supplierSystems ?? []) as any[]).map((r: any) => r.supplier_id)

    if (supplierIds.length === 0) {
      return NextResponse.json({ stockists: [], direct: true })
    }

    const { data: suppliers } = await rfq
      .from('suppliers')
      .select('id, name, suburb, state, address, phone, email, website_url, google_maps_url, service_postcodes, region, opening_hours')
      .in('id', supplierIds)
      .order('state')
      .order('suburb')

    let stockists = (suppliers ?? []) as any[]

    if (postcode && postcode.length >= 4) {
      const filtered = stockists.filter((s: any) => {
        if (!s.service_postcodes) return true
        const pcs = s.service_postcodes.split(/[,\s]+/).map((p: string) => p.trim()).filter(Boolean)
        return pcs.includes(postcode)
      })
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
