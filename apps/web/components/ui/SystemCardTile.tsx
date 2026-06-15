'use client'

import { useState } from 'react'

export type SystemCardTileData = {
  id: string
  name: string
  product_code: string | null
  category: string
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  australian_made: boolean | null
  system_profiles: { id: string }[]
  system_components: { components: unknown | null }[]
}

export type ManufacturerRef = {
  name: string
  logo_url: string | null
}

export const CATEGORY_COLOURS: Record<string, { bg: string; color: string }> = {
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

export function SystemCardTile({
  system,
  manufacturer,
  addedCount = 0,
  onClick,
}: {
  system: SystemCardTileData
  manufacturer?: ManufacturerRef | null
  addedCount?: number
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const catStyle = CATEGORY_COLOURS[system.category] ?? { bg: '#f3f4f6', color: '#374151' }
  const profileCount   = system.system_profiles.length
  const componentCount = system.system_components.filter(c => c.components != null).length

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
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
            {system.product_code}
          </span>
        )}
        <span style={{
          position: 'absolute', top: '10px', left: '10px',
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          background: catStyle.bg, color: catStyle.color,
          padding: '3px 9px', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        }}>
          {system.category}
        </span>
        {addedCount > 0 && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '11px', fontWeight: 700,
            background: '#166534', color: '#ffffff',
            padding: '3px 9px', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            ✓ {addedCount} added
          </span>
        )}
      </div>

      {/* Content strip */}
      <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {manufacturer && (
          manufacturer.logo_url
            ? <img src={manufacturer.logo_url} alt={manufacturer.name} style={{ height: '14px', objectFit: 'contain', maxWidth: '70px' }} />
            : <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{manufacturer.name}</span>
        )}
        <h3 style={{
          margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
        }}>
          {system.name}
        </h3>
        {system.description && (
          <p style={{
            margin: 0, fontSize: '13px', color: '#6b7280', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {system.description}
          </p>
        )}
        {system.australian_made && (
          <span style={{
            alignSelf: 'flex-start',
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
            color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0',
            padding: '2px 8px', borderRadius: '20px',
          }}>
            AU Australian Made
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
