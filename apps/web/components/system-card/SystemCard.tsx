'use client'

import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

// ─── Data types ───────────────────────────────────────────────────────────────

export interface SystemProfile {
  product_code: string | null
  profile_name: string
  dimensions: string | null
  length_mm: number | null
  height_mm: number | null
  width_mm: number | null
  thickness_mm: number | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
}

export interface SystemComponent {
  sku: string | null
  name: string
  description: string | null
  category: string | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
}

export interface SystemColour {
  colour_name: string
  sku_suffix: string | null
  is_stocked: boolean | null
}

export interface SystemCardData {
  name: string
  manufacturer_name: string
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  bal_rating: string | null
  fire_rating: string | null
  moisture_resistant: boolean | null
  acoustic_rating: string | null
  structural_grade: string | null
  australian_made: boolean | null
  notes: string | null
  source_url: string | null
  profiles: SystemProfile[]
  components: SystemComponent[]
  colours: SystemColour[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUom(uom: string | null): string {
  if (!uom) return '—'
  const map: Record<string, string> = {
    sheet: 'Sheet', roll: 'Roll', ea: 'Each', each: 'Each', lm: 'Lin. m',
    m2: 'm²', kg: 'kg', box: 'Box', pack: 'Pack', length: 'Length', set: 'Set',
  }
  return map[uom.toLowerCase()] ?? uom
}

function fmtMm(v: number | null): string | null {
  if (v == null) return null
  return `${parseFloat(v.toFixed(1))}mm`
}

function fmtSpec(l: number | null, w: number | null, t: number | null): string {
  const parts = [l, w, t].map(fmtMm).filter((s): s is string => s !== null)
  return parts.length ? parts.join(' × ') : '—'
}

function truncate(s: string | null, max = 90): string {
  if (!s) return '—'
  const trimmed = s.trim()
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() + '…' : trimmed
}

// ─── Shared table ─────────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--ds-text-sub)',
  fontSize: '0.72rem',
  borderBottom: '1px solid var(--ds-border)',
  whiteSpace: 'nowrap',
  background: 'var(--ds-page-bg)',
}

const TD_STYLE: React.CSSProperties = {
  padding: '0.45rem 0.6rem',
  fontSize: '0.8rem',
  verticalAlign: 'top',
}

function LineItemTable({ rows, showDesc = true, showSpecs = true }: {
  rows: {
    productName: string
    shortDesc: string
    specs: string
    skuMpn: string
    uom: string
  }[]
  showDesc?: boolean
  showSpecs?: boolean
}) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 480 }}>
        <thead>
          <tr>
            <th style={TH_STYLE}>Product name</th>
            {showDesc  && <th style={TH_STYLE}>Short description</th>}
            {showSpecs && <th style={TH_STYLE}>Specs</th>}
            <th style={TH_STYLE}>SKU</th>
            <th style={TH_STYLE}>UOM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--ds-border-soft)', background: i % 2 ? 'var(--ds-page-bg)' : undefined }}>
              <td style={{ ...TD_STYLE, color: 'var(--ds-text)', fontWeight: 500 }}>{r.productName}</td>
              {showDesc  && <td style={{ ...TD_STYLE, color: 'var(--ds-text-muted)', maxWidth: 220 }}>{r.shortDesc}</td>}
              {showSpecs && <td style={{ ...TD_STYLE, color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>{r.specs}</td>}
              <td style={{ ...TD_STYLE, color: 'var(--ds-text-faint)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.skuMpn}</td>
              <td style={{ ...TD_STYLE, color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>{r.uom}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#334155',
        marginBottom: '0.85rem', paddingBottom: '0.5rem',
        borderBottom: '2px solid #e2e8f0',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroArea({ imageUrl, manufacturerName, name, category, subcategory, balRating }: {
  imageUrl: string | null
  manufacturerName: string
  name: string
  category: string | null
  subcategory: string | null
  balRating: string | null
}) {
  return (
    <div className="sc-hero" style={{ borderRadius: '10px 10px 0 0', background: imageUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)' }}>
      {imageUrl && <img src={imageUrl} alt={name} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,30,45,0.85) 0%, rgba(15,30,45,0.2) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1rem 1.25rem 1.1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: '0.3rem' }}>
          {manufacturerName}
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
          {name}
        </h2>
        {(category || subcategory) && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
            {[category, subcategory].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── System attribute badges ──────────────────────────────────────────────────

function AttributePills({ systemName, balRating, fireRating, moistureResistant, acousticRating, structuralGrade, australianMade, notes }: {
  systemName: string
  balRating: string | null
  fireRating: string | null
  moistureResistant: boolean | null
  acousticRating: string | null
  structuralGrade: string | null
  australianMade: boolean | null
  notes: string | null
}) {
  const badges: { label: string; bg: string; color: string }[] = []

  if (balRating)         badges.push({ label: balRating,              bg: '#fff7ed', color: '#c2410c' })
  if (fireRating)        badges.push({ label: `FRL ${fireRating}`,    bg: '#fef2f2', color: '#b91c1c' })
  if (moistureResistant) badges.push({ label: 'Moisture resistant',   bg: '#f0f9ff', color: '#0369a1' })
  if (acousticRating)    badges.push({ label: acousticRating,         bg: '#faf5ff', color: '#7e22ce' })
  if (structuralGrade)   badges.push({ label: structuralGrade,        bg: '#f0fdf4', color: '#15803d' })
  if (australianMade)    badges.push({ label: 'Australian made',      bg: '#f0fdf4', color: '#166534' })
  if (notes?.toLowerCase().includes('primed') || notes?.toLowerCase().includes('site paint'))
    badges.push({ label: 'Pre-primed / site painted',                 bg: '#f8fafc', color: '#475569' })

  if (badges.length === 0) return null
  return (
    <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--ds-border-soft)' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text)', marginBottom: '0.6rem' }}>
        {systemName}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {badges.map((b, i) => (
          <span key={i} style={{
            display: 'inline-block',
            padding: '0.2rem 0.6rem',
            borderRadius: 99,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            background: b.bg,
            color: b.color,
            border: `1px solid ${b.color}33`,
          }}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

interface ProfileGroupItem { sizeLabel: string; profile: SystemProfile }
interface ProfileGroup     { key: string; items: ProfileGroupItem[] }

function computeProfileGroups(profiles: SystemProfile[]): ProfileGroup[] {
  // Strategy 1: " — " separator  e.g. "50 — 2200mm" → key "50", label "2200mm"
  if (profiles.some(p => p.profile_name.includes(' — '))) {
    const map = new Map<string, ProfileGroupItem[]>()
    for (const p of profiles) {
      const sep = p.profile_name.indexOf(' — ')
      const key       = sep !== -1 ? p.profile_name.slice(0, sep) : ''
      const sizeLabel = sep !== -1 ? p.profile_name.slice(sep + 3) : p.profile_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ sizeLabel, profile: p })
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }

  // Strategy 2: common word-prefix  e.g. "9mm Square Edge 3000 x 1200"
  // Find the longest prefix (by word count) where ≥2 profiles share it.
  const tokenized = profiles.map(p => p.profile_name.trim().split(/\s+/))
  const maxLen    = Math.max(...tokenized.map(t => t.length))
  let bestPrefix  = 0
  for (let n = 1; n < maxLen; n++) {
    const counts = new Map<string, number>()
    for (const tokens of tokenized) {
      const k = tokens.slice(0, n).join(' ')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    if (Array.from(counts.values()).some(c => c > 1)) bestPrefix = n
  }

  if (bestPrefix > 0) {
    const map = new Map<string, ProfileGroupItem[]>()
    for (let i = 0; i < profiles.length; i++) {
      const tokens    = tokenized[i]
      const key       = tokens.slice(0, bestPrefix).join(' ')
      const sizeLabel = tokens.slice(bestPrefix).join(' ') || tokens.join(' ')
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ sizeLabel, profile: profiles[i] })
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }

  // Strategy 3: no grouping — all under one unnamed group  e.g. "3000mm", "4200mm"
  return [{ key: '', items: profiles.map(p => ({ sizeLabel: p.profile_name, profile: p })) }]
}

function ProfilesSection({ profiles, systemName }: { profiles: SystemProfile[]; systemName: string }) {
  if (profiles.length === 0) return null

  const systemLower = systemName.toLowerCase()
  const groups      = computeProfileGroups(profiles)

  function headerLabel(key: string): string {
    if (!key) return systemName
    if (key.toLowerCase().startsWith(systemLower)) return key
    const suffix = /^\d+(\.\d+)?$/.test(key) ? `${key}mm` : key
    return `${systemName} ${suffix}`
  }

  return (
    <Section title={`Profiles · ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {groups.map(({ key, items }) => (
          <div key={key || '__all__'}>
            <div style={{
              fontSize: '0.88rem', fontWeight: 700, color: '#0f172a',
              marginBottom: '0.55rem',
              paddingLeft: '0.6rem',
              borderLeft: '3px solid #185D7A',
            }}>
              {headerLabel(key)}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.5rem',
            }}>
              {items.map(({ sizeLabel, profile: p }, i) => {
                const sku   = p.product_code && p.product_code !== p.profile_name ? p.product_code : null
                const specs = fmtSpec(p.length_mm ?? p.height_mm, p.width_mm, p.thickness_mm)
                return (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column', gap: '0.15rem',
                    padding: '0.55rem 0.7rem',
                    background: '#0f2d3d',
                    borderRadius: '8px',
                  }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>{sizeLabel}</span>
                    {specs !== '—' && <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>{specs}</span>}
                    {sku && <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)' }}>{sku}</span>}
                    <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fmtUom(p.uom)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─── Components / Accessories ─────────────────────────────────────────────────

function ComponentsSection({ components }: { components: SystemComponent[] }) {
  const [open, setOpen] = useState(false)
  if (components.length === 0) return null

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: open ? '#f1f5f9' : '#f8fafc',
          border: '2px solid #e2e8f0',
          borderRadius: open ? '8px 8px 0 0' : '8px',
          padding: '0.6rem 0.85rem',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155' }}>
          {`Accessories & components · ${components.length}`}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#185D7A' }}>{open ? '▲ Hide' : '▼ Show'}</span>
      </button>
      {open && (
        <div style={{ border: '2px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '0 0.85rem' }}>
          {components.map((c, i) => (
            <div key={i} style={{
              padding: '0.65rem 0',
              borderBottom: '1px solid #f1f5f9',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{c.name}</span>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexShrink: 0 }}>
                  {c.sku && <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b' }}>{c.sku}</span>}
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{fmtUom(c.uom)}</span>
                </div>
              </div>
              {c.description && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.55 }}>{c.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Colours ─────────────────────────────────────────────────────────────────

function ColoursSection({ colours }: { colours: SystemColour[] }) {
  if (colours.length === 0) return null
  return (
    <Section title="Colours & finishes">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {colours.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.7rem', background: 'var(--ds-page-bg)',
            border: '1px solid var(--ds-border)', borderRadius: 99,
            fontSize: '0.82rem', color: 'var(--ds-text-sub)',
          }}>
            <span>{c.colour_name}</span>
            {c.sku_suffix && <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)', fontFamily: 'monospace' }}>{c.sku_suffix}</span>}
            {c.is_stocked === false && <span style={{ fontSize: '0.68rem', color: 'var(--ds-text-faint)' }}>EOI</span>}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function SystemCard({ data }: { data: SystemCardData }) {
  return (
    <div className="sc-card">
      <HeroArea
        imageUrl={data.hero_image_url}
        manufacturerName={data.manufacturer_name}
        name={data.name}
        category={data.category}
        subcategory={data.subcategory}
        balRating={data.bal_rating}
      />

      <div className="sc-body">
        {data.description && (
          <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-sub)', lineHeight: 1.6, margin: 0 }}>
            {data.description}
          </p>
        )}

        <ColoursSection colours={data.colours} />
        <ProfilesSection profiles={data.profiles} systemName={data.name} />
        <ComponentsSection components={data.components} />

        <AttributePills
          systemName={data.name}
          balRating={data.bal_rating}
          fireRating={data.fire_rating}
          moistureResistant={data.moisture_resistant}
          acousticRating={data.acoustic_rating}
          structuralGrade={data.structural_grade}
          australianMade={data.australian_made}
          notes={data.notes}
        />

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="#" className="studio-btn studio-btn-primary" style={{ fontSize: '0.875rem' }} onClick={(e: MouseEvent) => e.preventDefault()}>
            Add selected items to a Request for Quotation
          </a>
          {data.source_url ? (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="studio-btn studio-btn-ghost"
              style={{ fontSize: '0.875rem' }}
            >
              View {data.name} at {data.manufacturer_name}
            </a>
          ) : (
            <span
              className="studio-btn studio-btn-ghost"
              style={{ fontSize: '0.875rem', opacity: 0.4, cursor: 'not-allowed' }}
            >
              View {data.name} at {data.manufacturer_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
