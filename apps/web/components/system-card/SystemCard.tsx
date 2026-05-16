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
  notes: string | null
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

function LineItemTable({ rows }: {
  rows: {
    productName: string
    shortDesc: string
    specs: string
    skuMpn: string
    uom: string
  }[]
}) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 480 }}>
        <thead>
          <tr>
            {(['Product name', 'Short description', 'Specs', 'SKU', 'UOM'] as const).map(h => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--ds-border-soft)', background: i % 2 ? 'var(--ds-page-bg)' : undefined }}>
              <td style={{ ...TD_STYLE, color: 'var(--ds-text)', fontWeight: 500 }}>{r.productName}</td>
              <td style={{ ...TD_STYLE, color: 'var(--ds-text-muted)', maxWidth: 220 }}>{r.shortDesc}</td>
              <td style={{ ...TD_STYLE, color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>{r.specs}</td>
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
        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--ds-text-faint)',
        marginBottom: '0.75rem', paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--ds-border-soft)',
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
      {balRating && (
        <div style={{ position: 'absolute', top: '0.875rem', right: '0.875rem', background: '#f97316', color: '#fff', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', padding: '0.25rem 0.6rem', borderRadius: 99 }}>
          {balRating}
        </div>
      )}
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

function AttributeBadges({ balRating, fireRating, moistureResistant, acousticRating, structuralGrade, notes }: {
  balRating: string | null
  fireRating: string | null
  moistureResistant: boolean | null
  acousticRating: string | null
  structuralGrade: string | null
  notes: string | null
}) {
  const badges: { label: string; bg: string; color: string }[] = []

  if (balRating)         badges.push({ label: balRating,              bg: '#fff7ed', color: '#c2410c' })
  if (fireRating)        badges.push({ label: `FRL ${fireRating}`,    bg: '#fef2f2', color: '#b91c1c' })
  if (moistureResistant) badges.push({ label: 'Moisture resistant',   bg: '#f0f9ff', color: '#0369a1' })
  if (acousticRating)    badges.push({ label: acousticRating,         bg: '#faf5ff', color: '#7e22ce' })
  if (structuralGrade)   badges.push({ label: structuralGrade,        bg: '#f0fdf4', color: '#15803d' })
  if (notes?.toLowerCase().includes('primed') || notes?.toLowerCase().includes('site paint'))
    badges.push({ label: 'Pre-primed / site painted', bg: '#f8fafc', color: '#475569' })

  if (badges.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
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
  )
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

function ProfilesSection({ profiles }: { profiles: SystemProfile[] }) {
  if (profiles.length === 0) return null

  const rows = profiles.map(p => ({
    productName: p.profile_name || p.product_code || '—',
    shortDesc:   truncate(p.dimensions),
    specs:       fmtSpec(p.length_mm ?? p.height_mm, p.width_mm, p.thickness_mm),
    skuMpn:      p.product_code && p.product_code !== p.profile_name ? p.product_code : '—',
    uom:         fmtUom(p.uom),
  }))

  return (
    <Section title={`Profiles · ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}`}>
      <LineItemTable rows={rows} />
    </Section>
  )
}

// ─── Components / Accessories ─────────────────────────────────────────────────

function ComponentsSection({ components }: { components: SystemComponent[] }) {
  const [open, setOpen] = useState(false)
  if (components.length === 0) return null

  const rows = components.map(c => ({
    productName: c.name,
    shortDesc:   truncate(c.description),
    specs:       '—',
    skuMpn:      c.sku ?? '—',
    uom:         fmtUom(c.uom),
  }))

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', borderBottom: '1px solid var(--ds-border-soft)',
          padding: '0 0 0.5rem', cursor: 'pointer', marginBottom: open ? '0.75rem' : 0,
        }}
      >
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ds-text-faint)' }}>
          {`Accessories & components · ${components.length}`}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <LineItemTable rows={rows} />}
    </div>
  )
}

// ─── Colours ─────────────────────────────────────────────────────────────────

function ColoursSection({ colours, notes }: { colours: SystemColour[]; notes: string | null }) {
  return (
    <Section title="Colours & finishes">
      {colours.length === 0 ? (
        <p style={{ fontSize: '0.83rem', color: 'var(--ds-text-muted)', margin: 0 }}>
          {notes?.toLowerCase().includes('primed') || notes?.toLowerCase().includes('painted')
            ? 'Pre-primed — site painted. No stocked colour options.'
            : 'No colour options listed for this system.'}
        </p>
      ) : (
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
      )}
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
        <AttributeBadges
          balRating={data.bal_rating}
          fireRating={data.fire_rating}
          moistureResistant={data.moisture_resistant}
          acousticRating={data.acoustic_rating}
          structuralGrade={data.structural_grade}
          notes={data.notes}
        />

        {data.description && (
          <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-sub)', lineHeight: 1.6, margin: 0 }}>
            {data.description}
          </p>
        )}

        <ProfilesSection profiles={data.profiles} />
        <ComponentsSection components={data.components} />
        <ColoursSection colours={data.colours} notes={data.notes} />

        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--ds-border-soft)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="#" className="studio-btn studio-btn-primary" style={{ fontSize: '0.875rem' }} onClick={(e: MouseEvent) => e.preventDefault()}>
            Add to RFQ
          </a>
          <a href="#" className="studio-btn studio-btn-ghost" style={{ fontSize: '0.875rem' }} onClick={(e: MouseEvent) => e.preventDefault()}>
            View technical data
          </a>
        </div>
      </div>
    </div>
  )
}
