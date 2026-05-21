'use client'

import { useState } from 'react'
import type { MouseEvent } from 'react'

// ─── Data types ───────────────────────────────────────────────────────────────

export interface SystemProfile {
  product_code: string | null
  profile_name: string
  dimensions: string | null
  length_mm: number | null
  height_mm: number | null
  width_mm: number | null
  thickness_mm: number | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
}

export interface SystemComponent {
  sku: string | null
  name: string
  description: string | null
  category: string | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number | null
}

export interface SystemColour {
  colour_name: string
  sku_suffix: string | null
  is_stocked: boolean | null
}

export interface SystemCardData {
  name: string
  manufacturer_name: string
  category: string | null
  subcategory: string | null
  description: string | null
  hero_image_url: string | null
  bal_rating: string | null
  fire_rating: string | null
  moisture_resistant: boolean | null
  acoustic_rating: string | null
  structural_grade: string | null
  australian_made: boolean | null
  notes: string | null
  source_url: string | null
  profiles: SystemProfile[]
  components: SystemComponent[]
  colours: SystemColour[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDims(p: SystemProfile): string {
  const parts: string[] = []
  if (p.length_mm)  parts.push(`${p.length_mm}mm`)
  if (p.width_mm)   parts.push(`${p.width_mm}mm`)
  if (p.height_mm && !p.length_mm) parts.push(`${p.height_mm}mm`)
  if (p.thickness_mm) parts.push(`${p.thickness_mm}mm`)
  return parts.join(' × ')
}

function fmtUom(uom: string | null): string {
  if (!uom) return ''
  const map: Record<string, string> = {
    sheet: 'SHEET', roll: 'ROLL', ea: 'EACH', each: 'EACH', lm: 'LIN.M',
    m2: 'M²', kg: 'KG', box: 'BOX', pack: 'PACK', length: 'LENGTH', set: 'SET',
  }
  return map[uom.toLowerCase()] ?? uom.toUpperCase()
}

function formatGroupKey(key: string): string {
  return /^\d+(\.\d+)?$/.test(key) ? `${key}mm` : key
}

function extractNums(s: string): number[] {
  return (s.match(/\d+(?:\.\d+)?/g) || []).map(Number)
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      width: '22px', height: '22px', borderRadius: '6px',
      background: checked ? '#185D7A' : '#fff',
      border: `2px solid ${checked ? '#185D7A' : '#d1d5db'}`,
    }}>
      {checked && (
        <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
          <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  )
}

// ─── Profile grouping ─────────────────────────────────────────────────────────

type ProfileGroupItem = { label: string; profile: SystemProfile; idx: number }
type ProfileGroup     = { key: string; items: ProfileGroupItem[] }

function groupProfiles(profiles: SystemProfile[]): ProfileGroup[] {
  if (profiles.length === 0) return []

  const names     = profiles.map(p => p.profile_name.trim())
  const tokenized = names.map(n => n.split(/\s+/))
  const maxLen    = Math.max(...tokenized.map(t => t.length))

  // Strategy 1: " — " separator
  if (names.some(n => n.includes(' — '))) {
    const map = new Map<string, ProfileGroupItem[]>()
    for (let i = 0; i < profiles.length; i++) {
      const sep   = names[i].indexOf(' — ')
      const key   = sep !== -1 ? names[i].slice(0, sep) : ''
      const label = sep !== -1 ? names[i].slice(sep + 3) : names[i]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ label, profile: profiles[i], idx: i })
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }

  function buildMap(fromEnd: boolean, n: number) {
    const map = new Map<string, ProfileGroupItem[]>()
    for (let i = 0; i < profiles.length; i++) {
      const t = tokenized[i]; const len = t.length
      let key: string, label: string
      if (fromEnd) {
        key   = t.slice(Math.max(0, len - n)).join(' ')
        label = t.slice(0, Math.max(0, len - n)).join(' ').replace(/\s*[x×]\s*$/, '').trim() || names[i]
      } else {
        key   = t.slice(0, n).join(' ')
        label = t.slice(n).join(' ') || names[i]
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ label, profile: profiles[i], idx: i })
    }
    return map
  }

  function findMinN(fromEnd: boolean): number {
    for (let n = 1; n < maxLen; n++) {
      const counts = new Map<string, number>()
      for (const t of tokenized) {
        const k = fromEnd ? t.slice(Math.max(0, t.length - n)).join(' ') : t.slice(0, n).join(' ')
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      if (Array.from(counts.values()).some(c => c > 1)) return n
    }
    return 0
  }

  // Strategy 2: min-N prefix vs suffix — prefer whichever gives fewer groups
  const prefixN = findMinN(false)
  const suffixN = findMinN(true)
  const prefixMap = prefixN > 0 ? buildMap(false, prefixN) : null
  const suffixMap = suffixN > 0 ? buildMap(true,  suffixN) : null

  let chosen: Map<string, ProfileGroupItem[]> | null = null
  if (prefixMap && suffixMap) {
    chosen = suffixMap.size < prefixMap.size ? suffixMap : prefixMap
  } else {
    chosen = prefixMap ?? suffixMap
  }

  if (chosen) return Array.from(chosen.entries()).map(([key, items]) => ({ key, items }))

  // Strategy 3: single flat group
  return [{ key: '', items: profiles.map((p, i) => ({ label: names[i], profile: p, idx: i })) }]
}

