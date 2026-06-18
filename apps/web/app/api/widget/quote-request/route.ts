import { NextRequest, NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      token, system_id, system_name,
      selected_items,
      name, email, phone,
      postcode, project_type, timeline, message,
    } = body

    if (!token || !name || !email || !system_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const studio = createStudioServiceClient()

    const { data: widget } = await studio
      .from('manufacturer_embed_widgets')
      .select('id, manufacturer_id')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    const { error } = await studio.from('widget_quote_requests').insert({
      manufacturer_id: widget.manufacturer_id,
      widget_id:       widget.id,
      system_id,
      system_name:     system_name ?? null,
      selected_items:  Array.isArray(selected_items) ? selected_items : [],
      name,
      email,
      phone:           phone ?? null,
      postcode:        postcode ?? null,
      project_type:    project_type ?? null,
      timeline:        timeline ?? null,
      message:         message ?? null,
      status:          'new',
    })

    if (error) {
      console.error('widget_quote_requests insert error:', error)
      return NextResponse.json({ error: 'Failed to submit quote request' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Widget quote-request error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
