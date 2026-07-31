'use client'

// System Card V2 — a card object, not a page. A fixed-size rounded frame
// sits on a dark backdrop; exactly one screen is visible at a time (Cover,
// then five screens); a bottom bar turns the page. The outer browser page
// never scrolls — each screen scrolls internally only if its own content
// needs it. No scroll-snap, no scroll-triggered reveals: navigation is
// explicit state, not a side effect of scroll position.
//
// Screen order: Cover → Choose → Attributes and Information → Guides and
// Resources → Components and Accessories → Stockists. Guides and Resources
// was originally folded into Attributes and Information, then split back
// out into its own screen after Melia found the combined page needed too
// much scrolling to reach the resources. Reused only the existing
// SystemCardSystem / SystemCardManufacturerPage data types — zero overlap
// with components/system-card-renderer/.

import { useRef, useState } from 'react'
import type { SystemCardSystem, SystemCardManufacturerPage, SystemCardStockist } from '@/components/system-card-renderer/types'
import { Cover } from './Cover'
import { SelectionProvider } from './SelectionContext'
import { ChooseReveal } from './ChooseReveal'
import { AttributesInfoReveal } from './AttributesInfoReveal'
import { GuidesResourcesReveal } from './GuidesResourcesReveal'
import { ComponentsAccessoriesReveal } from './ComponentsAccessoriesReveal'
import { StockistsReveal } from './StockistsReveal'
import { shareSystemCard } from './shareCard'
import styles from './RevealsBody.module.css'

const FONT_BODY = "'Barlow', -apple-system, 'Segoe UI', sans-serif"
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'

function ChevronLeft() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" /><line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
    </svg>
  )
}

const PAGE_COUNT = 6

function Bar({ current, onBack, onNext, nextLabel, onShare, shareLabel }: {
  current: number
  onBack: (() => void) | null
  onNext: (() => void) | null
  nextLabel?: string
  onShare?: () => void
  shareLabel?: string
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.barSide}>
        {onBack && (
          <button type="button" className={styles.barIconBtn} onClick={onBack} aria-label="Back">
            <ChevronLeft />
          </button>
        )}
      </div>
      <div className={styles.barDots}>
        {Array.from({ length: PAGE_COUNT }).map((_, i) => (
          <span key={i} className={styles.barDot} data-active={i === current} />
        ))}
      </div>
      <div className={styles.barSide} data-align="end">
        {onNext && (
          <button type="button" className={styles.barNext} onClick={onNext}>
            {nextLabel}
            <ChevronRight />
          </button>
        )}
        {onShare && (
          <button type="button" className={styles.barNext} onClick={onShare}>
            <ShareIcon />
            {shareLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// bgImage is optional and only used by screens that ask for it (Attributes
// and Information, so far) — a faint product photo behind the content, not
// a bold background. Sits behind .screenScroll/.bar in normal DOM order, no
// z-index needed.
function Screen({ active, children, bgImage }: { active: boolean; children: React.ReactNode; bgImage?: string | null }) {
  return (
    <div className={styles.screen} data-active={active} aria-hidden={!active}>
      {bgImage && <div className={styles.screenBgImage} style={{ backgroundImage: `url(${bgImage})` }} />}
      {children}
    </div>
  )
}

// Repeats the manufacturer + product name on every screen — Melia asked for
// this directly, annotating all five pages, so a builder paging through
// never loses track of which System Card they're in.
function PageHead({ num, title, question, identity }: { num: string; title: string; question?: string; identity: string }) {
  return (
    <div className={styles.pageHead}>
      <span className={styles.pageNum} aria-hidden="true">{num}</span>
      <div className={styles.pageHeadMain}>
        <h2 className={styles.pageTitle}>{title}</h2>
        {question && <p className={styles.pageQuestion}>{question}</p>}
      </div>
      <span className={styles.pageIdentity}>{identity}</span>
    </div>
  )
}

export function SystemCardV2Experience({ manufacturer, system, stockists = [] }: {
  manufacturer: SystemCardManufacturerPage
  system: SystemCardSystem
  stockists?: SystemCardStockist[]
}) {
  const [page, setPage] = useState(0)
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const identity = `${manufacturer.name} ${system.name}`

  async function handleShare() {
    const outcome = await shareSystemCard({
      title: `${system.name} — ${manufacturer.name} System Card`,
      text: system.description ?? system.name,
      url: window.location.href,
    })
    if (outcome === 'copied') {
      setShareState('copied')
      resetTimer.current = setTimeout(() => setShareState('idle'), 2000)
    }
  }

  const go = (n: number) => setPage(Math.max(0, Math.min(PAGE_COUNT - 1, n)))

  return (
    <SelectionProvider>
      <div style={{ fontFamily: FONT_BODY }}>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS_HREF} />

        <div className={styles.protoBar}>
          <strong>BuildQuote</strong>
          <span>·</span>
          <span>System Card — design experiment</span>
        </div>

        <div className={styles.page}>
          <div className={styles.card}>

            <Screen active={page === 0}>
              <Cover manufacturer={manufacturer} system={system} />
              <Bar current={0} onBack={null} onNext={() => go(1)} nextLabel="Open System Card" />
            </Screen>

            <Screen active={page === 1}>
              <div className={styles.screenScroll}>
                <div className={styles.screenContent}>
                  <PageHead num="01" title="Colours. Profiles. Finishes." identity={identity} />
                  <ChooseReveal colours={system.system_colours} profiles={system.system_profiles} />
                </div>
              </div>
              <Bar current={1} onBack={() => go(0)} onNext={() => go(2)} nextLabel="Specifications" />
            </Screen>

            <Screen active={page === 2} bgImage={system.hero_image_url}>
              <div className={styles.screenScroll}>
                <div className={styles.screenContent}>
                  <PageHead num="02" title="Attributes and Information" identity={identity} />
                  <AttributesInfoReveal system={system} />
                </div>
              </div>
              <Bar current={2} onBack={() => go(1)} onNext={() => go(3)} nextLabel="Guides" />
            </Screen>

            <Screen active={page === 3}>
              <div className={styles.screenScroll}>
                <div className={styles.screenContent}>
                  <PageHead num="03" title="Guides and Resources" identity={identity} />
                  <GuidesResourcesReveal system={system} />
                </div>
              </div>
              <Bar current={3} onBack={() => go(2)} onNext={() => go(4)} nextLabel="Components" />
            </Screen>

            <Screen active={page === 4}>
              <div className={styles.screenScroll}>
                <div className={styles.screenContent}>
                  <PageHead num="04" title="Components and Accessories" identity={identity} />
                  <ComponentsAccessoriesReveal system={system} />
                </div>
              </div>
              <Bar current={4} onBack={() => go(3)} onNext={() => go(5)} nextLabel="Stockists" />
            </Screen>

            <Screen active={page === 5}>
              <div className={styles.screenScroll}>
                <div className={styles.screenContent}>
                  <PageHead num="05" title="Stockists" identity={identity} />
                  <StockistsReveal system={system} stockists={stockists} />
                </div>
              </div>
              <Bar
                current={5}
                onBack={() => go(4)}
                onNext={null}
                onShare={handleShare}
                shareLabel={shareState === 'copied' ? 'Link copied' : 'Share System Card'}
              />
            </Screen>

          </div>
        </div>
      </div>
    </SelectionProvider>
  )
}
