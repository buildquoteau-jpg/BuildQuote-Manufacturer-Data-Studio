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
// Real table (Name/Specs/Part no/UOM/Select), matching the Components and
// Accessories screen structure exactly — Melia asked for the same table
// after an earlier card-row version read inconsistently next to it. Weight
// is deliberately not shown here (Melia's call); weight_kg stays on the
// type for other uses.

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
          <div className={styles.specTableScroll}>
            <table className={styles.specTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Specs</th>
                  <th>Part no</th>
                  <th>UOM</th>
                  <th>Select</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p, i) => {
                  const pressed = profileNames.includes(p.profile_name ?? '')
                  // p.dimensions is a legacy short string (e.g. "190 x 24 mm")
                  // that drops length entirely — Melia caught this directly.
                  // The real length_mm/width_mm/thickness_mm fields are complete;
                  // prefer them, matching the order used on every other screen.
                  const dims = [p.length_mm && `${p.length_mm}mm`, p.width_mm && `${p.width_mm}mm`, p.thickness_mm && `${p.thickness_mm}mm`]
                    .filter(Boolean).join(' × ') || p.dimensions
                  return (
                    <tr key={p.id}>
                      <td className={styles.specTableName}>
                        <span className={styles.profileRole}>{roleLabel(p, i)}</span>
                        {p.profile_name}
                      </td>
                      <td>{dims || '—'}</td>
                      <td>{p.product_code ?? '—'}</td>
                      <td>{p.uom ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.tableCheck}
                          aria-pressed={pressed}
                          aria-label={`Select ${p.profile_name ?? 'profile'}`}
                          onClick={() => toggleProfileName(p.profile_name ?? '')}
                        >
                          <CheckIcon />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
