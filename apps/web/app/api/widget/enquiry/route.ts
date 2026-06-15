import { NextRequest, NextResponse } from 'next/server'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getRfqServerClient } from '@/lib/supabase/rfq-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, staged_system_id, system_name, product_code, name, email, phone, message, type } = body

    if (!token || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const studio = createStudioServerClient()

    // Validate the widget token
    const { data: widget } = await studio
      .from('manufacturer_embed_widgets')
      .select('id, manufacturer_id')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    // Resolve production_system_id if a staged system was provided
    let productionSystemId: string | null = null
    if (staged_system_id) {
      const { data: sys } = await studio
        .from('staged_systems')
        .select('production_system_id')
        .eq('id', staged_system_id)
        .single()
      productionSystemId = (sys as any)?.production_system_id ?? null
    }

    // Fetch manufacturer name for supplier_name field
    const { data: mfr } = await studio
      .from('data_studio_manufacturers')
      .select('name')
      .eq('id', (widget as any).manufacturer_id)
      .single()
    const manufacturerName = (mfr as any)?.name ?? null

    // Write to RFQ Supabase
    const rfq = getRfqServerClient()
    const { error } = await rfq.from('rfq_enquiries').insert({
      widget_id:     null,
      system_id:     productionSystemId,
      system_name:   system_name ?? null,
      product_code:  product_code ?? null,
      supplier_name: manufacturerName,
      name,
      email,
      phone:   phone ?? null,
      message: type === 'quote'
        ? `[Quote Request]\n${message ?? ''}`
        : message ?? null,
    })

    if (error) {
      console.error('rfq_enquiries insert error:', error)
      return NextResponse.json({ error: 'Failed to submit enquiry' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Widget enquiry error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