// ─── Colours section ──────────────────────────────────────────────────────────

function ColoursSection({ colours }: { colours: SystemColour[] }) {
  if (colours.length === 0) return null
  return (
    <div style={{ marginTop: '1.75rem' }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#334155',
        marginBottom: '0.75rem',
      }}>
        Colours &amp; finishes
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {colours.map((c, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.7rem', background: 'var(--ds-page-bg)',
            border: '1px solid var(--ds-border)', borderRadius: 99,
            fontSize: '0.82rem', color: 'var(--ds-text-sub)',
          }}>
            <span>{c.colour_name}</span>
            {c.sku_suffix && (
              <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)', fontFamily: 'monospace' }}>
                {c.sku_suffix}
              </span>
            )}
            {c.is_stocked === false && (
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--ds-text-faint)' }}>EOI</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Profile row ──────────────────────────────────────────────────────────────

function ProfileRow({
  label, profile, idx, selected, onToggle,
}: {
  label: string
  profile: SystemProfile
  idx: number
  selected: Set<number>
  onToggle: (idx: number) => void
}) {
  const isSel = selected.has(idx)
  const dims  = fmtDims(profile)
  const uom   = fmtUom(profile.uom)
  const sku   = profile.product_code

  const labelNums     = extractNums(label)
  const dimsNums      = extractNums(dims)
  const labelOverlaps = labelNums.length > 0 && labelNums.every((n, i) => dimsNums[i] === n)

  return labelOverlaps ? (
    <button
      type="button"
      onClick={() => onToggle(idx)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '10px', width: '100%', textAlign: 'left',
        padding: '9px 12px',
        background: isSel ? '#eef6fa' : '#f9fafb',
        border: `1.5px solid ${isSel ? '#185D7A' : '#e5e7eb'}`,
        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: isSel ? 700 : 600, color: isSel ? '#0f2d3d' : '#111827' }}>
          {dims}
        </span>
        {uom && (
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: isSel ? '#185D7A' : '#6b7280' }}>
            {uom}
          </span>
        )}
        {sku && (
          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4b5563', background: isSel ? '#d4ecf5' : '#f3f4f6', padding: '1px 5px', borderRadius: '4px' }}>
            {sku}
          </span>
        )}
      </div>
      <Checkbox checked={isSel} />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => onToggle(idx)}
      style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '10px', width: '100%', textAlign: 'left',
        padding: '9px 12px',
        background: isSel ? '#eef6fa' : '#f9fafb',
        border: `1.5px solid ${isSel ? '#185D7A' : '#e5e7eb'}`,
        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: isSel ? 700 : 600, color: isSel ? '#0f2d3d' : '#111827', lineHeight: 1.3 }}>
          {label}
        </div>
        {(dims || uom || sku) && (
          <div style={{ marginTop: '3px', fontSize: '12px', color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {dims && <span>{dims}</span>}
            {uom && <span style={{ fontWeight: 700, letterSpacing: '0.05em', color: isSel ? '#185D7A' : '#6b7280' }}>{uom}</span>}
            {sku && <span style={{ fontFamily: 'monospace', background: isSel ? '#d4ecf5' : '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>{sku}</span>}
          </div>
        )}
      </div>
      <Checkbox checked={isSel} />
    </button>
  )
}

// ─── Profile group block ──────────────────────────────────────────────────────

function ProfileGroupBlock({
  groupKey, systemName, showSystemName, items, defaultOpen, selected, onToggle,
}: {
  groupKey: string
  systemName: string
  showSystemName: boolean
  items: ProfileGroupItem[]
  defaultOpen: boolean
  selected: Set<number>
  onToggle: (idx: number) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!groupKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(({ label, profile, idx }) => (
          <ProfileRow key={idx} label={label} profile={profile} idx={idx} selected={selected} onToggle={onToggle} />
        ))}
      </div>
    )
  }

  const fmtKey     = formatGroupKey(groupKey)
  const displayKey = showSystemName ? `${systemName} ${fmtKey}` : fmtKey

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 0 8px', textAlign: 'left', minHeight: '44px',
        }}
      >
        <span style={{
          fontSize: '13px', fontWeight: 700, color: '#111827',
          paddingLeft: '10px', borderLeft: '3px solid #185D7A',
          marginRight: '6px',
        }}>
          {displayKey}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#185D7A', flexShrink: 0 }}>
          {open ? '▲' : `▼ ${items.length}`}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '4px' }}>
          {items.map(({ label, profile, idx }) => (
            <ProfileRow key={idx} label={label} profile={profile} idx={idx} selected={selected} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Profiles section ─────────────────────────────────────────────────────────

function ProfilesSection({
  profiles, systemName, selected, onToggle,
}: {
  profiles: SystemProfile[]
  systemName: string
  selected: Set<number>
  onToggle: (idx: number) => void
}) {
  if (profiles.length === 0) return null
  const groups      = groupProfiles(profiles)
  const defaultOpen = profiles.length <= 3
  const multiGroup  = groups.length > 1
  const useHeaders  = multiGroup || !defaultOpen

  return (
    <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0' }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: '#334155',
        marginBottom: '0.75rem',
      }}>
        Profiles · {profiles.length} variant{profiles.length !== 1 ? 's' : ''}
      </div>
      {/* Static system name header for single-group cards so name travels to RFQ */}
      {!multiGroup && (
        <div style={{
          fontSize: '13px', fontWeight: 700, color: '#111827',
          paddingLeft: '10px', borderLeft: '3px solid #185D7A',
          marginBottom: '8px',
        }}>
          {!useHeaders && groups[0]?.key
            ? `${systemName} ${formatGroupKey(groups[0].key)}`
            : systemName}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {!useHeaders ? (
          groups.flatMap(({ items }) => items).map(({ label, profile, idx }) => (
            <ProfileRow key={idx} label={label} profile={profile} idx={idx} selected={selected} onToggle={onToggle} />
          ))
        ) : (
          groups.map(({ key, items }) => (
            <ProfileGroupBlock
              key={key || '__all__'}
              groupKey={key}
              systemName={systemName}
              showSystemName={multiGroup}
              items={items}
              defaultOpen={defaultOpen}
              selected={selected}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Components section ───────────────────────────────────────────────────────

function ComponentsSection({
  components, selected, onToggle,
}: {
  components: SystemComponent[]
  selected: Set<number>
  onToggle: (idx: number) => void
}) {
  const [open, setOpen] = useState(false)
  if (components.length === 0) return null

  return (
    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', cursor: 'pointer', textAlign: 'left',
          background: '#eef6fa', border: '1.5px solid #b8d9e8',
          borderRadius: '10px', padding: '12px 14px', minHeight: '48px',
        }}
      >
        <span style={{
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: '#185D7A',
        }}>
          Accessories &amp; Components · {components.length}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#185D7A', flexShrink: 0, marginLeft: '8px' }}>
          {open ? '▲ Hide' : '▼ Show'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {components.map((c, i) => {
            const isSel = selected.has(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(i)}
                style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: '10px', width: '100%', textAlign: 'left',
                  padding: '12px 12px',
                  background: isSel ? '#eef6fa' : '#f9fafb',
                  border: `1.5px solid ${isSel ? '#185D7A' : '#e5e7eb'}`,
                  borderRadius: '10px', cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px', fontWeight: isSel ? 700 : 600,
                    color: isSel ? '#0f2d3d' : '#111827', lineHeight: 1.3,
                  }}>
                    {c.name}
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                    {c.description && (
                      <span style={{ fontSize: '12px', color: '#4b5563', lineHeight: 1.4 }}>{c.description}</span>
                    )}
                    {c.sku && (
                      <span style={{
                        fontSize: '11px', fontFamily: 'monospace', color: '#4b5563',
                        background: isSel ? '#d4ecf5' : '#f3f4f6',
                        padding: '1px 5px', borderRadius: '4px',
                      }}>
                        {c.sku}
                      </span>
                    )}
                  </div>
                </div>
                <Checkbox checked={isSel} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Attribute pills ──────────────────────────────────────────────────────────

function AttributePills({ systemName, balRating, fireRating, moistureResistant, acousticRating, structuralGrade, australianMade, notes }: {
  systemName: string
  balRating: string | null
  fireRating: string | null
  moistureResistant: boolean | null
  acousticRating: string | null
  structuralGrade: string | null
  australianMade: boolean | null
  notes: string | null
}) {
  const badges: { label: string; bg: string; color: string }[] = []

  if (balRating)         badges.push({ label: balRating,                    bg: '#fff7ed', color: '#c2410c' })
  if (fireRating)        badges.push({ label: `FRL ${fireRating}`,          bg: '#fef2f2', color: '#b91c1c' })
  if (moistureResistant) badges.push({ label: 'Moisture resistant',         bg: '#f0f9ff', color: '#0369a1' })
  if (acousticRating)    badges.push({ label: acousticRating,               bg: '#faf5ff', color: '#7e22ce' })
  if (structuralGrade)   badges.push({ label: structuralGrade,              bg: '#f0fdf4', color: '#15803d' })
  if (australianMade)    badges.push({ label: 'Australian made',            bg: '#f0fdf4', color: '#166534' })
  if (notes?.toLowerCase().includes('primed') || notes?.toLowerCase().includes('site paint'))
    badges.push({ label: 'Pre-primed / site painted',                       bg: '#f8fafc', color: '#475569' })

  if (badges.length === 0) return null
  return (
    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {badges.map((b, i) => (
          <span key={i} style={{
            display: 'inline-block',
            padding: '0.2rem 0.6rem',
            borderRadius: 99,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            background: b.bg,
            color: b.color,
            border: `1px solid ${b.color}33`,
          }}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroArea({ imageUrl, manufacturerName, name, category, subcategory }: {
  imageUrl: string | null
  manufacturerName: string
  name: string
  category: string | null
  subcategory: string | null
}) {
  return (
    <div className="sc-hero" style={{ borderRadius: '10px 10px 0 0', background: imageUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)' }}>
      {imageUrl && <img src={imageUrl} alt={name} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,30,45,0.85) 0%, rgba(15,30,45,0.2) 60%, transparent 100%)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '1rem 1.25rem 1.1rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', marginBottom: '0.3rem' }}>
          {manufacturerName}
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
          {name}
        </h2>
        {(category || subcategory) && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
            {[category, subcategory].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export function SystemCard({ data }: { data: SystemCardData }) {
  const [selectedProfiles,   setSelectedProfiles]   = useState<Set<number>>(new Set())
  const [selectedComponents, setSelectedComponents] = useState<Set<number>>(new Set())

  function toggleProfile(idx: number) {
    setSelectedProfiles(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }
  function toggleComponent(idx: number) {
    setSelectedComponents(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  return (
    <div className="sc-card">
      <HeroArea
        imageUrl={data.hero_image_url}
        manufacturerName={data.manufacturer_name}
        name={data.name}
        category={data.category}
        subcategory={data.subcategory}
      />

      <div className="sc-body">
        {data.description && (
          <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-sub)', lineHeight: 1.6, margin: 0 }}>
            {data.description}
          </p>
        )}

        <ColoursSection colours={data.colours} />

        <ProfilesSection
          profiles={data.profiles}
          systemName={data.name}
          selected={selectedProfiles}
          onToggle={toggleProfile}
        />

        <ComponentsSection
          components={data.components}
          selected={selectedComponents}
          onToggle={toggleComponent}
        />

        <AttributePills
          systemName={data.name}
          balRating={data.bal_rating}
          fireRating={data.fire_rating}
          moistureResistant={data.moisture_resistant}
          acousticRating={data.acoustic_rating}
          structuralGrade={data.structural_grade}
          australianMade={data.australian_made}
          notes={data.notes}
        />

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="#"
            className="studio-btn studio-btn-primary"
            style={{ fontSize: '0.875rem' }}
            onClick={(e: MouseEvent) => e.preventDefault()}
          >
            Add selected items to a Request for Quotation
          </a>
          {data.source_url ? (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="studio-btn studio-btn-ghost"
              style={{ fontSize: '0.875rem' }}
            >
              View {data.name} at {data.manufacturer_name}
            </a>
          ) : (
            <span
              className="studio-btn studio-btn-ghost"
              style={{ fontSize: '0.875rem', opacity: 0.4, cursor: 'not-allowed' }}
            >
              View {data.name} at {data.manufacturer_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
