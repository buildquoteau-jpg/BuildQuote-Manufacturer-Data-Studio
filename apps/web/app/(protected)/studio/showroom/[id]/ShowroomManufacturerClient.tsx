'use client'

import { useState } from 'react'
import type { ShowroomManufacturer, ShowroomSystem } from './page'

// ── Category colours (matches mfp.buildquote.com.au) ─────────────────────────

const CATEGORY_COLOURS: Record<string, { bg: string; color: string }> = {
  'Cladding':                      { bg: '#dbeafe', color: '#1e40af' },
  'Flooring':                      { bg: '#d1fae5', color: '#065f46' },
  'Decking':                       { bg: '#d1fae5', color: '#065f46' },
  'Waterproofing':                 { bg: '#e0f2fe', color: '#0369a1' },
  'Interior Linings':              { bg: '#ede9fe', color: '#5b21b6' },
  'Soffit & Eaves':                { bg: '#fce7f3', color: '#9d174d' },
  'Pergolas & Outdoor Structures': { bg: '#fef3c7', color: '#92400e' },
  'Roofing':                       { bg: '#fee2e2', color: '#991b1b' },
  'Wall System':                   { bg: '#f3f4f6', color: '#374151' },
  'Weatherboard':                  { bg: '#fff7ed', color: '#9a3412' },
}

// ── Dimension formatter ───────────────────────────────────────────────────────

function fmtDims(p: ShowroomSystem['staged_system_profiles'][0]): string {
  const parts: string[] = []
  if (p.length_mm) parts.push(`${p.length_mm}mm`)
  if (p.width_mm)  parts.push(`${p.width_mm}mm`)
  if (p.height_mm && !p.length_mm) parts.push(`${p.height_mm}mm`)
  if (p.thickness_mm) parts.push(`${p.thickness_mm}mm`)
  return parts.join(' × ') || p.dimensions || ''
}

function fmtUom(uom: string | null): string {
  if (!uom) return ''
  const map: Record<string, string> = {
    sheet: 'SHEET', roll: 'ROLL', ea: 'EACH', each: 'EACH',
    lm: 'LIN.M', m2: 'M²', kg: 'KG', box: 'BOX', pack: 'PACK', length: 'LENGTH',
  }
  return map[uom.toLowerCase()] ?? uom.toUpperCase()
}

// ── Manufacturer Hero ─────────────────────────────────────────────────────────

