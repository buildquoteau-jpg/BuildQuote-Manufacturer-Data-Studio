'use client'

// The full v6 public experience, client-side, inside Data Studio:
//
//   View 1 — manufacturer landing page (ported from BuildQuote v6
//            app/library/[manufacturer]/page.tsx): breadcrumb, hero band,
//            description, website CTA, systems grid of SystemCardTiles.
//   View 2 — per-system page (ported from v6
//            app/library/[manufacturer]/[system]/page.tsx): branded top bar,
//            the full System Card, back link.
//
// Tile clicks swap views in-page (no routing), the shopping-list drawer
// floats across both, and everything runs client-side — no Supabase reads
// or writes from any interaction here. Breadcrumb/wordmark links are inert
// in the preview.

import { useState } from 'react'
import { ShoppingListProvider, useShoppingList } from './ShoppingListProvider'
import { ShoppingListDrawer } from './ShoppingListDrawer'
import { SystemCardRenderer } from './SystemCardRenderer'
import { SystemCardTile } from './SystemCardTile'
import type { SystemCardSystem, SystemCardManufacturerPage } from './types'

const FONT_BODY    = "'Barlow', -apple-system, 'Segoe UI', sans-serif"
const FONT_HEADING = "'Barlow Condensed', 'Barlow', sans-serif"

// The public card is set in Barlow / Barlow Condensed (BuildQuote v6 loads
// them via next/font). Studio doesn't, so pull them from Google Fonts here.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'

// Inert link — keeps the exact public look but never navigates (preview only).
function inert(e: React.MouseEvent) { e.preventDefault() }

// ── View 1: manufacturer landing page ─────────────────────────────────────────

function ManufacturerPageView({ manufacturer, systems, onOpenSystem }: {
  manufacturer: SystemCardManufacturerPage
  systems: SystemCardSystem[]
  onOpenSystem: (id: string) => void
}) {
  const heroImg  = manufacturer.hero_wide_image_url ?? manufacturer.hero_image_url
  const heroPosY = manufacturer.hero_image_position_y ?? 50

  return (
    <div style={{ fontFamily: FONT_BODY, background: '#f5f7f9' }}>

      {/* Breadcrumb */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #d1d9e0', padding: '12px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <a href="#" onClick={inert} style={{ color: '#185D7A', textDecoration: 'none', fontWeight: 600 }}>BuildQuote</a>
          <span style={{ color: '#d1d9e0' }}>›</span>
          <a href="#" onClick={inert} style={{ color: '#185D7A', textDecoration: 'none', fontWeight: 600 }}>Library</a>
          <span style={{ color: '#d1d9e0' }}>›</span>
          <span style={{ color: '#64748b' }}>{manufacturer.name}</span>
        </div>
      </div>

      {/* Hero */}
      <section style={{
        position: 'relative',
        backgroundImage: heroImg
          ? `linear-gradient(100deg, rgba(11,44,60,0.92) 0%, rgba(14,55,74,0.66) 46%, rgba(20,86,110,0.24) 100%), url(${heroImg})`
          : 'linear-gradient(155deg, #0d3347 0%, #185D7A 55%, #1e7399 100%)',
        backgroundSize: 'cover',
        backgroundPosition: `center ${heroPosY}%`,
        padding: '60px 24px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h1 style={{
            margin: 0, fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 800, color: '#fff',
            letterSpacing: '-0.02em', lineHeight: 1.05, fontFamily: FONT_HEADING,
          }}>
            {manufacturer.name}
          </h1>
          {manufacturer.description && (
            <p style={{ margin: 0, maxWidth: '680px', fontSize: 'clamp(14px, 1.8vw, 16px)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.6 }}>
              {manufacturer.description}
            </p>
          )}
          {manufacturer.website_url && (
            <a href={manufacturer.website_url} target="_blank" rel="noopener noreferrer" style={{
              alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700, fontSize: '15px',
              padding: '11px 24px', borderRadius: '10px', textDecoration: 'none',
              border: '1.5px solid rgba(255,255,255,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              marginTop: '4px',
            }}>
              Visit {manufacturer.name} website
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
            </a>
          )}
        </div>
      </section>

      {/* Systems grid */}
      <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 24px 80px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: '18px' }}>
          {systems.length} product system{systems.length !== 1 ? 's' : ''}
        </div>
        {systems.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
            {systems.map(s => (
              <SystemCardTile key={s.id} system={s} onClick={() => onOpenSystem(s.id)} />
            ))}
          </div>
        ) : (
          <p style={{ color: '#94a3b8', fontSize: '15px' }}>No product systems listed yet.</p>
        )}

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <a href="#" onClick={inert} style={{
            fontSize: '13px', fontWeight: 600, color: '#185D7A', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 12L4 7L9 2" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            All manufacturers
          </a>
        </div>
      </section>

    </div>
  )
}

// ── View 2: per-system page ───────────────────────────────────────────────────

function SystemPageView({ manufacturer, system, onBack }: {
  manufacturer: SystemCardManufacturerPage
  system: SystemCardSystem
  onBack: () => void
}) {
  const { addItems } = useShoppingList()

  const backLink = (
    <>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M9 12L4 7L9 2" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back to {manufacturer.name}
    </>
  )

  return (
    <div style={{ fontFamily: FONT_BODY, background: '#f5f7f9' }}>

      {/* Branded nav — back to manufacturer + wordmark (v6 makes this sticky;
          static here so it never fights the Studio shell's own header) */}
      <div style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d1d9e0', boxShadow: '0 1px 8px rgba(15,30,45,0.05)' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); onBack() }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#185D7A', textDecoration: 'none', fontWeight: 700, fontSize: '14px', minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M10 3.5L5.5 8L10 12.5" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{manufacturer.name}</span>
          </a>
          <a href="#" onClick={inert} style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em', color: '#185D7A', textDecoration: 'none', flexShrink: 0 }}>
            Build<span style={{ color: '#f97316' }}>Quote</span>
          </a>
        </div>
      </div>

      {/* Card */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px 80px' }}>
        <SystemCardRenderer system={system} onAddToList={addItems} />

        {/* Back link */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); onBack() }} style={{
            fontSize: '13px', fontWeight: 600, color: '#185D7A',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            {backLink}
          </a>
        </div>
      </div>

    </div>
  )
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

function Experience({ manufacturer, systems }: {
  manufacturer: SystemCardManufacturerPage
  systems: SystemCardSystem[]
}) {
  const [openSystemId, setOpenSystemId] = useState<string | null>(null)
  const openSystem = systems.find(s => s.id === openSystemId) ?? null

  return openSystem ? (
    <SystemPageView
      manufacturer={manufacturer}
      system={openSystem}
      onBack={() => setOpenSystemId(null)}
    />
  ) : (
    <ManufacturerPageView
      manufacturer={manufacturer}
      systems={systems}
      onOpenSystem={setOpenSystemId}
    />
  )
}

export function SystemCardPreviewWrapper({ manufacturer, systems }: {
  manufacturer: SystemCardManufacturerPage
  systems: SystemCardSystem[]
}) {
  return (
    <ShoppingListProvider>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={FONTS_HREF} />
      {/* Room so the fixed bottom drawer bar never hides the last row of content */}
      <div style={{ paddingBottom: '64px' }}>
        <Experience manufacturer={manufacturer} systems={systems} />
      </div>
      <ShoppingListDrawer />
    </ShoppingListProvider>
  )
}
