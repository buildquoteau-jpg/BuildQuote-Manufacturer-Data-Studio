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
  // System
  name: string
  manufacturer_name: string
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  bal_rating: string | null
  notes: string | null
  // Related
  profiles: SystemProfile[]
  components: SystemComponent[]
  colours: SystemColour[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDim(mm: number | null): string {
  if (mm == null) return '—'
  return mm >= 1000 ? `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')}m` : `${mm}mm`
}

function fmtUom(uom: string | null): string {
  if (!uom) return '—'
  const map: Record<string, string> = {
    sheet: 'Sheet', roll: 'Roll', ea: 'Each', lm: 'Lin. m',
    m2: 'm²', kg: 'kg', box: 'Box', pack: 'Pack', length: 'Length',
  }
  return map[uom] ?? uom
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ds-text-faint)',
        marginBottom: '0.75rem',
        paddingBottom: '0.5rem',
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
    <div className="sc-hero" style={{
      borderRadius: '10px 10px 0 0',
      background: imageUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)',
    }}>
      {imageUrl && (
        <img src={imageUrl} alt={name} />
      )}

      {/* Gradient overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to top, rgba(15,30,45,0.85) 0%, rgba(15,30,45,0.2) 60%, transparent 100%)',
      }} />

      {/* BAL badge — top right */}
      {balRating && (
        <div style={{
          position: 'absolute',
          top: '0.875rem',
          right: '0.875rem',
          background: '#f97316',
          color: '#fff',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '0.25rem 0.6rem',
          borderRadius: 99,
        }}>
          {balRating}
        </div>
      )}

      {/* Text overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '1rem 1.25rem 1.1rem',
      }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.65)',
          marginBottom: '0.3rem',
        }}>
          {manufacturerName}
        </div>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#fff',
          margin: 0,
          lineHeight: 1.2,
          letterSpacing: '-0.01em',
        }}>
          {name}
        </h2>
        {(category || subcategory) && (
          <div style={{
            marginTop: '0.35rem',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.7)',
          }}>
            {[category, subcategory].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Profiles table ───────────────────────────────────────────────────────────

function ProfilesSection({ profiles }: { profiles: SystemProfile[] }) {
  if (profiles.length === 0) return null

  return (
    <Section title={`Profiles · ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}`}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="sc-profiles-table">
          <thead>
            <tr style={{ background: 'var(--ds-page-bg)' }}>
              {(['Code', 'Description', 'L', 'W', 'T', 'UOM'] as const).map((h) => (
                <th key={h} style={{
                  padding: '0.45rem 0.65rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--ds-text-sub)',
                  fontSize: '0.75rem',
                  borderBottom: '1px solid var(--ds-border)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p, i) => {
              const hasName = p.profile_name && p.profile_name !== p.product_code
              return (
              <tr key={i} style={{
                borderBottom: '1px solid var(--ds-border-soft)',
                background: i % 2 === 0 ? undefined : 'var(--ds-page-bg)',
              }}>
                <td style={{ padding: '0.45rem 0.65rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>
                  {p.product_code ?? '—'}
                </td>
                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--ds-text)', maxWidth: 260 }}>
                  {hasName ? p.profile_name : (p.dimensions ?? '—')}
                </td>
                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>
                  {hasName ? fmtDim(p.length_mm ?? p.height_mm) : '—'}
                </td>
                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>
                  {hasName ? fmtDim(p.width_mm) : '—'}
                </td>
                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>
                  {hasName ? fmtDim(p.thickness_mm) : '—'}
                </td>
                <td style={{ padding: '0.45rem 0.65rem', color: 'var(--ds-text-sub)', whiteSpace: 'nowrap' }}>
                  {fmtUom(p.uom)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ─── Accessories ──────────────────────────────────────────────────────────────

function ComponentsSection({ components }: { components: SystemComponent[] }) {
  const [open, setOpen] = useState(false)
  if (components.length === 0) return null

  return (
    <div style={{ marginTop: '1.75rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          borderBottom: '1px solid var(--ds-border-soft)',
          padding: '0 0 0.5rem',
          cursor: 'pointer',
          marginBottom: open ? '0.75rem' : 0,
        }}
      >
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ds-text-faint)',
        }}>
          {`Accessories & components · ${components.length}`}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {components.map((c, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            padding: '0.6rem 0.75rem',
            background: 'var(--ds-page-bg)',
            borderRadius: 6,
            border: '1px solid var(--ds-border-soft)',
          }}>
            {c.sku && (
              <span style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: 'var(--ds-text-faint)',
                whiteSpace: 'nowrap',
                paddingTop: '0.1rem',
                minWidth: 56,
              }}>
                {c.sku}
              </span>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ds-text)' }}>
                {c.name}
              </div>
              {c.description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', marginTop: '0.15rem' }}>
                  {c.description}
                </div>
              )}
            </div>
            {c.uom && (
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--ds-text-faint)',
                whiteSpace: 'nowrap',
                textAlign: 'right',
              }}>
                {fmtUom(c.uom)}
              </div>
            )}
          </div>
        ))}
      </div>
      )}
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
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.7rem',
              background: 'var(--ds-page-bg)',
              border: '1px solid var(--ds-border)',
              borderRadius: 99,
              fontSize: '0.82rem',
              color: 'var(--ds-text-sub)',
            }}>
              <span>{c.colour_name}</span>
              {c.sku_suffix && (
                <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)', fontFamily: 'monospace' }}>
                  {c.sku_suffix}
                </span>
              )}
              {c.is_stocked === false && (
                <span style={{ fontSize: '0.68rem', color: 'var(--ds-text-faint)' }}>EOI</span>
              )}
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
        {data.description && (
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--ds-text-sub)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            {data.description}
          </p>
        )}

        <ProfilesSection profiles={data.profiles} />
        <ComponentsSection components={data.components} />
        <ColoursSection colours={data.colours} notes={data.notes} />

        {/* CTA */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--ds-border-soft)',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <a
            href="#"
            className="studio-btn studio-btn-primary"
            style={{ fontSize: '0.875rem' }}
            onClick={(e: MouseEvent) => e.preventDefault()}
          >
            Add to RFQ
          </a>
          <a
            href="#"
            className="studio-btn studio-btn-ghost"
            style={{ fontSize: '0.875rem' }}
            onClick={(e: MouseEvent) => e.preventDefault()}
          >
            View technical data
          </a>
        </div>
      </div>
    </div>
  )
}
