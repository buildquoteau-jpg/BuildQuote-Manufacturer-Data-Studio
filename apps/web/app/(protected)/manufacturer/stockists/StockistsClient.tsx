'use client'

// Stockist table + add/edit form + per-card link picker + confirmation-link
// tools. All mutations go through stockist-actions server actions; local state
// is refreshed optimistically after each successful call.

import { useMemo, useState, useTransition } from 'react'
import {
  createStockist,
  deleteStockist,
  listStockists,
  setStockistCards,
  updateStockist,
} from '@/lib/studio-manufacturer/stockist-actions'
import { AU_STATES, type StockistInput, type StockistRecord } from '@/lib/studio-manufacturer/stockist-types'
import { StockistCsvTools } from './StockistCsvTools'

type Card = { id: string; name: string }

const EMPTY_FORM: StockistInput = {
  businessName: '',
  suburb: '',
  state: '',
  phone: '',
  websiteUrl: '',
  tradeDeskEmail: '',
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.5rem 0.7rem', border: '1.5px solid var(--ds-border)',
  borderRadius: 6, fontSize: '0.85rem', background: '#fff', color: 'var(--ds-text)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--ds-text-sub)', textTransform: 'uppercase', letterSpacing: '0.03em',
  marginBottom: '0.25rem',
}

function toForm(s: StockistRecord): StockistInput {
  return {
    businessName: s.business_name,
    suburb: s.suburb ?? '',
    state: s.state ?? '',
    phone: s.phone ?? '',
    websiteUrl: s.website_url ?? '',
    tradeDeskEmail: s.trade_desk_email ?? '',
  }
}

