// Attributes and Information screen. Every real, non-null technical
// attribute the data model holds; fields that don't exist for a given
// system are correctly absent rather than printed as filler.
//
// Every attribute-like fact renders as one flat, colour-coded pill row —
// previously split three ways (a floating badge row, a Performance ratings
// table, and an Additional-specification table), which read as a "triple
// up" of visually different treatments for the same kind of fact (moisture
// resistant, in particular, used to appear in both the badge row and
// Performance at once). Now there's exactly one pill per fact, all under
// the Performance heading.
//
// Applications is intentionally not its own block here — the field exists
// on SystemCardSystem for future use but has never been populated by the
// adapter, so there is nothing to show yet; this mirrors v6's current copy,
// which dropped the same block for the same reason.

import type { SystemCardSystem } from '@/components/system-card-renderer/types'
import styles from './RevealsBody.module.css'

// Mirrors the field checks below — used by the parent to decide whether the
// Attributes and Information section bar should be disabled (no content to
// reveal) rather than opening onto an empty panel.
export function hasAttributesContent(system: SystemCardSystem): boolean {
  if (system.description) return true
  if (system.moisture_resistant || system.bal_rating || system.fire_rating || system.acoustic_rating || system.structural_grade || system.australian_made != null) return true
  if (system.custom_technical_attributes && system.custom_technical_attributes.length > 0) return true
  if (system.system_relationships && system.system_relationships.length > 0) return true
  if (system.negative_constraints && system.negative_constraints.length > 0) return true
  if (system.notes) return true
  return false
}

const REL_LABELS: Record<string, { label: string; isNegative: boolean }> = {
  compatible_with: { label: 'Works with', isNegative: false },
  requires_system: { label: 'Requires', isNegative: false },
  incompatible_with: { label: 'Do not use with', isNegative: true },
  supersedes: { label: 'Replaces', isNegative: false },
  superseded_by: { label: 'Replaced by', isNegative: true },
  substitute_for: { label: 'Substitute for', isNegative: false },
}

type PillTone = 'moisture' | 'bal' | 'fire' | 'acoustic' | 'structural' | 'australian' | 'colourways'
  | 'custom0' | 'custom1' | 'custom2' | 'custom3' | 'custom4'

const CUSTOM_TONES: PillTone[] = ['custom0', 'custom1', 'custom2', 'custom3', 'custom4']

export function AttributesInfoReveal({ system }: { system: SystemCardSystem }) {
  const pills: { text: string; tone: PillTone }[] = []
  if (system.moisture_resistant) pills.push({ text: 'Moisture resistant', tone: 'moisture' })
  if (system.bal_rating) pills.push({ text: `BAL ${system.bal_rating}`, tone: 'bal' })
  if (system.fire_rating) pills.push({ text: `FRL ${system.fire_rating}`, tone: 'fire' })
  if (system.acoustic_rating) pills.push({ text: system.acoustic_rating, tone: 'acoustic' })
  if (system.structural_grade) pills.push({ text: system.structural_grade, tone: 'structural' })
  if (system.australian_made) pills.push({ text: 'Australian made', tone: 'australian' })
  if (system.system_colours.length > 0) {
    pills.push({ text: `${system.system_colours.length} colourway${system.system_colours.length !== 1 ? 's' : ''}`, tone: 'colourways' })
  }
  // Cycle through a dedicated palette so custom attributes read as distinct
  // facts, not one uniform grey block.
  system.custom_technical_attributes?.forEach((attr, i) => {
    pills.push({ text: `${attr.label}: ${attr.value}`, tone: CUSTOM_TONES[i % CUSTOM_TONES.length] })
  })

  return (
    <>
      {system.description && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Description</p>
          <div className={styles.specBox}>
            <p className={styles.descriptionText}>{system.description}</p>
          </div>
        </div>
      )}

      {pills.length > 0 && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Performance</p>
          <div className={styles.attributePillRow}>
            {pills.map((p, i) => (
              <span key={`${p.tone}-${i}`} className={styles.attributePill} data-tone={p.tone}>{p.text}</span>
            ))}
          </div>
        </div>
      )}

      {((system.system_relationships && system.system_relationships.length > 0) ||
        (system.negative_constraints && system.negative_constraints.length > 0)) && (
        <div className={styles.specGroup}>
          <p className={styles.specGroupLabel}>Compatibility &amp; Limitations</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {system.negative_constraints?.map((c, i) => (
              <div
                key={`nc-${i}`}
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: 8,
                  border: '1px solid #f1d4c8',
                  background: '#fdf6f3',
                }}
              >
                <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9a3412' }}>
                  {c.kind === 'not_suitable_for' ? 'Not suitable for' : c.kind === 'environmental' ? 'Environmental limit' : 'Limitation'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#1e293b', marginTop: 2, lineHeight: 1.4 }}>{c.value}</div>
                {c.condition && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{c.condition}</div>}
              </div>
            ))}
            {system.system_relationships?.map((r, i) => {
              const meta = REL_LABELS[r.relation] ?? { label: r.relation, isNegative: false }
              return (
                <div
                  key={`rel-${i}`}
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: 8,
                    border: meta.isNegative ? '1px solid #f1d4c8' : '1px solid #d7e5ec',
                    background: meta.isNegative ? '#fdf6f3' : '#f4f8fa',
                  }}
                >
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: meta.isNegative ? '#9a3412' : '#185D7A' }}>
                    {meta.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{r.target_name}</div>
                  {r.reason && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{r.reason}</div>}
                </div>
              )
            })}
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
