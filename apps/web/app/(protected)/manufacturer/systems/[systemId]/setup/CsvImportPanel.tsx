'use client'

// CSV alternative to document upload (design doc addendum 3 §C5 step 4,
// "download the CSV header guide and fill it out directly") — for the
// structured fields a manufacturer already knows precisely: profiles/
// variants, colours, components/accessories, and a handful of technical
// attributes. Applications, installation methods and free-text knowledge
// stay PDF/AI-extraction territory; this is a shortcut around that pipeline
// for data that doesn't need AI to read it out of a document in the first
// place.

import { useRef, useState } from 'react'
import {
  importSystemCsvRows,
  CSV_TEMPLATE_HEADERS,
  CSV_TEMPLATE_SAMPLE_ROWS,
  type CsvImportRow,
} from '@/lib/studio-manufacturer/csv-import-actions'

// Minimal RFC-4180-ish parser: handles quoted fields, embedded commas,
// escaped quotes ("") and CRLF/LF line endings — no dependency needed for
// manufacturer-authored spreadsheet exports.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.some((v) => v.trim() !== '')) rows.push(row) }
  return rows
}

function buildTemplateCsv(): string {
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [CSV_TEMPLATE_HEADERS.join(','), ...CSV_TEMPLATE_SAMPLE_ROWS.map((r) => r.map(escape).join(','))]
  return lines.join('\r\n')
}

function downloadTemplate() {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'buildquote-system-card-template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function CsvImportPanel({
  systemId,
  manufacturerId,
  onImported,
}: {
  systemId: string
  manufacturerId: string
  onImported?: (counts: { profiles: number; colours: number; components: number; attributes: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ counts: { profiles: number; colours: number; components: number; attributes: number }; rowErrors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const text = await file.text()
      const table = parseCsv(text)
      if (table.length < 2) { setError('That CSV has no data rows.'); return }
      const headers = table[0].map((h) => h.trim().toLowerCase())
      const rows: CsvImportRow[] = table.slice(1).map((cells) => {
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
        return row as CsvImportRow
      })
      const res = await importSystemCsvRows(systemId, manufacturerId, rows)
      if (!res.ok) { setError(res.error); return }
      setResult(res)
      onImported?.(res.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: '0.8rem', borderTop: '1px solid var(--ds-border, #e5e7eb)', paddingTop: '0.8rem' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: '0.82rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {open ? '▾' : '▸'} Prefer a spreadsheet? Fill out a CSV instead
      </button>
      {open && (
        <div style={{ marginTop: '0.6rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', margin: '0 0 0.6rem', lineHeight: 1.55 }}>
            Download the header guide, add one row per profile, colour, component or technical
            attribute, then upload it back here. Covers profiles/variants, uom, pack sizes, colours,
            components/accessories, and attributes like BAL rating, fire rating, acoustic rating,
            structural grade, moisture resistant and Australian made. Anything else — sustainability
            credentials, applications, span tables — still comes from the source documents above.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button" onClick={downloadTemplate}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Download CSV template
            </button>
            <button
              type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Importing…' : 'Upload filled-out CSV'}
            </button>
            <input
              ref={fileInputRef} type="file" accept=".csv,text/csv" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            />
          </div>
          {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.6rem' }}>{error}</div>}
          {result && (
            <div style={{ fontSize: '0.78rem', color: '#16a34a', marginTop: '0.6rem' }}>
              Imported {result.counts.profiles} profile{result.counts.profiles === 1 ? '' : 's'},{' '}
              {result.counts.colours} colour{result.counts.colours === 1 ? '' : 's'},{' '}
              {result.counts.components} component{result.counts.components === 1 ? '' : 's'} and{' '}
              {result.counts.attributes} attribute{result.counts.attributes === 1 ? '' : 's'}.
              {result.rowErrors.length > 0 && (
                <div style={{ color: '#d97706', marginTop: '0.3rem' }}>
                  {result.rowErrors.length} row{result.rowErrors.length === 1 ? '' : 's'} had a problem: {result.rowErrors.join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
