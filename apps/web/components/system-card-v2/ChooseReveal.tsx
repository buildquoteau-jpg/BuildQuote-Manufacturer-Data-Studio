'use client'

// Choose screen. Real Apex PLUS data only: 2 colours (both now have real
// swatch photography) and 2 profiles.
//
// The two profiles are NOT alternatives to each other — Melia corrected
// this after seeing it rendered as a single-select pair: the first is the
// main decking profile, the second (real name field: "Square Edge Board")
// is the edge board used at a deck's perimeter. Role label is derived from
// the real `name` field (falls back to "Main profile" for the first/lowest
// sort_order item, "Edge board" when the name says so, "Additional profile"
// otherwise) — not hardcoded to Apex PLUS specifically, so it holds up for
// other manufacturers' data too. Selection is now an independent
// toggle per row (a builder may reasonably want both), not a radio group.
//
// UOM and weight are real per-profile facts shown as small right-aligned
// tags — this is the one place they live; Attributes and Information no
// longer repeats the profile list at all (it was a straight duplicate of
// this screen, Melia flagged it directly).

import type { SystemCardColour, SystemCardProfile } from '@/components/system-card-renderer/types'
import { useSelection } from './SelectionContext'
import styles from './RevealsBody.module.css'

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ProfileGlyph({ grooved }: { grooved: boolean }) {
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
      <rect x="1" y="1" width="38" height="26" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      {grooved && (
        <>
          <line x1="9" y1="1" x2="9" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="17" y1="1" x2="17" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="25" y1="1" x2="25" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="31" y1="1" x2="31" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="9" y1="21.5" x2="9" y2="27" stroke="currentColor" strokeWidth="1.5" />
          <line x1="17" y1="21.5" x2="17" y2="27" stroke="currentColor" strokeWidth="1.5" />
          <line x1="25" y1="21.5" x2="25" y2="27" stroke="currentColor" strokeWidth="1.5" />
          <line x1="31" y1="21.5" x2="31" y2="27" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  )
}

function roleLabel(p: SystemCardProfile, index: number): string {
  const name = `${p.name ?? ''} ${p.profile_name ?? ''}`.toLowerCase()
  if (name.includes('edge')) return 'Edge board'
  if (index === 0) return 'Main profile'
  return 'Additional profile'
}

export function ChooseReveal({ colours, profiles }: {
  colours: SystemCardColour[]
  profiles: SystemCardProfile[]
}) {
  const { colourName, setColourName, profileNames, toggleProfileName } = useSelection()

  return (
    <>
      <p className={styles.chooseHint}>Select colours and profiles to add them to your shopping list.</p>

      {colours.length > 0 && (
        <>
          <p className={styles.groupLabel}>Select colour</p>
          <div className={styles.swatchRow}>
            {colours.map(c => {
              const pressed = colourName === c.colour_name
              return (
                <button
                  key={c.colour_name}
                  type="button"
                  className={styles.swatch}
                  aria-pressed={pressed}
                  onClick={() => setColourName(pressed ? null : c.colour_name)}
                >
                  <span className={styles.swatchImgWrap}>
                    {c.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.swatchImg} src={c.image_url} alt="" />
                    ) : (
                      <span className={styles.swatchImg} style={{ background: '#e2e0d9' }} />
                    )}
                    {pressed && <span className={styles.swatchCheck}><CheckIcon /></span>}
                  </span>
                  <span className={styles.swatchLabel}>{c.colour_name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {profiles.length > 0 && (
        <>
          <p className={styles.groupLabel}>Profile</p>
          <div className={styles.profileList}>
            {profiles.map((p, i) => {
              const pressed = profileNames.includes(p.profile_name ?? '')
              const grooved = (p.profile_name ?? '').toLowerCase().includes('groov')
              // p.dimensions is a legacy short string (e.g. "190 x 24 mm")
              // that drops length entirely — Melia caught this directly.
              // The real length_mm/width_mm/thickness_mm fields are complete;
              // prefer them, matching the order used on every other screen.
              const dims = [p.length_mm && `${p.length_mm}mm`, p.width_mm && `${p.width_mm}mm`, p.thickness_mm && `${p.thickness_mm}mm`]
                .filter(Boolean).join(' × ') || p.dimensions
              return (
                <button
                  key={p.id}
                  type="button"
                  className={styles.profileRow}
                  aria-pressed={pressed}
                  onClick={() => toggleProfileName(p.profile_name ?? '')}
                >
                  <span className={styles.profileGlyph}><ProfileGlyph grooved={grooved} /></span>
                  <span className={styles.profileText}>
                    <p className={styles.profileRole}>{roleLabel(p, i)}</p>
                    <p className={styles.profileName}>{p.profile_name}</p>
                    {dims && <p className={styles.profileDims}>{dims}</p>}
                  </span>
                  {(p.uom || p.weight_kg != null) && (
                    <span className={styles.profileTags}>
                      {p.uom && <span className={styles.profileUom}>{p.uom}</span>}
                      {p.weight_kg != null && <span className={styles.profileWeight}>{p.weight_kg} kg</span>}
                    </span>
                  )}
                  <span className={styles.profileCheck}><CheckIcon /></span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
