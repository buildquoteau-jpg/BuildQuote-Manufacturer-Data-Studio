'use client'

// Validation & audit exports:
//   * CSV audit trail — per card or all cards, optional date range
//   * Printable validation certificate per card version (opens the print
//     dialog — save as PDF; same pattern as the quote-request PDF)

import { useState, useTransition } from 'react'
import { getAuditTrailCsv, getCertificateData, type CertificateData } from '@/lib/studio-manufacturer/export-actions'

type CardOption = { id: string; name: string }

const selectStyle: React.CSSProperties = {
  padding: '0.45rem 0.7rem', border: '1.5px solid var(--ds-border)',
  borderRadius: 6, fontSize: '0.83rem', background: '#fff', color: 'var(--ds-text)',
  maxWidth: 280,
}

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function certificateHtml(d: CertificateData): string {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
  const esc = (s: string | null) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const fieldRows = d.fieldSummary.map((f) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">${esc(f.field)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.value)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.status)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${esc(f.sourceDocument)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${fmt(f.reviewedAt)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Validation Certificate — ${esc(d.cardName)} v${d.version}</title>
<style>body{font-family:Arial,sans-serif;margin:36px;color:#111827;font-size:13px}@media print{body{margin:16px}}</style>
</head><body>
<div style="background:#185D7A;padding:22px 30px;border-radius:8px 8px 0 0">
  <p style="margin:0;font-size:11px;color:#f97316;text-transform:uppercase;letter-spacing:2px;font-weight:700">System Card Validation Certificate</p>
  <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#fff">${esc(d.cardName)}</p>
  <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.75)">${esc(d.manufacturerName)} · Version ${d.version}</p>
</div>
<div style="background:#f97316;height:3px"></div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px 30px;border-radius:0 0 8px 8px">
  <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:13px">
    <tr><td style="padding:4px 0;color:#64748b;width:200px">Validated by</td><td style="padding:4px 0;font-weight:700">${esc(d.manufacturerName)}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Verification record</td><td style="padding:4px 0">${esc(d.validatedBy) || '—'}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Verified on</td><td style="padding:4px 0">${fmt(d.validatedAt)}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Version published</td><td style="padding:4px 0">v${d.version} · ${fmt(d.packagedAt)}</td></tr>
    <tr><td style="padding:4px 0;color:#64748b">Card reference</td><td style="padding:4px 0">${esc(d.cardSlug)}</td></tr>
  </table>
  <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:1.5px">Field verification detail</p>
  ${d.fieldSummary.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#185D7A">
      <th style="padding:7px 10px;text-align:left;color:#fff">Field</th>
      <th style="padding:7px 10px;text-align:left;color:#fff">Verified value</th>
      <th style="padding:7px 10px;text-align:left;color:#fff">Status</th>
      <th style="padding:7px 10px;text-align:left;color:#fff">Source document</th>
      <th style="padding:7px 10px;text-align:left;color:#fff">Reviewed</th>
    </tr></thead>
    <tbody>${fieldRows}</tbody>
  </table>` : '<p style="color:#94a3b8;font-style:italic">No field-level verification records for this card.</p>'}
  <p style="margin:26px 0 0;font-size:11px;color:#94a3b8">
    Certificate generated ${fmt(d.generatedAt)} by BuildQuote Data Studio.
    This document reflects the manufacturer-validated data captured in version ${d.version} of this System Card.
  </p>
</div>
</body></html>`
}

export function ExportsClient({ manufacturerId, cards }: {
  manufacturerId: string
  cards: CardOption[]
}) {
  const [cardId, setCardId] = useState<string>('')     // '' = all cards
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function exportCsv() {
    setError(null); setMessage(null)
    startTransition(async () => {
      const res = await getAuditTrailCsv(manufacturerId, {
        cardId: cardId || undefined,
        fromIso: fromDate ? new Date(fromDate).toISOString() : undefined,
        toIso: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      downloadText(res.csv, res.filename, 'text/csv;charset=utf-8;')
      setMessage(`Exported ${res.rowCount} audit row${res.rowCount === 1 ? '' : 's'}.`)
    })
  }

  function exportCertificate() {
    setError(null); setMessage(null)
    if (!cardId) { setError('Pick a card to generate its validation certificate.'); return }
    startTransition(async () => {
      const res = await getCertificateData(manufacturerId, cardId)
      if (!res.ok) { setError(res.error); return }
      const w = window.open('', '_blank', 'width=900,height=700')
      if (!w) { setError('Pop-up blocked — allow pop-ups to print the certificate.'); return }
      w.document.write(certificateHtml(res.data))
      w.document.close()
      w.addEventListener('load', () => w.print())
      setMessage(`Certificate for v${res.data.version} opened — use the print dialog to save as PDF.`)
    })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '1rem 1.2rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Card</label>
          <select style={selectStyle} value={cardId} onChange={e => setCardId(e.target.value)}>
            <option value="">All cards</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>From</label>
          <input type="date" style={selectStyle} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>To</label>
          <input type="date" style={selectStyle} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <button type="button" className="studio-btn studio-btn-primary" onClick={exportCsv} disabled={pending}>
          {pending ? 'Working…' : 'Export CSV audit trail'}
        </button>
        <button type="button" className="studio-btn studio-btn-ghost" onClick={exportCertificate} disabled={pending}>
          Validation certificate (PDF)
        </button>
      </div>
      {error && <div className="studio-warn" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{error}</div>}
      {message && <div className="studio-info" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{message}</div>}
      <p style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint)', margin: '0.75rem 0 0', lineHeight: 1.6 }}>
        The CSV lists every field verification — card, field, value, source document, version,
        validated-by and timestamp. The certificate is a clean printable summary of one card
        version (latest by default) — use your browser&apos;s print dialog to save it as a PDF.
      </p>
    </div>
  )
}
