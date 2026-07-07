'use client'

// Bulk stockist import: download a CSV template, fill it, upload it. Parsing
// happens client-side; the parsed rows go to the importStockists server action,
// which validates each row (same sanitiser as single-add) and reports skips.

import { useRef, useState, useTransition } from 'react'
import { importStockists } from '@/lib/studio-manufacturer/stockist-actions'
import type { StockistInput } from '@/lib/studio-manufacturer/stockist-types'

const TEMPLATE_HEADER = 'business_name,suburb,state,phone,website,trade_desk_email'
const TEMPLATE_ROWS = [
  'Example Building Supplies,Perth,WA,08 9000 0000,https://example.com.au,trade@example.com.au',
  'Second Merchant,Fremantle,WA,,,',
]

// Minimal RFC-4180-ish parser: quoted fields, "" escapes, newlines in quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  // Drop fully-blank rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function rowsToInputs(rows: string[][]): { inputs: StockistInput[]; error?: string } {
  if (rows.length < 1) return { inputs: [], error: 'The CSV is empty.' }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const idx = (aliases: string[]) => header.findIndex((h) => aliases.includes(h))

  const bi = idx(['business_name', 'business name', 'business', 'name'])
  if (bi === -1) {
    return { inputs: [], error: 'CSV needs a "business_name" column (download the template for the exact headers).' }
  }
  const si = idx(['suburb', 'town', 'suburb / town', 'suburb/town'])
  const sti = idx(['state'])
  const pi = idx(['phone', 'phone number'])
  const wi = idx(['website', 'website_url', 'url', 'web'])
  const ei = idx(['trade_desk_email', 'trade desk email', 'email', 'trade email'])

  const get = (r: string[], n: number) => (n >= 0 && n < r.length ? r[n].trim() : '')
  const inputs: StockistInput[] = rows.slice(1).map((r) => ({
    businessName: get(r, bi),
    suburb: get(r, si) || null,
    state: get(r, sti) || null,
    phone: get(r, pi) || null,
    websiteUrl: get(r, wi) || null,
    tradeDeskEmail: get(r, ei) || null,
  }))
  return { inputs }
}

export function StockistCsvTools({
  manufacturerId,
  onImported,
}: {
  manufacturerId: string
  onImported: () => void | Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  function downloadTemplate() {
    const csv = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].join('\r\n') + '\r\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'stockists-template.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setMessage(null)

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const { inputs, error } = rowsToInputs(parseCsv(text))
      if (error) { setMessage({ tone: 'error', text: error }); return }
      const nonEmpty = inputs.filter((i) => i.businessName.trim() !== '')
      if (nonEmpty.length === 0) {
        setMessage({ tone: 'error', text: 'No stockist rows found under the header.' })
        return
      }
      startTransition(async () => {
        const res = await importStockists(manufacturerId, nonEmpty)
        if (!res.ok) { setMessage({ tone: 'error', text: res.error }); return }
        const skips = res.skipped.length
        const text =
          `Imported ${res.inserted} stockist${res.inserted === 1 ? '' : 's'}.` +
          (skips ? ` Skipped ${skips} row${skips === 1 ? '' : 's'}: ` +
            res.skipped.slice(0, 5).map((s) => `row ${s.row} (${s.reason})`).join('; ') +
            (skips > 5 ? '…' : '') : '')
        setMessage({ tone: skips ? 'warn' : 'ok', text })
        await onImported()
      })
    }
    reader.onerror = () => setMessage({ tone: 'error', text: 'Could not read the file.' })
    reader.readAsText(file)
  }

  const color = message?.tone === 'ok' ? '#16a34a' : message?.tone === 'warn' ? '#b45309' : '#dc2626'

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
      <button type="button" className="studio-btn studio-btn-ghost" onClick={downloadTemplate} disabled={pending}>
        Download CSV template
      </button>
      <button
        type="button"
        className="studio-btn studio-btn-ghost"
        onClick={() => fileRef.current?.click()}
        disabled={pending}
      >
        {pending ? 'Importing…' : 'Import CSV'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      {message && (
        <span style={{ fontSize: '0.8rem', color, fontWeight: 600, flexBasis: '100%' }}>
          {message.text}
        </span>
      )}
    </div>
  )
}