export function StockistsClient({ manufacturerId, initialStockists, cards, origin }: {
  manufacturerId: string
  initialStockists: StockistRecord[]
  cards: Card[]
  origin: string
}) {
  const [stockists, setStockists] = useState(initialStockists)
  const [form, setForm] = useState<StockistInput>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [cardsForId, setCardsForId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const cardNameById = useMemo(() => new Map(cards.map(c => [c.id, c.name])), [cards])

  async function refresh() {
    const res = await listStockists(manufacturerId)
    if (res.ok) setStockists(res.stockists)
  }

  function set<K extends keyof StockistInput>(key: K, value: StockistInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function startAdd() {
    setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setError(null)
  }
  function startEdit(s: StockistRecord) {
    setForm(toForm(s)); setEditingId(s.id); setShowForm(true); setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = editingId
        ? await updateStockist(manufacturerId, editingId, form)
        : await createStockist(manufacturerId, form)
      if (!res.ok) { setError(res.error); return }
      setShowForm(false); setEditingId(null); setForm(EMPTY_FORM)
      await refresh()
    })
  }

  function handleDelete(id: string) {
    setError(null)
    startTransition(async () => {
      const res = await deleteStockist(manufacturerId, id)
      if (!res.ok) { setError(res.error); return }
      setConfirmDeleteId(null)
      await refresh()
    })
  }

  function confirmLink(s: StockistRecord) {
    return `${origin}/stockist-confirm/${s.confirm_token}`
  }

  async function copyConfirmLink(s: StockistRecord) {
    try {
      await navigator.clipboard.writeText(confirmLink(s))
      setCopiedId(s.id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch {
      // Clipboard unavailable — the mailto path still works.
    }
  }

  function mailtoHref(s: StockistRecord) {
    const subject = encodeURIComponent('Please confirm you can supply our products')
    const body = encodeURIComponent(
      `Hi ${s.business_name},\n\n` +
      `We list you as a local stockist on our BuildQuote System Cards. ` +
      `Could you confirm you stock / can supply our systems? One click, no login:\n\n` +
      `${confirmLink(s)}\n\nThanks!`,
    )
    return `mailto:${s.trade_desk_email ?? ''}?subject=${subject}&body=${body}`
  }

  return (
    <div>
      {error && <div className="studio-warn">{error}</div>}

      {/* Add button / form */}
      {!showForm ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button type="button" className="studio-btn studio-btn-primary" onClick={startAdd}>
            + Add stockist
          </button>
          <span style={{ color: 'var(--ds-text-faint)', fontSize: '0.8rem' }}>or bulk import:</span>
          <StockistCsvTools manufacturerId={manufacturerId} onImported={refresh} />
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10, padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--ds-navy)', fontSize: '0.95rem', marginBottom: '0.85rem' }}>
            {editingId ? 'Edit stockist' : 'Add stockist'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
            <div>
              <label style={labelStyle}>Business name *</label>
              <input style={inputStyle} value={form.businessName} onChange={e => set('businessName', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Suburb / town</label>
              <input style={inputStyle} value={form.suburb ?? ''} onChange={e => set('suburb', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <select style={inputStyle} value={form.state ?? ''} onChange={e => set('state', e.target.value)}>
                <option value="">—</option>
                {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input style={inputStyle} placeholder="https://…" value={form.websiteUrl ?? ''} onChange={e => set('websiteUrl', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Trade-desk email (optional)</label>
              <input style={inputStyle} placeholder="trade@stockist.com.au" value={form.tradeDeskEmail ?? ''} onChange={e => set('tradeDeskEmail', e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
            <button type="button" className="studio-btn studio-btn-primary" onClick={handleSubmit} disabled={pending}>
              {pending ? 'Saving…' : editingId ? 'Save changes' : 'Add stockist'}
            </button>
            <button type="button" className="studio-btn studio-btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {stockists.length === 0 ? (
        <div className="studio-info">
          No stockists yet. Add your first stockist above — they appear in the
          &ldquo;Local stockists&rdquo; section of every System Card.
        </div>
      ) : (
        <div className="ds-table-scroll" style={{ background: '#fff', border: '1px solid var(--ds-border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ds-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <th style={{ padding: '0.6rem 0.8rem' }}>Business</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Location</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Contact</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Cards</th>
                <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                <th style={{ padding: '0.6rem 0.8rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {stockists.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--ds-border-soft)', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>
                    {s.business_name}
                    {s.website_url && (
                      <a href={s.website_url.startsWith('http') ? s.website_url : `https://${s.website_url}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'block', fontWeight: 400, fontSize: '0.76rem' }}>
                        {s.website_url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem' }}>
                    {[s.suburb, s.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem' }}>
                    {s.phone && <div>{s.phone}</div>}
                    {s.trade_desk_email && <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>{s.trade_desk_email}</div>}
                    {!s.phone && !s.trade_desk_email && '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem' }}>
                    <button
                      type="button"
                      onClick={() => setCardsForId(cardsForId === s.id ? null : s.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ds-navy)', fontSize: 'inherit', textDecoration: 'underline' }}
                    >
                      {s.all_cards ? 'All cards' : `${s.card_ids.length} selected`}
                    </button>
                    {cardsForId === s.id && (
                      <CardPicker
                        stockist={s}
                        cards={cards}
                        pending={pending}
                        onSave={(allCards, cardIds) => {
                          startTransition(async () => {
                            const res = await setStockistCards(manufacturerId, s.id, { allCards, cardIds })
                            if (!res.ok) { setError(res.error); return }
                            setCardsForId(null)
                            await refresh()
                          })
                        }}
                        onCancel={() => setCardsForId(null)}
                      />
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap' }}>
                    {s.confirm_status === 'confirmed' && s.confirmed_at ? (
                      <span className="studio-badge studio-badge-approved" title="Confirmed via the emailed link">
                        Confirmed {new Date(s.confirmed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    ) : (
                      <span className="studio-badge studio-badge-draft">Unconfirmed</span>
                    )}
                  </td>
                  <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }}
                        onClick={() => copyConfirmLink(s)} title="Copy the no-login confirmation link to email to this stockist">
                        {copiedId === s.id ? 'Copied ✓' : 'Copy confirm link'}
                      </button>
                      {s.trade_desk_email && (
                        <a className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }}
                          href={mailtoHref(s)} title="Email the confirmation link">
                          Email
                        </a>
                      )}
                      <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }}
                        onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      {confirmDeleteId === s.id ? (
                        <button type="button" className="studio-btn" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem', background: '#dc2626', color: '#fff' }}
                          onClick={() => handleDelete(s.id)} disabled={pending}>
                          Really delete?
                        </button>
                      ) : (
                        <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem', color: '#dc2626' }}
                          onClick={() => setConfirmDeleteId(s.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '0.9rem', maxWidth: 640, lineHeight: 1.6 }}>
        <strong>Confirmation links</strong> let a stockist confirm — with one click and no
        login — that they stock or can supply your systems. Confirmed stockists show a
        &ldquo;Confirmed&rdquo; tag on your cards. Cards fetch the latest stockist list
        whenever they are viewed online, so changes here reach cards that are already out
        in the world.
      </p>
    </div>
  )
}

// ── Per-card override picker ──────────────────────────────────────────────────

function CardPicker({ stockist, cards, pending, onSave, onCancel }: {
  stockist: StockistRecord
  cards: Card[]
  pending: boolean
  onSave: (allCards: boolean, cardIds: string[]) => void
  onCancel: () => void
}) {
  const [allCards, setAllCards] = useState(stockist.all_cards)
  const [selected, setSelected] = useState<Set<string>>(new Set(stockist.card_ids))

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ marginTop: '0.5rem', background: 'var(--ds-page-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, padding: '0.7rem 0.8rem', maxWidth: 340 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        <input type="checkbox" checked={allCards} onChange={e => setAllCards(e.target.checked)} />
        Show on all cards
      </label>
      {!allCards && (
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
          {cards.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>No cards found.</span>
          )}
          {cards.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.79rem' }}>
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="studio-btn studio-btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.76rem' }}
          onClick={() => onSave(allCards, Array.from(selected))} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="studio-btn studio-btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.76rem' }}
          onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  )
}
