'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type QuoteRequestItem = {
  item_id: string
  type: string
  label: string
  dims: string
  uom: string
  product_code: string | null
  quantity: number
  details: string
}

export type QuoteRequest = {
  id: string
  system_name: string | null
  selected_items: QuoteRequestItem[]
  name: string
  email: string
  phone: string | null
  postcode: string | null
  project_type: string | null
  timeline: string | null
  message: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  new:       { bg: '#fef3c7', color: '#92400e', label: 'New' },
  viewed:    { bg: '#e0f2fe', color: '#0369a1', label: 'Viewed' },
  responded: { bg: '#dcfce7', color: '#166534', label: 'Responded' },
}
const PROJECT_LABELS: Record<string, string> = { residential: 'Residential', commercial: 'Commercial', other: 'Other' }
const TIMELINE_LABELS: Record<string, string> = { asap: 'ASAP', '1-3months': '1–3 months', planning: 'Just planning' }

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return iso }
}

function buildPrintHtml(q: QuoteRequest): string {
  const dateStr  = formatDateShort(q.created_at)
  const items    = Array.isArray(q.selected_items) ? q.selected_items : []
  const shortRef = `QR-${dateStr.replace(/\//g, '')}-${q.name.replace(/\s+/g, '').slice(0, 6).toUpperCase()}`

  const itemRows = items.map((item, i) => {
    const bg    = i % 2 === 0 ? '#ffffff' : '#f5f7f9'
    const specs = [item.dims, item.details].filter(Boolean).join(' · ')
    return `<tr style="background:${bg}">
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${i + 1}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600">${item.label}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${specs}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${item.product_code ?? ''}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${item.uom ?? ''}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700">${item.quantity ?? 1}</td>
    </tr>`
  }).join('')

  const meta = [
    q.postcode    && `Postcode: ${q.postcode}`,
    q.project_type && `Project type: ${PROJECT_LABELS[q.project_type] ?? q.project_type}`,
    q.timeline    && `Timeline: ${TIMELINE_LABELS[q.timeline] ?? q.timeline}`,
  ].filter(Boolean).join('  ·  ')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quote Request — ${shortRef}</title>
<style>body{font-family:Arial,sans-serif;margin:32px;color:#111827}@media print{body{margin:16px}}</style>
</head><body>
<div style="background:#185D7A;padding:20px 28px;border-radius:8px 8px 0 0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><p style="margin:0;font-size:20px;font-weight:800;color:#fff">${q.system_name ?? 'Quote Request'}</p>
    <p style="margin:2px 0 0;font-size:9px;color:#f97316;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Quote Request</p></td>
    <td style="text-align:right"><p style="margin:0;font-size:13px;font-weight:700;color:#f97316">${shortRef}</p>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7)">${dateStr}</p></td>
  </tr></table>
</div>
<div style="background:#f97316;height:3px"></div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:20px 28px;border-radius:0 0 8px 8px">
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px"><tr>
    <td style="width:50%;vertical-align:top;padding-right:16px">
      <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px">From</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#185D7A">${q.name}</p>
      <p style="margin:0 0 1px;font-size:12px;color:#64748b">${q.email}</p>
      ${q.phone ? `<p style="margin:0 0 1px;font-size:12px;color:#64748b">${q.phone}</p>` : ''}
    </td>
    <td style="width:50%;vertical-align:top">
      ${meta ? `<p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px">Project</p>
      <p style="margin:0;font-size:12px;color:#64748b">${meta}</p>` : ''}
    </td>
  </tr></table>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px">
  <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px">Requested Items</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <thead><tr style="background:#185D7A">
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">#</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">Item</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">Specs / Notes</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">Product Code</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">UOM</th>
      <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:#fff">Qty</th>
    </tr></thead>
    <tbody>${itemRows || `<tr><td colspan="6" style="padding:12px 10px;font-size:13px;color:#94a3b8;font-style:italic">General enquiry — no specific items selected.</td></tr>`}</tbody>
  </table>
  ${q.message ? `<div style="margin-top:20px">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px">Message</p>
    <div style="background:#f5f7f9;border-radius:6px;padding:12px 16px;font-size:13px;color:#334155;line-height:1.5">${q.message}</div>
  </div>` : ''}
  <p style="margin-top:24px;font-size:10px;color:#94a3b8">Reference: ${shortRef} · Sent via BuildQuote</p>
</div>
</body></html>`
}

function buildCsvContent(q: QuoteRequest): string {
  const items   = Array.isArray(q.selected_items) ? q.selected_items : []
  const esc     = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const dateStr = formatDateShort(q.created_at)

  const meta = [
    ['Reference',    `QR-${dateStr.replace(/\//g, '')}-${q.name.replace(/\s+/g, '').slice(0, 6).toUpperCase()}`],
    ['System',       q.system_name ?? ''],
    ['Date',         dateStr],
    ['Name',         q.name],
    ['Email',        q.email],
    ['Phone',        q.phone ?? ''],
    ['Postcode',     q.postcode ?? ''],
    ['Project Type', q.project_type ? (PROJECT_LABELS[q.project_type] ?? q.project_type) : ''],
    ['Timeline',     q.timeline ? (TIMELINE_LABELS[q.timeline] ?? q.timeline) : ''],
    ['Message',      q.message ?? ''],
    [],
    ['#', 'Item', 'Specs / Notes', 'Product Code', 'UOM', 'Qty'],
    ...items.map((item, i) => [
      i + 1,
      item.label,
      [item.dims, item.details].filter(Boolean).join(' · '),
      item.product_code ?? '',
      item.uom ?? '',
      item.quantity ?? 1,
    ]),
  ]
  return meta.map(row => (row as unknown[]).map(esc).join(',')).join('\r\n')
}

export function QuoteCardClient({ q }: { q: QuoteRequest }) {
  const router   = useRouter()
  const [busy, setBusy] = useState(false)

  const statusStyle = STATUS_STYLES[q.status] ?? STATUS_STYLES.new
  const items       = Array.isArray(q.selected_items) ? q.selected_items : []

  async function handleDelete() {
    if (!window.confirm('Delete this quote request? This cannot be undone.')) return
    setBusy(true)
    await fetch(`/api/manufacturer/quote-request/${q.id}`, { method: 'DELETE' })
    router.refresh()
  }

  function handleCsv() {
    const csv  = buildCsvContent(q)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `quote-request-${q.id.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePdf() {
    const html = buildPrintHtml(q)
    const w    = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.addEventListener('load', () => w.print())
  }

  return (
    <div style={{
      background: '#fff',
      border: q.status === 'new' ? '1.5px solid #185D7A' : '1.5px solid #e2e8f0',
      borderRadius: 12, padding: '1.25rem 1.5rem',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{q.name}</div>
          <div style={{ fontSize: '0.83rem', color: '#475569', marginTop: '0.15rem' }}>
            {q.system_name ?? 'Unknown system'} · {formatDate(q.created_at)}
          </div>
        </div>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          background: statusStyle.bg, color: statusStyle.color,
          padding: '0.25rem 0.6rem', borderRadius: 5, flexShrink: 0,
        }}>
          {statusStyle.label}
        </span>
      </div>

      {/* Contact */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', fontSize: '0.83rem' }}>
        <a href={`mailto:${q.email}`} style={{ color: '#185D7A', fontWeight: 600, textDecoration: 'none' }}>{q.email}</a>
        {q.phone && <a href={`tel:${q.phone}`} style={{ color: '#374151', textDecoration: 'none' }}>{q.phone}</a>}
        {q.postcode && <span style={{ color: '#6b7280' }}>Postcode {q.postcode}</span>}
        {q.project_type && <span style={{ color: '#6b7280' }}>{PROJECT_LABELS[q.project_type] ?? q.project_type}</span>}
        {q.timeline && <span style={{ color: '#6b7280' }}>Timeline: {TIMELINE_LABELS[q.timeline] ?? q.timeline}</span>}
      </div>

      {/* Selected items table */}
      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: '#185D7A' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: '#fff', whiteSpace: 'nowrap', width: '28px' }}>#</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: '#fff' }}>Item</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: '#fff' }}>Specs / Notes</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: '#fff', whiteSpace: 'nowrap' }}>Product Code</th>
                <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', color: '#fff', whiteSpace: 'nowrap' }}>UOM</th>
                <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, fontSize: '0.72rem', color: '#fff', width: '48px' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const specs = [item.dims, item.details].filter(Boolean).join(' · ')
                const bg    = i % 2 === 0 ? '#ffffff' : '#f8fafc'
                return (
                  <tr key={i} style={{ background: bg }}>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#94a3b8', verticalAlign: 'top' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#0f172a', verticalAlign: 'top' }}>{item.label}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#64748b', verticalAlign: 'top' }}>{specs || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontFamily: 'monospace', fontSize: '0.75rem', verticalAlign: 'top' }}>{item.product_code ?? '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.04em', verticalAlign: 'top' }}>{item.uom || '—'}</td>
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', textAlign: 'center', verticalAlign: 'top' }}>{item.quantity ?? 1}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Message */}
      {q.message && (
        <div style={{ fontSize: '0.83rem', color: '#475569', lineHeight: 1.55, borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
          {q.message}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem', flexWrap: 'wrap' }}>
        <a
          href={`mailto:${q.email}?subject=Re: Quote request — ${encodeURIComponent(q.system_name ?? 'your enquiry')}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.83rem', fontWeight: 600, color: '#185D7A', background: '#eef6fa', border: '1.5px solid #b6dcea', padding: '7px 14px', borderRadius: 8, textDecoration: 'none' }}
        >
          Reply via email →
        </a>
        <button
          onClick={handleCsv}
          style={{ fontSize: '0.83rem', fontWeight: 600, color: '#374151', background: '#f8fafc', border: '1.5px solid #e2e8f0', padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}
        >
          Download CSV
        </button>
        <button
          onClick={handlePdf}
          style={{ fontSize: '0.83rem', fontWeight: 600, color: '#374151', background: '#f8fafc', border: '1.5px solid #e2e8f0', padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}
        >
          Download PDF
        </button>
        <button
          onClick={handleDelete}
          disabled={busy}
          style={{ marginLeft: 'auto', fontSize: '0.83rem', fontWeight: 600, color: '#dc2626', background: '#fff', border: '1.5px solid #fca5a5', padding: '7px 14px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
