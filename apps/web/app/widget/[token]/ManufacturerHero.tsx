'use client'

import { useState } from 'react'
import type { WidgetData } from '@/lib/data/getWidgetData'

export function ManufacturerHero({ manufacturer }: {
  manufacturer: WidgetData['manufacturer']
}) {
  const [logoError, setLogoError] = useState(false)

  if (!manufacturer) return null

  const bgStyle = manufacturer.hero_image_url
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${manufacturer.hero_image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 60%, #1e3a5f 100%)' }

  const showLogo = manufacturer.logo_url && !logoError

  return (
    <div style={{
      ...bgStyle,
      borderRadius: '14px',
      padding: '56px 32px 52px',
      textAlign: 'center',
      marginBottom: '28px',
      overflow: 'hidden',
    }}>
      {showLogo && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.93)',
          borderRadius: '10px',
          padding: '8px 18px',
          marginBottom: '20px',
        }}>
          <img
            src={manufacturer.logo_url!}
            alt={manufacturer.name}
            onError={() => setLogoError(true)}
            style={{ height: '38px', objectFit: 'contain', display: 'block' }}
          />
        </div>
      )}

      <div style={{
        fontSize: showLogo ? '22px' : '34px',
        fontWeight: 800,
        color: '#ffffff',
        letterSpacing: '-0.02em',
        marginBottom: '10px',
        textShadow: '0 2px 12px rgba(0,0,0,0.4)',
        lineHeight: 1.1,
      }}>
        {manufacturer.name}
      </div>



      {manufacturer.description && (
        <p style={{
          color: 'rgba(255,255,255,0.85)',
          fontSize: '14px',
          lineHeight: 1.65,
          maxWidth: '580px',
          margin: '0 auto 24px',
          textShadow: '0 1px 6px rgba(0,0,0,0.35)',
        }}>
          {manufacturer.description}
        </p>
      )}

      {manufacturer.website_url && (
        <a
          href={manufacturer.website_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 22px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.45)',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Visit {manufacturer.name}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 10L10 2M10 2H4M10 2V8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      )}
    </div>
  )
}
