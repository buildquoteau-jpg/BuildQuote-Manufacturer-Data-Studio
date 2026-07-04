'use client'

// Static-package page shells. These mirror SystemCardPreviewWrapper's two
// views, but with real relative <a> links instead of in-page view switching,
// because in the generated website every card is its own /cards/<slug>/ page.
// Everything must work over file:// — all hrefs are relative, all data comes
// from inline JSON (see entry.tsx), and the shopping list persists across
// pages via localStorage (storageKey).

import { ShoppingListProvider, useShoppingList } from '../ShoppingListProvider'
import { ShoppingListDrawer } from '../ShoppingListDrawer'
import { SystemCardRenderer } from '../SystemCardRenderer'
import { SystemCardTile } from '../SystemCardTile'
import type { SystemCardSystem, SystemCardManufacturerPage } from '../types'

const FONT_BODY    = "'Barlow', -apple-system, 'Segoe UI', sans-serif"
const FONT_HEADING = "'Barlow Condensed', 'Barlow', sans-serif"

export type StaticCollectionData = {
  mode: 'collection'
  manufacturer: SystemCardManufacturerPage
  cards: { href: string; system: SystemCardSystem }[]
  storageKey: string
}

export type StaticCardData = {
  mode: 'card'
  manufacturer: SystemCardManufacturerPage
  system: SystemCardSystem
  backHref: string
  storageKey: string
}

export type StaticPageData = StaticCollectionData | StaticCardData

function PoweredByFooter() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 24px 28px', fontSize: '12px', color: '#94a3b8' }}>
      System Cards prepared with{' '}
      <span style={{ fontWeight: 700, color: '#64748b' }}>
        Build<span style={{ color: '#f97316' }}>Quote</span>
      </span>
    </div>
  )
}

// ── Collection page (/system-cards/index.html) ───────────────────────────────

export function StaticCollectionPage({ data }: { data: StaticCollectionData }) {
  const { manufacturer, cards } = data
  const heroImg  = manufacturer.hero_wide_image_url ?? manufacturer.hero_image_url
  const heroPosY = manufacturer.hero_image_position_y ?? 50

  return (
    <ShoppingListProvider storageKey={data.storageKey}>
      <div style={{ fontFamily: FONT_BODY, background: '#f5f7f9', minHeight: '100vh', paddingBottom: '64px' }}>

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
            {manufacturer.logo_url && (
              <div style={{
                alignSelf: 'flex-start', background: 'rgba(255,255,255,0.93)',
                borderRadius: 10, padding: '8px 18px',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={manufacturer.logo_url} alt={`${manufacturer.name} logo`}
                  style={{ height: 40, objectFit: 'contain', display: 'block' }} />
              </div>
            )}
            <h1 style={{
              margin: 0, fontSize: 'clamp(28px, 5vw, 46px)', fontWeight: 800, color: '#fff',
              letterSpacing: '-0.02em', lineHeight: 1.05, fontFamily: FONT_HEADING,
            }}>
              {manufacturer.name} System Cards
            </h1>
            {manufacturer.description && (
              <p style={{ margin: 0, maxWidth: '680px', fontSize: 'clamp(14px, 1.8vw, 16px)', color: 'rgba(255,255,255,0.82)', lineHeight: 1.6 }}>
                {manufacturer.description}
              </p>
            )}
            {manufacturer.website_url && (
              <a href={manufacturer.website_url} style={{
                alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700, fontSize: '15px',
                padding: '11px 24px', borderRadius: '10px', textDecoration: 'none',
                border: '1.5px solid rgba(255,255,255,0.55)', marginTop: '4px',
              }}>
                Visit {manufacturer.name} website
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
              </a>
            )}
          </div>
        </section>

        {/* Systems grid */}
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 24px 40px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: '18px' }}>
            {cards.length} product system{cards.length !== 1 ? 's' : ''}
          </div>
          {cards.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
              {cards.map(({ href, system }) => (
                <SystemCardTile key={system.id} system={system} href={href} />
              ))}
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '15px' }}>No product systems listed yet.</p>
          )}
        </section>

        <PoweredByFooter />
      </div>
      <ShoppingListDrawer />
    </ShoppingListProvider>
  )
}

// ── Card page (/system-cards/cards/<slug>/index.html) ────────────────────────

function CardPageBody({ data }: { data: StaticCardData }) {
  const { addItems } = useShoppingList()
  const { manufacturer, system, backHref } = data

  return (
    <div style={{ fontFamily: FONT_BODY, background: '#f5f7f9', minHeight: '100vh', paddingBottom: '64px' }}>

      {/* Branded top bar — back to the collection page */}
      <div style={{ background: 'rgba(255,255,255,0.92)', borderBottom: '1px solid #d1d9e0', boxShadow: '0 1px 8px rgba(15,30,45,0.05)' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <a href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#185D7A', textDecoration: 'none', fontWeight: 700, fontSize: '14px', minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M10 3.5L5.5 8L10 12.5" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{manufacturer.name}</span>
          </a>
          {manufacturer.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manufacturer.logo_url} alt={`${manufacturer.name} logo`}
              style={{ height: 26, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.01em', color: '#185D7A', flexShrink: 0 }}>
              {manufacturer.name}
            </span>
          )}
        </div>
      </div>

      {/* Card */}
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px 20px' }}>
        <SystemCardRenderer system={system} onAddToList={addItems} />

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <a href={backHref} style={{
            fontSize: '13px', fontWeight: 600, color: '#185D7A',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 12L4 7L9 2" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            All {manufacturer.name} System Cards
          </a>
        </div>
      </div>

      <PoweredByFooter />
    </div>
  )
}

export function StaticCardPage({ data }: { data: StaticCardData }) {
  return (
    <ShoppingListProvider storageKey={data.storageKey}>
      <CardPageBody data={data} />
      <ShoppingListDrawer />
    </ShoppingListProvider>
  )
}
