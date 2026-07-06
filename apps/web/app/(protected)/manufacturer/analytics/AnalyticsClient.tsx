'use client'

// Analytics tab body: range/card filters, totals, views-per-day line chart
// (hand-rolled SVG — no chart lib), by-card table, shares by channel/sender,
// top doc clicks, and a "create tagged share link" form for reps.

import { useState, useTransition } from 'react'
import {
  createTaggedShareLink,
  getCardAnalytics,
  type AnalyticsData,
} from '@/lib/studio-manufacturer/analytics-actions'

type Card = { id: string; name: string; slug: string | null }

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.72rem',
  textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--ds-text-muted)',
}
const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderTop: '1px solid var(--ds-border-soft)' }

function LineChart({ series }: { series: { date: string; views: number }[] }) {
  const w = 640, h = 140, pad = 24
  const max = Math.max(1, ...series.map(p => p.views))
  const stepX = (w - pad * 2) / Math.max(1, series.length - 1)
  const points = series.map((p, i) => {
    const x = pad + i * stepX
    const y = h - pad - (p.views / max) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const first = series[0]?.date ?? ''
  const last = series[series.length - 1]?.date ?? ''

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 640, height: 'auto', display: 'block' }} role="img" aria-label="Views per day">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" strokeWidth="1" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e2e8f0" strokeWidth="1" />
      <polyline points={points} fill="none" stroke="#185D7A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x={pad} y={h - 6} fontSize="9" fill="#94a3b8">{first}</text>
      <text x={w - pad} y={h - 6} fontSize="9" fill="#94a3b8" textAnchor="end">{last}</text>
      <text x={pad - 4} y={pad + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{max}</text>
      <text x={pad - 4} y={h - pad + 3} fontSize="9" fill="#94a3b8" textAnchor="end">0</text>
    </svg>
  )
}

