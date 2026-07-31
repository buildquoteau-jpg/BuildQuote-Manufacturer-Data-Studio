// Attributes and Information screen. Builder language: every real, non-null
// technical attribute the data model holds. Not simplified, not abbreviated
// — fields that don't exist for Apex PLUS today (BAL/fire/acoustic/
// structural/warranty/compliance/span tables/etc.) are correctly absent
// rather than printed as fabricated or "Not specified" filler.
//
// Layout, top to bottom, per Melia's direct correction after seeing a
// duplicate-heavy first pass:
//   1. Key-fact pills (moved here from the Cover — they summarise the
//      attributes on this page, not the photography).
//   2. The real full product description, as its own box — the Cover only
//      ever shows the first sentence; this is where the rest lives.
//   3. Performance / Additional specification / Notes, each its own bounded
//      box (.specBox) so groups don't run together.
// Deliberately NOT shown here: Category/Subcategory (already on the Cover)
// and the profile list (already on Choose, in full, with UOM and weight) —
// both were straight duplicates of content shown elsewhere in the card.

import type { SystemCardSystem } from '@/components/system-card-renderer/types'
import styles from './RevealsBody.module.css'

export function AttributesInfoReveal({ system }: { system: SystemCardSystem }) {
  const ratings: { label: string; value: string }[] = []
  if (system.moisture_resistant) ratings.push({ label: 'Moisture resistance', value: 'Resistant' })
  if (system.bal_rating) ratings.push({ label: 'BAL rating', value: system.bal_rating })
  if (system.fire_rating) ratings.push({ label: 'Fire rating', value: system.fire_rating })
  if (system.acoustic_rating) ratings.push({ label: 'Acoustic rating', value: system.acoustic_rating })
  if (system.structural_grade) ratings.push({ label: 'Structural grade', value: system.structural_grade })
  if (system.australian_made != null) ratings.push({ label: 'Australian made', value: system.australian_made ? 'Yes' : 'No' })

  const badges: { label: string; tone: 'performance' | 'neutral' }[] = []
  if (system.moisture_resistant) badges.push({ label: 'Moisture resistant', tone: 'performance' })
  if (system.system_colours.length > 0) {
    badges.push({ label: `${system.system_colours.length} colourway${system.system_colours.length !== 1 ? 's' : ''}`, tone: 'neutral' })
  }

  return (
    <>
      {badges.length > 0 && (
        <div className={styles.badgeRow}>
          {badges.map(b => <span key={b.label} className={styles.badge} data-tone={b.tone}>{b.label}</span>)}
        </div>
      )}

      {system.description && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Description</p>
          <div className={styles.specBox}>
            <p className={styles.descriptionText}>{system.description}</p>
          </div>
        </div>
      )}

      {ratings.length > 0 && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Performance</p>
          <div className={styles.specBox}>
            {ratings.map(r => (
              <div key={r.label} className={styles.specRow}>
                <span className={styles.specRowLabel}>{r.label}</span>
                <span className={styles.specRowValue}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {system.applications && system.applications.length > 0 && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Applications</p>
          <div className={styles.badgeRow}>
            {system.applications.map(a => <span key={a} className={styles.badge} data-tone="neutral">{a}</span>)}
          </div>
        </div>
      )}

      {system.custom_technical_attributes && system.custom_technical_attributes.length > 0 && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Additional specification</p>
          <div className={styles.specBox}>
            {system.custom_technical_attributes.map(a => (
              <div key={a.label} className={styles.specRow}>
                <span className={styles.specRowLabel}>{a.label}</span>
                <span className={styles.specRowValue}>{a.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {system.notes && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Notes</p>
          <p className={styles.descriptionText}>{system.notes}</p>
        </div>
      )}
    </>
  )
}
