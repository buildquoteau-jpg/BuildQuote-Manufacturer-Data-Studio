import { NextRequest, NextResponse } from 'next/server'
import { createProductionServiceClient } from '@/lib/supabase/production'
import { getRfqServerClient } from '@/lib/supabase/rfq-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, system_id, system_name, product_code, name, email, phone, message, type } = body

    if (!token || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const prod = createProductionServiceClient()

    // Validate token and fetch manufacturer name in one query
    const { data: widget } = await prod
      .from('embed_widgets')
      .select('id, manufacturers(name)')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    const manufacturerName = (widget as any).manufacturers?.name ?? null

    const rfq = getRfqServerClient()
    const { error } = await rfq.from('rfq_enquiries').insert({
      widget_id:     null,
      system_id:     system_id ?? null,
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