function ManufacturerHero({ manufacturer }: { manufacturer: ShowroomManufacturer }) {
  const [logoError, setLogoError] = useState(false)

  const bgStyle = manufacturer.hero_image_url
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${manufacturer.hero_image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: `center ${manufacturer.hero_image_position_y ?? 50}%`,
      }
    : { background: 'linear-gradient(135deg, #1b3a2d 0%, #2d5a42 60%, #1b3a2d 100%)' }

  const showLogo = manufacturer.logo_url && !logoError

  return (
    <div style={{ ...bgStyle, padding: '56px 32px 52px', textAlign: 'center', marginBottom: '28px' }}>
      {showLogo && (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.93)', borderRadius: '10px', padding: '8px 18px', marginBottom: '20px' }}>
          <img src={manufacturer.logo_url!} alt={manufacturer.name} onError={() => setLogoError(true)} style={{ height: '38px', objectFit: 'contain', display: 'block' }} />
        </div>
      )}
      <div style={{ fontSize: showLogo ? '22px' : '34px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', marginBottom: '10px', textShadow: '0 2px 12px rgba(0,0,0,0.4)', lineHeight: 1.1 }}>
        {manufacturer.name}
      </div>
      {manufacturer.description && (
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', lineHeight: 1.65, maxWidth: '580px', margin: '0 auto 24px', textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}>
          {manufacturer.description}
        </p>
      )}
      {manufacturer.website_url && (
        <a href={manufacturer.website_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.45)', borderRadius: '8px', color: '#ffffff', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          Visit {manufacturer.name}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 10L10 2M10 2H4M10 2V8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      )}
    </div>
  )
}

// ── System Card Tile ──────────────────────────────────────────────────────────

function SystemCardTile({ system, onClick }: { system: ShowroomSystem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const category = system.category ?? 'Unknown'
  const catStyle = CATEGORY_COLOURS[category] ?? { bg: '#f3f4f6', color: '#374151' }
  const profileCount   = system.staged_system_profiles.length
  const componentCount = system.staged_system_components.filter(c => c.staged_components).length

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%',
        background: '#ffffff',
        border: hovered ? '1.5px solid #185D7A' : '1px solid #d1d5db',
        borderRadius: '14px', overflow: 'hidden', cursor: 'pointer',
        boxShadow: hovered ? '0 8px 28px rgba(24,93,122,0.18)' : '0 2px 10px rgba(0,0,0,0.07)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Hero image */}
      <div style={{
        height: '180px', flexShrink: 0, position: 'relative',
        background: system.hero_image_url
          ? `url(${system.hero_image_url}) center/cover`
          : 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!system.hero_image_url && (
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
            {system.product_code ?? system.name}
          </span>
        )}
        <span style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: catStyle.bg, color: catStyle.color, padding: '3px 9px', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
          {category}
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
          {system.name}
        </h3>
        {system.description && (
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {system.description}
          </p>
        )}
        {system.australian_made && (
          <span style={{ alignSelf: 'flex-start', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '20px' }}>
            Australian Made
          </span>
        )}
        <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            {profileCount > 0 ? `${profileCount} profile${profileCount !== 1 ? 's' : ''}` : ''}
            {profileCount > 0 && componentCount > 0 ? ' · ' : ''}
            {componentCount > 0 ? `${componentCount} component${componentCount !== 1 ? 's' : ''}` : ''}
          </span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#185D7A', display: 'flex', alignItems: 'center', gap: '3px' }}>
            View details
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4.5 2.5L8 6L4.5 9.5" stroke="#185D7A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </div>
    </button>
  )
}

// ── System Detail Modal ───────────────────────────────────────────────────────

function SystemDetailModal({ system, onClose }: { system: ShowroomSystem; onClose: () => void }) {
  const category = system.category ?? 'Unknown'
  const catStyle = CATEGORY_COLOURS[category] ?? { bg: '#f3f4f6', color: '#374151' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', borderRadius: '18px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Hero */}
        <div style={{ height: '200px', flexShrink: 0, position: 'relative', background: system.hero_image_url ? `url(${system.hero_image_url}) center/cover` : 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%)', borderRadius: '18px 18px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!system.hero_image_url && (
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>{system.product_code}</span>
          )}
          <span style={{ position: 'absolute', top: '14px', left: '14px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: catStyle.bg, color: catStyle.color, padding: '4px 10px', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}>
            {category}
          </span>
          <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.45)', border: 'none', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '8px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 24px 28px', flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{system.name}</h2>
          {system.product_code && (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{system.product_code}</p>
          )}
          {system.description && (
            <p style={{ margin: '12px 0 0', fontSize: '14px', color: '#374151', lineHeight: 1.65 }}>{system.description}</p>
          )}

          {/* Attribute pills */}
          {system.australian_made && (
            <div style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '5px 12px', borderRadius: '20px' }}>
                Australian Made
              </span>
            </div>
          )}

          {/* Colours */}
          {system.staged_system_colours.length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '10px' }}>
                Colours · {system.staged_system_colours.length}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {system.staged_system_colours.map((c) => (
                  <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500, background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0', padding: c.image_url ? '4px 10px 4px 4px' : '5px 12px', borderRadius: '20px', lineHeight: 1.4 }}>
                    {c.image_url && (
                      <span style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, background: `url(${c.image_url}) center/cover`, border: '1px solid rgba(0,0,0,0.1)' }} />
                    )}
                    {c.colour_name}
                    {!c.is_stocked && <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af' }}>EOI</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Profiles */}
          {system.staged_system_profiles.length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '10px' }}>
                Profiles · {system.staged_system_profiles.length} variant{system.staged_system_profiles.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {system.staged_system_profiles.map((p) => {
                  const label = p.profile_name || p.name || ''
                  const dims  = fmtDims(p)
                  const uom   = fmtUom(p.uom)
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', padding: '9px 12px', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {label && <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{label}</div>}
                        {(dims || uom || p.product_code) && (
                          <div style={{ marginTop: label ? '3px' : 0, fontSize: '12px', color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                            {dims && <span>{dims}</span>}
                            {uom && <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>{uom}</span>}
                            {p.product_code && <span style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>{p.product_code}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Components */}
          {system.staged_system_components.filter(c => c.staged_components).length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '10px' }}>
                Accessories &amp; Components · {system.staged_system_components.filter(c => c.staged_components).length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {system.staged_system_components.filter(c => c.staged_components).map((item) => {
                  const comp = item.staged_components!
                  return (
                    <div key={item.id} style={{ padding: '9px 12px', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '10px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{comp.name}</div>
                      {(item.notes || comp.description) && (
                        <div style={{ marginTop: '3px', fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>{item.notes || comp.description}</div>
                      )}
                      {(comp.sku || comp.uom) && (
                        <div style={{ marginTop: '5px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {comp.sku && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{comp.sku}</span>}
                          {comp.uom && <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#9ca3af' }}>{fmtUom(comp.uom)}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Preview notice */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', padding: '14px 16px', background: '#f8fafc', border: '1.5px solid #e5e7eb', borderRadius: '10px', textAlign: 'center', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
            This is a <strong style={{ color: '#374151' }}>studio preview</strong> — RFQ and enquiry actions will be live once this system is published to BuildQuote.
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ShowroomManufacturerClient({
  manufacturer,
  systems,
}: {
  manufacturer: ShowroomManufacturer
  systems: ShowroomSystem[]
}) {
  const [openSystem, setOpenSystem] = useState<ShowroomSystem | null>(null)

  return (
    <>
      {/* Studio notice bar */}
      <div style={{ background: '#0f4461', borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '10px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <a
            href="/studio/showroom"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
          >
            ← All Manufacturers
          </a>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
            <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Studio Showroom</strong> — private preview of how this brand page will appear on BuildQuote once published.
          </p>
        </div>
      </div>

      {/* Manufacturer hero */}
      <ManufacturerHero manufacturer={manufacturer} />

      {/* System cards */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 20px 100px' }}>
        {systems.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '15px', textAlign: 'center', padding: '60px 0' }}>
            No products staged for this manufacturer yet.
          </p>
        ) : (
          <>
            <style>{`
              .showroom-detail-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
              @media (min-width: 560px) { .showroom-detail-grid { grid-template-columns: repeat(2, 1fr); } }
              @media (min-width: 900px) { .showroom-detail-grid { grid-template-columns: repeat(3, 1fr); } }
            `}</style>
            <div style={{ marginBottom: '20px', paddingTop: '8px', fontSize: '14px', color: '#6b7280' }}>
              {systems.length} product{systems.length !== 1 ? 's' : ''}
            </div>
            <div className="showroom-detail-grid">
              {systems.map((system) => (
                <SystemCardTile key={system.id} system={system} onClick={() => setOpenSystem(system)} />
              ))}
            </div>
          </>
        )}
      </div>

      {openSystem && (
        <SystemDetailModal system={openSystem} onClose={() => setOpenSystem(null)} />
      )}
    </>
  )
}
