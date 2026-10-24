import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { createProductionServiceClient } from '@/lib/supabase/production'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'rfq@buildquote.com.au'

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;.]+(?:\.[^\s@<>,;.]+)+$/
const MAX_SELECTED_ITEMS = 200

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

// Everything below is public, unauthenticated input rendered into HTML emails.
// Escape before interpolation so a submission can't inject markup or links.
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escItems(items: SelectedItem[]): SelectedItem[] {
  return items.map((item) => ({
    ...item,
    label: esc(item.label),
    dims: esc(item.dims),
    uom: esc(item.uom),
    product_code: item.product_code == null ? null : esc(item.product_code),
    details: esc(item.details),
    quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 1,
  }))
}

function formatDate(date: Date = new Date()): string {
  const dd   = String(date.getDate()).padStart(2, '0')
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

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

type SelectedItem = {
  item_id: string
  type: 'profile' | 'colour' | 'component'
  label: string
  dims: string
  uom: string
  product_code: string | null
  quantity: number
  details: string
}

function buildManufacturerEmailHtml(opts: {
  manufacturerName: string
  systemName: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  postcode: string | null
  projectType: string | null
  timeline: string | null
  message: string | null
  items: SelectedItem[]
}): string {
  const manufacturerName = esc(opts.manufacturerName)
  const systemName       = esc(opts.systemName)
  const customerName     = esc(opts.customerName)
  const customerEmail    = esc(opts.customerEmail)
  const customerPhone    = opts.customerPhone ? esc(opts.customerPhone) : null
  const postcode         = opts.postcode ? esc(opts.postcode) : null
  const projectType      = opts.projectType ? esc(opts.projectType) : null
  const timeline         = opts.timeline ? esc(opts.timeline) : null
  const message          = opts.message ? esc(opts.message) : null
  const items            = escItems(opts.items)

  const dateStr   = formatDate()
  const shortRef  = `QR-${dateStr}-${opts.customerName.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`
  const mfrShort  = manufacturerName.substring(0, 42)

  const itemRows = items.map((item, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f7f9'
    const specs = [item.dims, item.details].filter(Boolean).join(' · ')
    return `
    <tr style="background:${bg};">
      <td style="padding:8px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
      <td style="padding:8px 10px;font-size:13px;color:#000000;border-bottom:1px solid #e2e8f0;">${item.label}</td>
      <td style="padding:8px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${specs}</td>
      <td style="padding:8px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${item.product_code ?? ''}</td>
      <td style="padding:8px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${item.uom ?? ''}</td>
      <td style="padding:8px 10px;font-size:13px;color:#000000;font-weight:600;border-bottom:1px solid #e2e8f0;">${item.quantity ?? 1}</td>
    </tr>`
  }).join('')

  const projectRow  = projectType ? `<p style="margin:0 0 4px;font-size:12px;color:#64748b;"><strong style="color:#334155;">Project type:</strong> ${PROJECT_LABELS[projectType] ?? projectType}</p>` : ''
  const timelineRow = timeline    ? `<p style="margin:0;font-size:12px;color:#64748b;"><strong style="color:#334155;">Timeline:</strong> ${TIMELINE_LABELS[timeline] ?? timeline}</p>` : ''
  const postcodeRow = postcode    ? `<p style="margin:0 0 4px;font-size:12px;color:#64748b;"><strong style="color:#334155;">Postcode:</strong> ${postcode}</p>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f7f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:#185D7A;padding:20px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${mfrShort}</p>
            <p style="margin:2px 0 0;font-size:9px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">Quote Request — ${systemName}</p>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <p style="margin:0;font-size:13px;font-weight:700;color:#f97316;">${shortRef}</p>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">${dateStr}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ORANGE ACCENT BAR -->
  <tr><td style="background:#f97316;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- FROM / TO -->
  <tr>
    <td style="padding:24px 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:16px;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">From</p>
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#185D7A;">${customerName}</p>
            <p style="margin:0 0 1px;font-size:12px;color:#64748b;"><a href="mailto:${customerEmail}" style="color:#64748b;text-decoration:none;">${customerEmail}</a></p>
            ${customerPhone ? `<p style="margin:0 0 1px;font-size:12px;color:#64748b;"><a href="tel:${customerPhone}" style="color:#64748b;text-decoration:none;">${customerPhone}</a></p>` : ''}
            ${postcode ? `<p style="margin:0;font-size:12px;color:#64748b;">Postcode: ${postcode}</p>` : ''}
          </td>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">To</p>
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#185D7A;">${manufacturerName}</p>
            <p style="margin:0;font-size:12px;color:#64748b;">via BuildQuote widget</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- DIVIDER -->
  <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;"></div></td></tr>

  <!-- PROJECT DETAILS -->
  ${projectType || timeline || postcode ? `
  <tr>
    <td style="padding:16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;border-radius:6px;">
        <tr>
          <td style="padding:12px 16px;">
            ${postcodeRow}
            ${projectRow}
            ${timelineRow}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- LINE ITEMS LABEL -->
  <tr>
    <td style="padding:8px 32px 8px;">
      <p style="margin:0;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">Requested Items</p>
    </td>
  </tr>

  <!-- LINE ITEMS TABLE -->
  <tr>
    <td style="padding:0 32px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#185D7A;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">#</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Item</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Specs / Notes</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Product Code</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">UOM</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Qty</th>
          </tr>
        </thead>
        <tbody>${items.length ? itemRows : `<tr><td colspan="6" style="padding:12px 10px;font-size:13px;color:#94a3b8;font-style:italic;">No specific items selected — general enquiry.</td></tr>`}</tbody>
      </table>
    </td>
  </tr>

  ${message ? `
  <!-- MESSAGE -->
  <tr>
    <td style="padding:0 32px 24px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">Message</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;border-radius:6px;">
        <tr><td style="padding:12px 16px;font-size:13px;color:#334155;line-height:1.5;">${message}</td></tr>
      </table>
    </td>
  </tr>
  ` : ''}

  <!-- DIVIDER -->
  <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;"></div></td></tr>

  <!-- REFERENCE -->
  <tr>
    <td style="padding:16px 32px;">
      <p style="margin:0 0 2px;font-size:12px;color:#64748b;"><strong style="color:#334155;">Reference:</strong> ${shortRef}</p>
      <p style="margin:0;font-size:12px;color:#64748b;"><strong style="color:#334155;">Received:</strong> ${dateStr}</p>
    </td>
  </tr>

  <!-- WHAT HAPPENS NEXT -->
  <tr>
    <td style="background:#fff8f0;border-top:2px solid #f97316;padding:20px 32px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">What Happens Next</p>
      <p style="margin:0 0 6px;font-size:12px;color:#334155;line-height:1.5;">Reply directly to <strong>${customerName}</strong> at <a href="mailto:${customerEmail}" style="color:#185D7A;">${customerEmail}</a>${customerPhone ? ` or call <strong>${customerPhone}</strong>` : ''} to provide a quote or discuss the request further.</p>
      <p style="margin:0 0 12px;font-size:12px;color:#334155;line-height:1.5;">You can also manage all incoming quote requests in your BuildQuote manufacturer workspace.</p>
      <a href="https://studio.buildquote.com.au/manufacturer/quotes"
         style="display:inline-block;background:#185D7A;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">
        View Quote Requests →
      </a>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f5f7f9;border-top:1px solid #e2e8f0;padding:16px 32px;">
      <p style="margin:0;font-size:10px;color:#94a3b8;">Sent via <strong style="color:#f97316;">BuildQuote</strong> &mdash; buildquote.com.au</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

function buildCustomerConfirmationHtml(opts: {
  customerName: string
  manufacturerName: string
  manufacturerEmail: string | null
  systemName: string
  items: SelectedItem[]
}): string {
  const customerName      = esc(opts.customerName)
  const manufacturerName  = esc(opts.manufacturerName)
  const manufacturerEmail = opts.manufacturerEmail ? esc(opts.manufacturerEmail) : null
  const systemName        = esc(opts.systemName)
  const items             = escItems(opts.items)
  const dateStr = formatDate()

  const itemRows = items.map((item, i) => {
    const bg    = i % 2 === 0 ? '#ffffff' : '#f5f7f9'
    const specs = [item.dims, item.details].filter(Boolean).join(' · ')
    return `
    <tr style="background:${bg};">
      <td style="padding:8px 10px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">${i + 1}</td>
      <td style="padding:8px 10px;font-size:13px;color:#000000;border-bottom:1px solid #e2e8f0;">${item.label}</td>
      <td style="padding:8px 10px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${specs}</td>
      <td style="padding:8px 10px;font-size:13px;color:#000000;font-weight:600;border-bottom:1px solid #e2e8f0;">${item.quantity ?? 1}</td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f7f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr>
    <td style="background:#185D7A;padding:20px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Quote Request Received</p>
            <p style="margin:2px 0 0;font-size:9px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">${systemName} · ${manufacturerName}</p>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);">${dateStr}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ORANGE ACCENT BAR -->
  <tr><td style="background:#f97316;height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- INTRO -->
  <tr>
    <td style="padding:24px 32px 16px;">
      <p style="margin:0 0 12px;font-size:15px;color:#334155;">Hi ${customerName},</p>
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;">
        Thanks for your quote request. <strong>${manufacturerName}</strong> has received your enquiry and will be in touch directly to discuss pricing and availability.
      </p>
    </td>
  </tr>

  <!-- DIVIDER -->
  <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;"></div></td></tr>

  <!-- ITEMS LABEL -->
  <tr>
    <td style="padding:16px 32px 8px;">
      <p style="margin:0;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">Your Selection</p>
    </td>
  </tr>

  <!-- ITEMS TABLE -->
  <tr>
    <td style="padding:0 32px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#185D7A;">
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">#</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Item</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Specs / Notes</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;">Qty</th>
          </tr>
        </thead>
        <tbody>${items.length ? itemRows : `<tr><td colspan="4" style="padding:12px 10px;font-size:13px;color:#94a3b8;font-style:italic;">General enquiry — no specific items selected.</td></tr>`}</tbody>
      </table>
    </td>
  </tr>

  <!-- WHAT HAPPENS NEXT -->
  <tr>
    <td style="background:#fff8f0;border-top:2px solid #f97316;padding:20px 32px;">
      <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;">What Happens Next</p>
      <p style="margin:0;font-size:12px;color:#334155;line-height:1.5;">
        <strong>${manufacturerName}</strong> will be in touch directly to discuss pricing and availability. If you have any follow-up questions, reply to this email${manufacturerEmail ? ` or contact them directly at <a href="mailto:${manufacturerEmail}" style="color:#185D7A;">${manufacturerEmail}</a>` : ''}.
      </p>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#f5f7f9;border-top:1px solid #e2e8f0;padding:16px 32px;">
      <p style="margin:0;font-size:10px;color:#94a3b8;">Sent via <strong style="color:#f97316;">BuildQuote</strong> &mdash; buildquote.com.au</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`
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

    // The customer address becomes the manufacturer email's Reply-To, so it has
    // to be a single, well-formed address — no header-injecting whitespace.
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
      return NextResponse.json({ error: 'A valid name is required' }, { status: 400 })
    }
    if (Array.isArray(selected_items) && selected_items.length > MAX_SELECTED_ITEMS) {
      return NextResponse.json({ error: 'Too many selected items' }, { status: 400 })
    }

    const prod   = createProductionServiceClient()
    const studio = createStudioServiceClient()

    // Validate token in production, get manufacturer name + slug in one query
    const { data: widget } = await prod
      .from('embed_widgets')
      .select('id, manufacturers(name, slug)')
      .eq('public_token', token)
      .eq('status', 'active')
      .single()

    if (!widget) {
      return NextResponse.json({ error: 'Invalid widget token' }, { status: 403 })
    }

    const manufacturerName = (widget as any).manufacturers?.name ?? 'the manufacturer'
    const manufacturerSlug = (widget as any).manufacturers?.slug as string | null

    // Bridge to data_studio via slug to get manufacturer_id for the studio inbox
    const { data: mfrRow } = manufacturerSlug
      ? await studio.from('data_studio_manufacturers').select('id').eq('slug', manufacturerSlug).single()
      : { data: null }
    const dataStudioManufacturerId = (mfrRow as any)?.id ?? null

    // Insert quote request + look up manufacturer user in parallel
    const [insertResult, muResult] = await Promise.all([
      studio.from('widget_quote_requests').insert({
        manufacturer_id: dataStudioManufacturerId,
        widget_id:       null,
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
      dataStudioManufacturerId
        ? studio.from('manufacturer_users').select('auth_user_id').eq('manufacturer_id', dataStudioManufacturerId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (insertResult.error) {
      console.error('widget_quote_requests insert error:', insertResult.error)
      return NextResponse.json({ error: 'Failed to submit quote request' }, { status: 500 })
    }

    // Resolve manufacturer email from user profile
    let manufacturerEmail: string | null = null
    if ((muResult as any).data?.auth_user_id) {
      const { data: profile } = await studio
        .from('data_studio_user_profiles')
        .select('company_email_primary, email')
        .eq('auth_user_id', (muResult as any).data.auth_user_id)
        .maybeSingle()
      manufacturerEmail = profile?.company_email_primary ?? profile?.email ?? null
    }
    const items             = (Array.isArray(selected_items) ? selected_items : []) as SelectedItem[]
    const systemName        = system_name ?? system_id

    const resend = getResend()
    await Promise.allSettled([
      manufacturerEmail
        ? resend.emails.send({
            from:     `BuildQuote RFQ <${FROM}>`,
            to:       manufacturerEmail,
            replyTo:  email,
            bcc:      FROM,
            subject:  `New quote request — ${systemName} from ${name}`,
            html:     buildManufacturerEmailHtml({
              manufacturerName,
              systemName,
              customerName:  name,
              customerEmail: email,
              customerPhone: phone ?? null,
              postcode:      postcode ?? null,
              projectType:   project_type ?? null,
              timeline:      timeline ?? null,
              message:       message ?? null,
              items,
            }),
          })
        : Promise.resolve(),
      resend.emails.send({
        from:    `BuildQuote <${FROM}>`,
        to:      email,
        replyTo: manufacturerEmail ?? FROM,
        subject: `Your quote request for ${systemName} has been received`,
        html:    buildCustomerConfirmationHtml({
          customerName:     name,
          manufacturerName,
          manufacturerEmail: manufacturerEmail ?? null,
          systemName,
          items,
        }),
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Widget quote-request error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
