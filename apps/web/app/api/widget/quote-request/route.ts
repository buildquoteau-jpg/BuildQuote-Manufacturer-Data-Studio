import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createStudioServiceClient } from '@/lib/supabase/service'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM_EMAIL ?? 'rfq@buildquote.com.au'

const TIMELINE_LABELS: Record<string, string> = {
  asap:       'ASAP',
  '1-3months': '1–3 months',
  planning:   'Just planning',
}
const PROJECT_LABELS: Record<string, string> = {
  residential: 'Residential',
  commercial:  'Commercial',
  other:       'Other',
}

function itemsHtml(items: any[]): string {
  if (!items.length) return '<p style="color:#6b7280">No items selected.</p>'
  return items.map(it => {
    const meta = [it.dims, it.uom, it.product_code ? `SKU: ${it.product_code}` : ''].filter(Boolean).join(' · ')
    const qty  = it.quantity && it.quantity !== 1 ? ` <span style="color:#6b7280">× ${it.quantity}</span>` : ''
    const note = it.details ? `<br><span style="color:#6b7280;font-size:13px">${it.details}</span>` : ''
    return `<div style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;font-size:14px">
      <strong>${it.label}</strong>${qty}${meta ? `<br><span style="color:#6b7280;font-size:13px">${meta}</span>` : ''}${note}
    </div>`
  }).join('')
}

async function sendManufacturerNotification(opts: {
  toEmail: string
  manufacturerName: string
  systemName: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  postcode: string | null
  projectType: string | null
  timeline: string | null
  message: string | null
  items: any[]
}) {
  const { toEmail, manufacturerName, systemName, customerName, customerEmail, customerPhone, postcode, projectType, timeline, message, items } = opts

  const metaRows = [
    postcode    && `<tr><td style="padding:4px 0;color:#6b7280;width:130px">Postcode</td><td>${postcode}</td></tr>`,
    projectType && `<tr><td style="padding:4px 0;color:#6b7280">Project type</td><td>${PROJECT_LABELS[projectType] ?? projectType}</td></tr>`,
    timeline    && `<tr><td style="padding:4px 0;color:#6b7280">Timeline</td><td>${TIMELINE_LABELS[timeline] ?? timeline}</td></tr>`,
  ].filter(Boolean).join('')

  await resend.emails.send({
    from:    `BuildQuote RFQ <${FROM}>`,
    to:      toEmail,
    subject: `New quote request — ${systemName} from ${customerName}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <div style="background:#185D7A;padding:24px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px;color:#fff;font-weight:800">New Quote Request</h1>
    <p style="margin:6px 0 0;color:#b6dcea;font-size:14px">${manufacturerName} · ${systemName}</p>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px">

    <h2 style="font-size:16px;font-weight:700;margin:0 0 12px">Contact</h2>
    <table style="font-size:14px;border-collapse:collapse;width:100%">
      <tr><td style="padding:4px 0;color:#6b7280;width:130px">Name</td><td><strong>${customerName}</strong></td></tr>
      <tr><td style="padding:4px 0;color:#6b7280">Email</td><td><a href="mailto:${customerEmail}" style="color:#185D7A">${customerEmail}</a></td></tr>
      ${customerPhone ? `<tr><td style="padding:4px 0;color:#6b7280">Phone</td><td><a href="tel:${customerPhone}" style="color:#185D7A">${customerPhone}</a></td></tr>` : ''}
      ${metaRows}
    </table>

    ${items.length ? `
    <h2 style="font-size:16px;font-weight:700;margin:20px 0 10px">Selected items (${items.length})</h2>
    ${itemsHtml(items)}
    ` : ''}

    ${message ? `
    <h2 style="font-size:16px;font-weight:700;margin:20px 0 8px">Message</h2>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0;white-space:pre-wrap">${message}</p>
    ` : ''}

    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9">
      <a href="mailto:${customerEmail}?subject=Re: Quote request — ${encodeURIComponent(systemName)}"
         style="display:inline-block;background:#185D7A;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        Reply to ${customerName} →
      </a>
    </div>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px">
    Sent via BuildQuote · <a href="https://studio.buildquote.com.au/manufacturer/quotes" style="color:#9ca3af">View all quote requests</a>
  </p>
</div>`,
  })
}

async function sendCustomerConfirmation(opts: {
  toEmail: string
  customerName: string
  manufacturerName: string
  systemName: string
  items: any[]
}) {
  const { toEmail, customerName, manufacturerName, systemName, items } = opts

  await resend.emails.send({
    from:    `BuildQuote <${FROM}>`,
    to:      toEmail,
    subject: `Your quote request for ${systemName} has been received`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111827">
  <div style="background:#185D7A;padding:24px 28px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px;color:#fff;font-weight:800">Quote Request Received</h1>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px">
    <p style="font-size:15px;margin:0 0 16px">Hi ${customerName},</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">
      Thanks for your quote request. <strong>${manufacturerName}</strong> will review your enquiry and be in touch shortly.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8">Your request</p>
      <p style="margin:0 0 10px;font-size:14px;font-weight:600">${systemName}</p>
      ${itemsHtml(items)}
    </div>

    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">
      If you have any follow-up questions in the meantime, reply to this email and we'll pass it on.
    </p>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:16px">Sent via BuildQuote</p>
</div>`,
  })
}

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

    // Validate token + get manufacturer
    const { data: widget } = await studio
      .from('manufacturer_embed_widgets')
      .select('id, manufacturer_id')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    // Fetch manufacturer name + notification email in parallel with insert
    const [insertResult, mfrResult] = await Promise.all([
      studio.from('widget_quote_requests').insert({
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
      }),
      studio
        .from('data_studio_manufacturers')
        .select('name, pending_contact_email_primary')
        .eq('id', widget.manufacturer_id)
        .single(),
    ])

    if (insertResult.error) {
      console.error('widget_quote_requests insert error:', insertResult.error)
      return NextResponse.json({ error: 'Failed to submit quote request' }, { status: 500 })
    }

    const manufacturerName  = mfrResult.data?.name ?? 'the manufacturer'
    const manufacturerEmail = mfrResult.data?.pending_contact_email_primary
    const items             = Array.isArray(selected_items) ? selected_items : []

    // Fire emails — don't let failures block the 200 response
    const emailOpts = { customerName: name, manufacturerName, systemName: system_name ?? system_id, items }
    await Promise.allSettled([
      manufacturerEmail
        ? sendManufacturerNotification({
            toEmail: manufacturerEmail,
            customerEmail: email,
            customerPhone: phone ?? null,
            postcode: postcode ?? null,
            projectType: project_type ?? null,
            timeline: timeline ?? null,
            message: message ?? null,
            ...emailOpts,
          })
        : Promise.resolve(),
      sendCustomerConfirmation({ toEmail: email, ...emailOpts }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Widget quote-request error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
