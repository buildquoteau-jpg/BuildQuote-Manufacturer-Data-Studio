'use client'

// System Card V2 — a compact card object that unfolds. The cover is always
// visible at the top; beneath it, five independent labelled bars reveal
// their content directly underneath themselves when tapped, and fold back
// up when tapped again. Any number can be open at once — this is NOT a
// paginated wizard/carousel/accordion-with-exclusive-open: there is no
// "current screen" state, no Back/Next, no left/right transition. The page
// itself is the scroll container; nothing scrolls in an inner clipped box.
//
// Replaces the earlier page-by-page version (Screen/Bar/PageHead, a single
// `page: number`) per Melia's direct correction: "it should feel like a
// compact physical card that contains additional layers hidden underneath
// it," not "a sequence of separate screens." See SystemCardSection.tsx for
// the actual expand/collapse mechanics (CSS grid 0fr -> 1fr).
//
// Reused only the existing SystemCardSystem / SystemCardManufacturerPage
// data types — zero overlap with components/system-card-renderer/.

import { useState } from 'react'
import type { SystemCardSystem, SystemCardStockist } from '@/components/system-card-renderer/types'
import { Cover } from './Cover'
import { SelectionProvider } from './SelectionContext'
import { SystemCardSection } from './SystemCardSection'
import { ChooseReveal } from './ChooseReveal'
import { AttributesInfoReveal, hasAttributesContent } from './AttributesInfoReveal'
import { GuidesResourcesReveal } from './GuidesResourcesReveal'
import { ComponentsAccessoriesReveal } from './ComponentsAccessoriesReveal'
import { StockistsReveal } from './StockistsReveal'
import { AskAboutProductReveal } from './AskAboutProductReveal'
import { MaterialsListBar } from './MaterialsListBar'
import type { ShoppingListItem } from './useMaterialsListRows'
import { shareSystemCard } from './shareCard'
import styles from './RevealsBody.module.css'

const FONT_BODY = "'Barlow', -apple-system, 'Segoe UI', sans-serif"
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
    </svg>
  )
}

const SECTION_IDS = ['choose', 'attributes', 'ask', 'guides', 'components', 'stockists'] as const
type SectionId = typeof SECTION_IDS[number]

export function SystemCardV2Experience({ manufacturer, system, stockists = [], onAddToList, showExperimentBanner = true }: {
  // Only manufacturer.name is used anywhere in this tree — narrower than
  // the full SystemCardManufacturerPage type, which exists for the v6-style
  // manufacturer landing page this experiment doesn't have.
  manufacturer: { name: string }
  system: SystemCardSystem
  stockists?: SystemCardStockist[]
  // Omit entirely for a read-only preview (e.g. the manufacturer-review
  // grid) — the "Add to shopping list" button only renders when this is
  // provided. When provided, wire it to the caller's own local
  // ShoppingListProvider.addItems — never a BuildQuote API.
  onAddToList?: (items: ShoppingListItem[]) => void
  showExperimentBanner?: boolean
}) {
  // A Set of open section ids, not one currentStep — several sections must
  // be able to stay open simultaneously, and closing one must never affect
  // another. Starts empty: the card's resting/shareable state is fully
  // closed.
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set())
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')

  function toggleSection(id: SectionId) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleShare() {
    const outcome = await shareSystemCard({
      title: `${system.name} — ${manufacturer.name} System Card`,
      text: system.description ?? system.name,
      url: window.location.href,
    })
    if (outcome === 'copied') {
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2000)
    }
  }

  const noProfiles = system.system_colours.length === 0 && system.system_profiles.length === 0
  const noComponents = system.system_components.length === 0

  return (
    <SelectionProvider>
      <div style={{ fontFamily: FONT_BODY }}>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS_HREF} />

        {showExperimentBanner && (
          <div className={styles.protoBar}>
            <strong>BuildQuote</strong>
            <span>·</span>
            <span>System Card — design experiment</span>
          </div>
        )}

        <div className={styles.page}>
          <div className={styles.card}>
            <Cover manufacturer={manufacturer} system={system} />

            <div className={styles.sectionsList}>
              <SystemCardSection
                id="choose"
                title="Colours. Profiles. Finishes."
                open={openSections.has('choose')}
                onToggle={() => toggleSection('choose')}
                disabled={noProfiles}
              >
                <ChooseReveal colours={system.system_colours} profiles={system.system_profiles} />
              </SystemCardSection>

              <SystemCardSection
                id="attributes"
                title="Attributes and Information"
                open={openSections.has('attributes')}
                onToggle={() => toggleSection('attributes')}
                disabled={!hasAttributesContent(system)}
              >
                <AttributesInfoReveal system={system} />
              </SystemCardSection>

              {system.manufacturer?.slug && (
                <SystemCardSection
                  id="ask"
                  title="Ask about this product"
                  open={openSections.has('ask')}
                  onToggle={() => toggleSection('ask')}
                >
                  <AskAboutProductReveal manufacturerSlug={system.manufacturer.slug} systemSlug={system.slug} />
                </SystemCardSection>
              )}

              <SystemCardSection
                id="guides"
                title="Guides and Resources"
                open={openSections.has('guides')}
                onToggle={() => toggleSection('guides')}
              >
                <GuidesResourcesReveal system={system} />
              </SystemCardSection>

              <SystemCardSection
                id="components"
                title="Components and Accessories"
                open={openSections.has('components')}
                onToggle={() => toggleSection('components')}
                disabled={noComponents}
              >
                <ComponentsAccessoriesReveal system={system} />
              </SystemCardSection>

              <SystemCardSection
                id="stockists"
                title="Stockists"
                open={openSections.has('stockists')}
                onToggle={() => toggleSection('stockists')}
              >
                <StockistsReveal stockists={stockists} />
              </SystemCardSection>

              <MaterialsListBar system={system} onAddToList={onAddToList} />

              <div className={styles.cardClose}>
                <button type="button" className={styles.barNext} onClick={handleShare}>
                  <ShareIcon />
                  {shareState === 'copied' ? 'Link copied' : 'Share System Card'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SelectionProvider>
  )
}