export function AnalyticsClient({ manufacturerId, initialData, cards }: {
  manufacturerId: string
  initialData: AnalyticsData
  cards: Card[]
}) {
  const [data, setData] = useState(initialData)
  const [days, setDays] = useState<30 | 90>(30)
  const [cardSlug, setCardSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Tagged share link form
  const [linkCardId, setLinkCardId] = useState('')
  const [linkChannel, setLinkChannel] = useState<'copy' | 'sms' | 'email'>('copy')
  const [senderTag, setSenderTag] = useState('')
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function reload(nextDays: 30 | 90, nextSlug: string) {
    setError(null)
    startTransition(async () => {
      const res = await getCardAnalytics(manufacturerId, { days: nextDays, cardSlug: nextSlug || undefined })
      if (!res.ok) { setError(res.error); return }
      setData(res.data)
    })
  }

  function makeLink() {
    setError(null); setCreatedUrl(null)
    if (!linkCardId) { setError('Pick a card for the share link.'); return }
    startTransition(async () => {
      const res = await createTaggedShareLink(manufacturerId, {
        cardId: linkCardId, channel: linkChannel, senderTag: senderTag || null,
      })
      if (!res.ok) { setError(res.error); return }
      setCreatedUrl(res.url)
    })
  }

  async function copyCreated() {
    if (!createdUrl) return
    try {
      await navigator.clipboard.writeText(createdUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* manual copy */ }
  }

  const cardName = (slug: string) => cards.find(c => c.slug === slug)?.name ?? slug

  return (
    <div>
      {error && <div className="studio-warn">{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        {[30, 90].map(d => (
          <button key={d} type="button"
            className={`studio-btn ${days === d ? 'studio-btn-primary' : 'studio-btn-ghost'}`}
            style={{ padding: '0.35rem 0.9rem', fontSize: '0.8rem' }}
            onClick={() => { setDays(d as 30 | 90); reload(d as 30 | 90, cardSlug) }}
            disabled={pending}>
            Last {d} days
          </button>
        ))}
        <select
          value={cardSlug}
          onChange={e => { setCardSlug(e.target.value); reload(days, e.target.value) }}
          disabled={pending}
          style={{ padding: '0.4rem 0.7rem', border: '1.5px solid var(--ds-border)', borderRadius: 6, fontSize: '0.83rem', background: '#fff' }}
        >
          <option value="">All cards</option>
          {cards.filter(c => c.slug).map(c => <option key={c.id} value={c.slug!}>{c.name}</option>)}
        </select>
        {pending && <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>Loading…</span>}
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Views', value: data.totals.views },
          { label: 'Devices (approx.)', value: data.totals.uniqueDevices },
          { label: 'Share links created', value: data.totals.sharesCreated },
          { label: 'Share opens', value: data.totals.shareOpens },
          { label: 'Doc clicks', value: data.totals.docClicks },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ds-navy)' }}>{s.value}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--ds-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Views per day */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Views per day</div>
        <div style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '1rem' }}>
          <LineChart series={data.viewsByDay} />
        </div>
      </div>

      {/* By card */}
      <div className="studio-section">
        <div className="studio-section-heading">By card</div>
        {data.byCard.length === 0 ? (
          <div className="studio-info">No card activity in this period yet.</div>
        ) : (
          <div className="ds-table-scroll" style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 560 }}>
              <thead><tr>
                <th style={thStyle}>Card</th>
                <th style={thStyle}>Views</th>
                <th style={thStyle}>Devices</th>
                <th style={thStyle}>Share opens</th>
                <th style={thStyle}>Doc clicks</th>
              </tr></thead>
              <tbody>
                {data.byCard.map(row => (
                  <tr key={row.cardSlug}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{cardName(row.cardSlug)}</td>
                    <td style={tdStyle}>{row.views}</td>
                    <td style={tdStyle}>{row.uniqueDevices}</td>
                    <td style={tdStyle}>{row.shareOpens}</td>
                    <td style={tdStyle}>{row.docClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shares by channel / sender */}
      <div className="studio-section">
        <div className="studio-section-heading">Shares by channel &amp; sender</div>
        {data.shares.length === 0 ? (
          <div className="studio-info">No share links created or opened in this period.</div>
        ) : (
          <div className="ds-table-scroll" style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 480 }}>
              <thead><tr>
                <th style={thStyle}>Channel</th>
                <th style={thStyle}>Sender tag</th>
                <th style={thStyle}>Links created</th>
                <th style={thStyle}>Opens</th>
              </tr></thead>
              <tbody>
                {data.shares.map((s, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{s.channel}</td>
                    <td style={tdStyle}>{s.senderTag ?? '—'}</td>
                    <td style={tdStyle}>{s.created}</td>
                    <td style={tdStyle}>{s.opens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top docs */}
      {data.topDocs.length > 0 && (
        <div className="studio-section">
          <div className="studio-section-heading">Top document click-throughs</div>
          <div className="ds-table-scroll" style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 480 }}>
              <thead><tr>
                <th style={thStyle}>Document</th>
                <th style={thStyle}>Clicks</th>
              </tr></thead>
              <tbody>
                {data.topDocs.map((d, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{d.label}</span>
                      <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--ds-text-muted)', wordBreak: 'break-all' }}>{d.url}</span>
                    </td>
                    <td style={tdStyle}>{d.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create tagged share link */}
      <div className="studio-section">
        <div className="studio-section-heading">Create a tagged share link</div>
        <div style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '1rem 1.2rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Card</label>
              <select value={linkCardId} onChange={e => setLinkCardId(e.target.value)}
                style={{ padding: '0.45rem 0.7rem', border: '1.5px solid var(--ds-border)', borderRadius: 6, fontSize: '0.83rem', background: '#fff', maxWidth: 280 }}>
                <option value="">Choose a card…</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Channel</label>
              <select value={linkChannel} onChange={e => setLinkChannel(e.target.value as 'copy' | 'sms' | 'email')}
                style={{ padding: '0.45rem 0.7rem', border: '1.5px solid var(--ds-border)', borderRadius: 6, fontSize: '0.83rem', background: '#fff' }}>
                <option value="copy">Copy / link</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Sender tag (optional)</label>
              <input value={senderTag} onChange={e => setSenderTag(e.target.value)} placeholder="e.g. Dave — Perth rep"
                style={{ padding: '0.45rem 0.7rem', border: '1.5px solid var(--ds-border)', borderRadius: 6, fontSize: '0.83rem', background: '#fff' }} />
            </div>
            <button type="button" className="studio-btn studio-btn-primary" onClick={makeLink} disabled={pending}>
              Create link
            </button>
          </div>
          {createdUrl && (
            <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '0.8rem', background: 'var(--ds-page-bg)', padding: '0.35rem 0.6rem', borderRadius: 6 }}>{createdUrl}</code>
              <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.78rem' }} onClick={copyCreated}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          )}
          <p style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint)', margin: '0.75rem 0 0', lineHeight: 1.6 }}>
            Tagged links let you see which rep or campaign a share came from. Every open of a
            tagged link is recorded under its sender tag above.
          </p>
        </div>
      </div>
    </div>
  )
}
