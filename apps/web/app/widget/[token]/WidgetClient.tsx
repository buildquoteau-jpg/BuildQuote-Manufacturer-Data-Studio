'use client'

import { useState, useEffect } from 'react'
import type { WidgetSystem, WidgetComponent, WidgetProfile, WidgetColour, WidgetButtonConfig } from '@/lib/data/getWidgetData'
import { DEFAULT_BUTTON_CONFIG } from '@/lib/data/getWidgetData'
import { SystemCardTile, CATEGORY_COLOURS } from '@/components/ui/SystemCardTile'

// ── Types ──────────────────────────────────────────────────────────────────

type SelectedItem = {
  item_id: string   // profile UUID, colour_name, or component ID
  type: 'profile' | 'colour' | 'component'
  label: string
  dims: string
  uom: string
  product_code: string | null
  quantity: number  // default 1, editable in quote form
  details: string   // free-text: custom dims, colour spec, notes
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDims(p: WidgetProfile): string {
  const parts: string[] = []
  if (p.length_mm) parts.push(`${p.length_mm}mm`)
  if (p.width_mm)  parts.push(`${p.width_mm}mm`)
  if (p.height_mm && !p.length_mm) parts.push(`${p.height_mm}mm`)
  if (p.thickness_mm) parts.push(`${p.thickness_mm}mm`)
  return parts.join(' × ')
}

function fmtUom(uom: string | null): string {
  if (!uom) return ''
  const map: Record<string, string> = {
    sheet: 'SHEET', roll: 'ROLL', ea: 'EACH', each: 'EACH',
    lm: 'LIN.M', m2: 'M²', kg: 'KG', box: 'BOX', pack: 'PACK', length: 'LENGTH',
  }
  return map[uom.toLowerCase()] ?? uom.toUpperCase()
}

// ── Checkbox ───────────────────────────────────────────────────────────────

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

// ── Profile grouping ───────────────────────────────────────────────────────

function formatGroupKey(key: string): string {
  return /^\d+(\.\d+)?$/.test(key) ? `${key}mm` : key
}

type ProfileGroup = { key: string; items: { label: string; profile: WidgetProfile }[] }

function groupProfiles(profiles: WidgetProfile[]): ProfileGroup[] {
  if (profiles.length === 0) return []
  const names     = profiles.map(p => (p.profile_name || p.name || '').trim())
  const tokenized = names.map(n => n.split(/\s+/))
  const maxLen    = Math.max(...tokenized.map(t => t.length))

  if (names.some(n => n.includes(' — '))) {
    const map = new Map<string, { label: string; profile: WidgetProfile }[]>()
    for (let i = 0; i < profiles.length; i++) {
      const sep   = names[i].indexOf(' — ')
      const key   = sep !== -1 ? names[i].slice(0, sep) : ''
      const label = sep !== -1 ? names[i].slice(sep + 3) : names[i]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ label, profile: profiles[i] })
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }

  function buildMap(fromEnd: boolean, n: number) {
    const map = new Map<string, { label: string; profile: WidgetProfile }[]>()
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
      map.get(key)!.push({ label, profile: profiles[i] })
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

  const prefixN   = findMinN(false)
  const suffixN   = findMinN(true)
  const prefixMap = prefixN > 0 ? buildMap(false, prefixN) : null
  const suffixMap = suffixN > 0 ? buildMap(true,  suffixN) : null

  let chosen: Map<string, { label: string; profile: WidgetProfile }[]> | null = null
  if (prefixMap && suffixMap) {
    chosen = suffixMap.size < prefixMap.size ? suffixMap : prefixMap
  } else {
    chosen = prefixMap ?? suffixMap
  }

  if (chosen) return Array.from(chosen.entries()).map(([key, items]) => ({ key, items }))
  return [{ key: '', items: profiles.map((p, i) => ({ label: names[i], profile: p })) }]
}

// ── Colours section ────────────────────────────────────────────────────────

function ColoursSection({
  colours, selectable, selectedNames, onToggle,
}: {
  colours: WidgetColour[]
  selectable?: boolean
  selectedNames?: Set<string>
  onToggle?: (name: string) => void
}) {
  if (colours.length === 0) return null
  return (
    <div style={{ marginTop: '14px' }}>
      {selectable && (
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '8px' }}>
          Colours
          {selectedNames && selectedNames.size > 0 && (
            <span style={{ marginLeft: '8px', color: '#185D7A' }}>{selectedNames.size} selected</span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {colours.map((c, i) => {
          const isSelected = selectedNames?.has(c.colour_name)
          const chipStyle: React.CSSProperties = {
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            fontSize: '13px', fontWeight: 500,
            background: isSelected ? '#eef6fa' : '#f8fafc',
            color: isSelected ? '#185D7A' : '#374151',
            border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? '#185D7A' : '#e2e8f0'}`,
            padding: c.image_url ? '4px 10px 4px 4px' : '5px 12px',
            borderRadius: '20px', lineHeight: 1.4,
            cursor: selectable ? 'pointer' : 'default',
            transition: 'background 0.1s, border-color 0.1s',
          }
          const inner = (
            <>
              {c.image_url && (
                <span style={{
                  display: 'inline-block', width: '20px', height: '20px',
                  borderRadius: '50%', flexShrink: 0,
                  background: `url(${c.image_url}) center/cover`,
                  border: '1px solid rgba(0,0,0,0.1)',
                }} />
              )}
              {c.colour_name}
              {isSelected && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M1 4.5L4 7.5L10 1" stroke="#185D7A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {c.is_stocked === false && !isSelected && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af' }}>EOI</span>
              )}
            </>
          )
          return selectable ? (
            <button key={i} type="button" onClick={() => onToggle?.(c.colour_name)} style={chipStyle}>{inner}</button>
          ) : (
            <span key={i} style={chipStyle}>{inner}</span>
          )
        })}
      </div>
    </div>
  )
}

// ── Profile row ────────────────────────────────────────────────────────────

function ProfileRow({
  label, profile,
  selectable, selected, onToggle,
}: {
  label: string
  profile: WidgetProfile
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const dims = fmtDims(profile)
  const uom  = fmtUom(profile.uom)
  const sku  = profile.product_code

  function extractNums(s: string) { return (s.match(/\d+(?:\.\d+)?/g) || []).map(Number) }
  const labelNums     = extractNums(label)
  const dimsNums      = extractNums(dims)
  const labelOverlaps = labelNums.length > 0 && labelNums.every((n, i) => dimsNums[i] === n)

  const baseStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
    padding: '8px 12px',
    background: selected ? '#eef6fa' : '#f9fafb',
    border: `1px solid ${selected ? '#b6dcea' : '#e5e7eb'}`,
    borderRadius: '10px',
    cursor: selectable ? 'pointer' : 'default',
    textAlign: 'left',
    transition: 'background 0.1s, border-color 0.1s',
  }

  const content = labelOverlaps ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{dims}</span>
      {uom && <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#6b7280' }}>{uom}</span>}
      {sku && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '1px 5px', borderRadius: '4px' }}>{sku}</span>}
    </span>
  ) : (
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{label}</span>
      {(dims || uom || sku) && (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '3px' }}>
          {dims && <span style={{ fontSize: '12px', color: '#6b7280' }}>{dims}</span>}
          {uom && <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: '#6b7280' }}>{uom}</span>}
          {sku && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '1px 4px', borderRadius: '3px' }}>{sku}</span>}
        </span>
      )}
    </span>
  )

  if (selectable) {
    return (
      <button type="button" onClick={onToggle} style={baseStyle}>
        {content}
        <Checkbox checked={!!selected} />
      </button>
    )
  }

  return <div style={baseStyle}>{content}</div>
}

// ── Profile group (collapsible) ────────────────────────────────────────────

function ProfileGroupBlock({
  groupKey, systemName, showSystemName, items, defaultOpen,
  selectable, selectedIds, onToggle,
}: {
  groupKey: string
  systemName: string
  showSystemName: boolean
  items: { label: string; profile: WidgetProfile }[]
  defaultOpen: boolean
  selectable?: boolean
  selectedIds?: Set<string>
  onToggle?: (profileId: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!groupKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(({ label, profile }) => (
          <ProfileRow
            key={profile.id}
            label={label}
            profile={profile}
            selectable={selectable}
            selected={selectedIds?.has(profile.id)}
            onToggle={() => onToggle?.(profile.id)}
          />
        ))}
      </div>
    )
  }

  const fmtKey     = formatGroupKey(groupKey)
  const displayKey = showSystemName ? `${systemName} ${fmtKey}` : fmtKey
  const groupSelectedCount = selectable
    ? items.filter(({ profile }) => selectedIds?.has(profile.id)).length
    : 0

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
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#111827', paddingLeft: '10px', borderLeft: '3px solid #185D7A', marginRight: '6px' }}>
          {displayKey}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#185D7A', flexShrink: 0 }}>
          {open
            ? '▲'
            : `▼ ${items.length}${selectable && groupSelectedCount > 0 ? ` · ${groupSelectedCount} selected` : ''}`
          }
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingBottom: '4px' }}>
          {items.map(({ label, profile }) => (
            <ProfileRow
              key={profile.id}
              label={label}
              profile={profile}
              selectable={selectable}
              selected={selectedIds?.has(profile.id)}
              onToggle={() => onToggle?.(profile.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Profiles section ───────────────────────────────────────────────────────

function ProfilesSection({
  profiles, systemName,
  selectable, selectedIds, onToggle,
}: {
  profiles: WidgetProfile[]
  systemName: string
  selectable?: boolean
  selectedIds?: Set<string>
  onToggle?: (profileId: string) => void
}) {
  if (profiles.length === 0) return null
  const groups      = groupProfiles(profiles)
  const defaultOpen = profiles.length <= 3
  const multiGroup  = groups.length > 1
  const useHeaders  = multiGroup || !defaultOpen

  return (
    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '10px' }}>
        Profiles · {profiles.length} variant{profiles.length !== 1 ? 's' : ''}
        {selectable && selectedIds && selectedIds.size > 0 && (
          <span style={{ marginLeft: '8px', color: '#185D7A' }}>{selectedIds.size} selected</span>
        )}

      </div>
      {!multiGroup && (
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', paddingLeft: '10px', borderLeft: '3px solid #185D7A', marginBottom: '8px' }}>
          {!useHeaders && groups[0]?.key ? `${systemName} ${formatGroupKey(groups[0].key)}` : systemName}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {!useHeaders
          ? groups.flatMap(({ items }) => items).map(({ label, profile }) => (
              <ProfileRow
                key={profile.id}
                label={label}
                profile={profile}
                selectable={selectable}
                selected={selectedIds?.has(profile.id)}
                onToggle={() => onToggle?.(profile.id)}
              />
            ))
          : groups.map(({ key, items }) => (
              <ProfileGroupBlock
                key={key || '__all__'}
                groupKey={key}
                systemName={systemName}
                showSystemName={multiGroup}
                items={items}
                defaultOpen={defaultOpen}
                selectable={selectable}
                selectedIds={selectedIds}
                onToggle={onToggle}
              />
            ))
        }
      </div>
    </div>
  )
}

// ── Attribute pills ────────────────────────────────────────────────────────

function AttributePills({ system }: { system: WidgetSystem }) {
  const pills: { label: string; bg: string; text: string; border: string }[] = []
  if (system.moisture_resistant)
    pills.push({ label: 'Moisture Resistant', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' })
  if (system.bal_rating)
    pills.push({ label: system.bal_rating, bg: '#fffbeb', text: '#b45309', border: '#fde68a' })
  if (system.fire_rating)
    pills.push({ label: `FRL ${system.fire_rating}`, bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' })
  if (system.acoustic_rating)
    pills.push({ label: system.acoustic_rating, bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff' })
  if (system.structural_grade)
    pills.push({ label: system.structural_grade, bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' })
  if (system.australian_made)
    pills.push({ label: 'Australian Made', bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' })
  if (system.double_sided)
    pills.push({ label: 'Double Sided', bg: '#f9fafb', text: '#374151', border: '#d1d5db' })
  if (system.notes?.toLowerCase().includes('primed') || system.notes?.toLowerCase().includes('site paint'))
    pills.push({ label: 'Pre-primed / site painted', bg: '#f8fafc', text: '#475569', border: '#cbd5e1' })
  if (pills.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
      {pills.map((p, i) => (
        <span key={i} style={{
          fontSize: '12px', fontWeight: 600,
          background: p.bg, color: p.text, border: `1px solid ${p.border}`,
          padding: '5px 12px', borderRadius: '20px', lineHeight: 1.4,
        }}>
          {p.label}
        </span>
      ))}
    </div>
  )
}

// ── Components accordion ───────────────────────────────────────────────────

function ComponentsAccordion({
  components, selectable, selectedIds, onToggle,
}: {
  components: WidgetComponent[]
  selectable?: boolean
  selectedIds?: Set<string>
  onToggle?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const visible = components.filter(c => c.components)
  if (visible.length === 0) return null
  const selectedCount = selectable ? visible.filter(item => selectedIds?.has(item.id)).length : 0

  return (
    <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
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
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#185D7A' }}>
          Accessories &amp; Components · {visible.length}
          {selectable && selectedCount > 0 && (
            <span style={{ marginLeft: '8px', fontWeight: 700, color: '#185D7A', textTransform: 'none', letterSpacing: 0 }}>· {selectedCount} selected</span>
          )}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#185D7A', flexShrink: 0, marginLeft: '8px' }}>
          {open ? '▲ Hide' : '▼ Show'}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visible.map((item) => {
            const comp = item.components!
            const uom  = fmtUom(comp.uom)
            const isSelected = selectedIds?.has(item.id)

            const inner = (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.35 }}>{comp.name}</div>
                    {item.notes && <div style={{ marginTop: '3px', fontSize: '12px', color: '#4b5563', lineHeight: 1.4 }}>{item.notes}</div>}
                    {comp.description && !item.notes && <div style={{ marginTop: '3px', fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>{comp.description}</div>}
                    <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                      {comp.sku && <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{comp.sku}</span>}
                      {uom && <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#9ca3af' }}>{uom}</span>}
                    </div>
                  </div>
                  {selectable && <Checkbox checked={!!isSelected} />}
                </div>
              </>
            )

            return selectable ? (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle?.(item.id)}
                style={{
                  padding: '11px 12px', textAlign: 'left', width: '100%',
                  background: isSelected ? '#eef6fa' : '#f9fafb',
                  border: `${isSelected ? '1.5px' : '1px'} solid ${isSelected ? '#b6dcea' : '#e5e7eb'}`,
                  borderRadius: '10px', cursor: 'pointer',
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                {inner}
              </button>
            ) : (
              <div key={item.id} style={{ padding: '11px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                {inner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── System Detail Modal ────────────────────────────────────────────────────

function SystemDetailModal({
  system, onClose, manufacturerName,
  onEnquiry, onQuote, onStockist, buttonConfig,
}: {
  system: WidgetSystem
  onClose: () => void
  manufacturerName?: string
  onEnquiry: () => void
  onQuote: (items: SelectedItem[]) => void
  onStockist: () => void
  buttonConfig: WidgetButtonConfig
}) {
  const _catRaw = CATEGORY_COLOURS[system.category] ?? { bg: '#f3f4f6', color: '#374151' }
  const [selectedProfileIds,   setSelectedProfileIds]   = useState<Set<string>>(new Set())
  const [selectedColourNames,  setSelectedColourNames]  = useState<Set<string>>(new Set())
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(new Set())

  const showQuote    = buttonConfig.show_request_quote
  const hasProfiles  = system.system_profiles.length > 0
  const hasColours   = system.system_colours.length > 0
  const hasComponents = system.system_components.some(c => c.components)
  const hasSelectable = hasProfiles || hasColours || hasComponents
  const selectedCount = selectedProfileIds.size + selectedColourNames.size + selectedComponentIds.size

  function toggle<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function buildSelectedItems(): SelectedItem[] {
    const items: SelectedItem[] = []

    const sysPrefix = system.name

    groupProfiles(system.system_profiles).forEach(({ key, items: g }) => {
      g.filter(({ profile }) => selectedProfileIds.has(profile.id))
        .forEach(({ label, profile }) => {
          const profileLabel = key ? `${key} — ${label}` : label
          items.push({
            item_id: profile.id, type: 'profile',
            label: `${sysPrefix} — ${profileLabel}`,
            dims: fmtDims(profile), uom: fmtUom(profile.uom),
            product_code: profile.product_code ?? null,
            quantity: 1, details: '',
          })
        })
    })

    system.system_colours
      .filter(c => selectedColourNames.has(c.colour_name))
      .forEach(c => items.push({
        item_id: c.colour_name, type: 'colour',
        label: `${sysPrefix} — ${c.colour_name}`,
        dims: '', uom: '', product_code: null,
        quantity: 1, details: '',
      }))

    system.system_components
      .filter(sc => sc.components && selectedComponentIds.has(sc.id))
      .forEach(sc => items.push({
        item_id: sc.id, type: 'component',
        label: `${sysPrefix} — ${sc.components!.name}`,
        dims: '', uom: fmtUom(sc.components!.uom),
        product_code: sc.components!.sku ?? null,
        quantity: 1, details: '',
      }))

    return items
  }

  function handleQuoteClick() {
    onQuote(buildSelectedItems())
  }

  // For systems with no profiles, allow a direct quote click with no items
  function handleSimpleQuoteClick() {
    onQuote([])
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#ffffff', borderRadius: '18px', width: '100%', maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, borderRadius: '18px 18px 0 0' }}>
          {/* Hero */}
          <div style={{ height: '220px', flexShrink: 0, position: 'relative', borderRadius: '18px 18px 0 0', overflow: 'hidden', background: system.hero_image_url ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)' }}>
            {system.hero_image_url && (
              <img src={system.hero_image_url} alt={system.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${system.hero_image_position_x ?? 50}% ${system.hero_image_position_y ?? 50}%` }} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,30,45,0.88) 0%, rgba(15,30,45,0.25) 55%, transparent 100%)' }} />
            <span style={{
              position: 'absolute', top: '14px', left: '14px',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: _catRaw.bg, color: _catRaw.color,
              padding: '4px 10px', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            }}>
              {system.category}
            </span>
            <button
              onClick={onClose}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.45)', border: 'none', cursor: 'pointer', width: '34px', height: '34px', borderRadius: '8px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', lineHeight: 1 }}
              aria-label="Close"
            >×</button>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 18px' }}>
              {manufacturerName && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{manufacturerName}</div>}
              <h2 style={{ margin: 0, color: '#ffffff', fontSize: '22px', fontWeight: 800, lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>{system.name}</h2>
              {system.product_code && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', letterSpacing: '0.04em' }}>{system.product_code}</p>}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 24px 28px', flex: 1 }}>
            {system.description && (
              <p style={{ margin: '0 0 0', fontSize: '14px', color: '#374151', lineHeight: 1.65 }}>{system.description}</p>
            )}

            {showQuote && hasSelectable && (
              <div style={{
                margin: '14px 0 0', padding: '10px 14px',
                background: '#eef6fa', borderLeft: '3px solid #5ba3bf', borderRadius: '0 8px 8px 0',
                fontSize: '12px', fontWeight: 600, color: '#185D7A', lineHeight: 1.5,
              }}>
                Tick the items you need, then tap <strong>&ldquo;Add selected to RFQ&rdquo;</strong> below to request a quote.
              </div>
            )}

            <ColoursSection
              colours={system.system_colours}
              selectable={showQuote && hasColours}
              selectedNames={selectedColourNames}
              onToggle={name => toggle(setSelectedColourNames, name)}
            />
            <ProfilesSection
              profiles={system.system_profiles}
              systemName={system.name}
              selectable={showQuote && hasProfiles}
              selectedIds={selectedProfileIds}
              onToggle={id => toggle(setSelectedProfileIds, id)}
            />
            <ComponentsAccordion
              components={system.system_components}
              selectable={showQuote && hasComponents}
              selectedIds={selectedComponentIds}
              onToggle={id => toggle(setSelectedComponentIds, id)}
            />
            <AttributePills system={system} />

            {/* Action links */}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(system.install_guide_urls ?? []).map((guide, i) => (
                <a
                  key={i}
                  href={guide.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px 16px', fontSize: '14px', fontWeight: 600, color: '#185D7A', background: '#eef6fa', border: '1.5px solid #b6dcea', borderRadius: '10px', textDecoration: 'none', boxSizing: 'border-box' as const }}
                >
                  {guide.label}
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2V8" stroke="#185D7A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              ))}
              {system.design_guide_url && (
                <a
                  href={system.design_guide_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px 16px', fontSize: '14px', fontWeight: 600, color: '#185D7A', background: '#eef6fa', border: '1.5px solid #b6dcea', borderRadius: '10px', textDecoration: 'none', boxSizing: 'border-box' as const }}
                >
                  Design Guide
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2V8" stroke="#185D7A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              )}
              {system.website_url && (
                <a
                  href={system.website_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px 16px', fontSize: '14px', fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1.5px solid #d1d5db', borderRadius: '10px', textDecoration: 'none', boxSizing: 'border-box' as const }}
                >
                  View on {manufacturerName ?? 'manufacturer'} website
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M10 2H4M10 2V8" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </a>
              )}

              {/* Action buttons — shown only when no profiles, or no selection mode */}
              {(showQuote && !hasSelectable || buttonConfig.show_find_stockist) && (
                <div style={{ marginTop: '6px', display: 'grid', gridTemplateColumns: (showQuote && !hasSelectable) && buttonConfig.show_find_stockist ? '1fr 1fr' : '1fr', gap: '8px' }}>
                  {showQuote && !hasSelectable && (
                    <button
                      onClick={handleSimpleQuoteClick}
                      style={{ padding: '13px 10px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', lineHeight: 1.3 }}
                    >
                      Request a Quote
                    </button>
                  )}
                  {buttonConfig.show_find_stockist && (
                    <button
                      onClick={onStockist}
                      style={{ padding: '13px 10px', background: '#fff', color: '#185D7A', border: '1.5px solid #185D7A', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', lineHeight: 1.3 }}
                    >
                      Find a Stockist
                    </button>
                  )}
                </div>
              )}
              {buttonConfig.show_general_enquiry && (
                <button
                  onClick={onEnquiry}
                  style={{ padding: '11px 16px', background: '#f8fafc', color: '#374151', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', width: '100%' }}
                >
                  General Enquiry
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sticky footer — appears when any items are selected */}
        {showQuote && hasSelectable && selectedCount > 0 && (
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
            borderRadius: '0 0 18px 18px',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <button
              onClick={handleQuoteClick}
              style={{
                flex: 1, padding: '13px 20px', background: '#185D7A', color: '#fff',
                border: 'none', borderRadius: '10px',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', letterSpacing: '-0.01em',
              }}
            >
              Add {selectedCount} selected to RFQ →
            </button>
            {buttonConfig.show_find_stockist && (
              <button
                onClick={onStockist}
                style={{ padding: '13px 16px', background: '#fff', color: '#185D7A', border: '1.5px solid #185D7A', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Find a Stockist
              </button>
            )}
          </div>
        )}

        {/* Placeholder footer when quote is enabled but nothing selected yet */}
        {showQuote && hasSelectable && selectedCount === 0 && (
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid #e5e7eb',
            background: '#f9fafb',
            borderRadius: '0 0 18px 18px',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <button
              disabled
              style={{
                flex: 1, padding: '13px 20px', background: '#5ba3bf', color: '#fff',
                border: 'none', borderRadius: '10px',
                fontSize: '15px', fontWeight: 700, cursor: 'default',
                whiteSpace: 'nowrap', letterSpacing: '-0.01em', opacity: 0.75,
              }}
            >
              Add selected to RFQ →
            </button>
            {buttonConfig.show_find_stockist && (
              <button
                onClick={onStockist}
                style={{ padding: '13px 16px', background: '#fff', color: '#185D7A', border: '1.5px solid #185D7A', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Find a Stockist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Quote Request Modal ────────────────────────────────────────────────────

function QuoteRequestModal({
  system, widgetToken, preselectedItems, onClose,
}: {
  system: WidgetSystem
  widgetToken: string
  preselectedItems: SelectedItem[]
  onClose: () => void
}) {
  const [editableItems, setEditableItems] = useState<SelectedItem[]>(() =>
    preselectedItems.map(item => ({ ...item, quantity: item.quantity ?? 1, details: item.details ?? '' }))
  )
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [postcode,    setPostcode]    = useState('')
  const [projectType, setProjectType] = useState('')
  const [timeline,    setTimeline]    = useState('')
  const [message,     setMessage]     = useState('')
  const [status,      setStatus]      = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  function updateItem(idx: number, patch: Partial<SelectedItem>) {
    setEditableItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/widget/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:          widgetToken,
          system_id:      system.id,
          system_name:    system.name,
          selected_items: editableItems,
          name, email, phone,
          postcode:     postcode || null,
          project_type: projectType || null,
          timeline:     timeline || null,
          message:      message || null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '11px 12px', fontSize: '14px', borderRadius: '9px',
    border: '1.5px solid #d1d5db', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: '#fff', color: '#111827',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px',
  }
  const segmentStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 8px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', border: 'none', textAlign: 'center',
    background: active ? '#185D7A' : '#f9fafb',
    color: active ? '#fff' : '#6b7280',
    transition: 'background 0.12s, color 0.12s',
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Request a Quote</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>{system.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#9ca3af', lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {status === 'sent' ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Quote request sent!</div>
            <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#6b7280' }}>
              We&apos;ll review your request and be in touch shortly.
            </p>
            <button onClick={onClose} style={{ marginTop: '20px', padding: '10px 24px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Selected items (editable) */}
            {editableItems.length > 0 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '10px' }}>
                  Your selection · {editableItems.length} item{editableItems.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {editableItems.map((item, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Item identity row */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{item.label}</span>
                        {item.dims && <span style={{ fontSize: '12px', color: '#6b7280' }}>{item.dims}</span>}
                        {item.uom && <span style={{ fontSize: '11px', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.04em' }}>{item.uom}</span>}
                        {item.product_code && (
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#4b5563', background: '#f3f4f6', padding: '1px 5px', borderRadius: '3px' }}>{item.product_code}</span>
                        )}
                      </div>
                      {/* Qty + details row */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>Qty</span>
                          <input
                            type="number" min={1} value={item.quantity}
                            onChange={e => updateItem(i, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                            style={{ width: '60px', padding: '5px 8px', fontSize: '13px', fontWeight: 600, border: '1.5px solid #d1d5db', borderRadius: '6px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                          />
                        </div>
                        <input
                          type="text"
                          value={item.details}
                          onChange={e => updateItem(i, { details: e.target.value })}
                          placeholder={item.type === 'profile' ? 'Custom dimensions or notes…' : item.type === 'colour' ? 'Colour specification or notes…' : 'Notes…'}
                          style={{ flex: 1, padding: '5px 10px', fontSize: '13px', border: '1.5px solid #d1d5db', borderRadius: '6px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#111827', background: '#fff' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact fields */}
            <div>
              <label style={labelStyle}>Name *</label>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone *</label>
              <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone number" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Postcode</label>
              <input
                type="text" inputMode="numeric" value={postcode}
                onChange={e => setPostcode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Optional" maxLength={4} style={{ ...fieldStyle, maxWidth: '120px' }}
              />
            </div>

            {/* Project type */}
            <div>
              <label style={labelStyle}>Project type</label>
              <div style={{ display: 'flex', border: '1.5px solid #d1d5db', borderRadius: '9px', overflow: 'hidden' }}>
                {([['residential', 'Residential'], ['commercial', 'Commercial'], ['other', 'Other']] as const).map(([val, lbl]) => (
                  <button
                    key={val} type="button"
                    onClick={() => setProjectType(projectType === val ? '' : val)}
                    style={{
                      ...segmentStyle(projectType === val),
                      borderRight: val !== 'other' ? '1px solid #d1d5db' : 'none',
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div>
              <label style={labelStyle}>Timeline</label>
              <div style={{ display: 'flex', border: '1.5px solid #d1d5db', borderRadius: '9px', overflow: 'hidden' }}>
                {([['asap', 'ASAP'], ['1-3months', '1–3 months'], ['planning', 'Just planning']] as const).map(([val, lbl]) => (
                  <button
                    key={val} type="button"
                    onClick={() => setTimeline(timeline === val ? '' : val)}
                    style={{
                      ...segmentStyle(timeline === val),
                      borderRight: val !== 'planning' ? '1px solid #d1d5db' : 'none',
                      fontSize: '12px',
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Project details, quantities, delivery requirements…"
                rows={3}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            {status === 'error' && (
              <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>Something went wrong — please try again.</p>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                padding: '13px', background: '#185D7A', color: '#fff',
                border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700,
                cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                opacity: status === 'sending' ? 0.7 : 1,
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send Quote Request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Enquiry modal ──────────────────────────────────────────────────────────

function EnquiryModal({ system, widgetToken, onClose }: {
  system: WidgetSystem
  widgetToken: string
  onClose: () => void
}) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [phone,   setPhone]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch('/api/widget/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: widgetToken,
          system_id:    system.id,
          system_name:  system.name,
          product_code: system.product_code,
          name, email, phone, message, type: 'enquiry',
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '11px 12px', fontSize: '14px', borderRadius: '9px',
    border: '1.5px solid #d1d5db', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: '#fff', color: '#111827',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>General Enquiry</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>{system.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#9ca3af', lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {status === 'sent' ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Enquiry sent!</div>
            <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#6b7280' }}>We&apos;ll be in touch shortly.</p>
            <button onClick={onClose} style={{ marginTop: '20px', padding: '10px 24px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Optional" style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={4}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: '96px' }}
              />
            </div>
            {status === 'error' && (
              <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>Something went wrong — please try again.</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              style={{ padding: '13px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: status === 'sending' ? 'not-allowed' : 'pointer', opacity: status === 'sending' ? 0.7 : 1 }}
            >
              {status === 'sending' ? 'Sending…' : 'Send Enquiry'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Stockist finder modal ──────────────────────────────────────────────────

type Stockist = {
  id: string
  name: string
  suburb: string | null
  state: string | null
  address: string | null
  phone: string | null
  email: string | null
  website_url: string | null
  google_maps_url: string | null
  opening_hours: string | null
}

function StockistModal({ system, widgetToken, onClose, onEnquiry }: {
  system: WidgetSystem
  widgetToken: string
  onClose: () => void
  onEnquiry: () => void
}) {
  const [postcode,  setPostcode]  = useState('')
  const [state,     setState]     = useState('')
  const [stockists, setStockists] = useState<Stockist[] | null>(null)
  const [direct,    setDirect]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [searched,  setSearched]  = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const params = new URLSearchParams({
        token:     widgetToken,
        system_id: system.id,
        postcode:  postcode.trim(),
        state:     state.trim(),
      })
      const res  = await fetch(`/api/widget/stockists?${params}`)
      const data = await res.json()
      setStockists(data.stockists ?? [])
      setDirect(data.direct ?? false)
    } catch {
      setStockists([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const AUS_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT']

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '18px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>Find a Local Stockist</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>{system.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#9ca3af', lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        <form onSubmit={handleSearch} style={{ padding: '20px 24px 0', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            value={postcode}
            onChange={e => setPostcode(e.target.value)}
            placeholder="Postcode"
            maxLength={4}
            style={{ flex: '1 1 100px', padding: '11px 12px', fontSize: '14px', borderRadius: '9px', border: '1.5px solid #d1d5db', outline: 'none', fontFamily: 'inherit' }}
          />
          <select
            value={state}
            onChange={e => setState(e.target.value)}
            style={{ flex: '1 1 100px', padding: '11px 12px', fontSize: '14px', borderRadius: '9px', border: '1.5px solid #d1d5db', outline: 'none', fontFamily: 'inherit', background: '#fff', color: state ? '#111827' : '#9ca3af' }}
          >
            <option value="">All states</option>
            {AUS_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="submit"
            style={{ flex: '1 1 120px', padding: '11px 16px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div style={{ padding: '16px 24px 24px' }}>
          {!searched && !loading && (
            <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>
              Enter your postcode to find stockists near you.
            </p>
          )}

          {searched && direct && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                This product is available direct — no local stockist required.
              </div>
              <button
                onClick={() => { onClose(); onEnquiry() }}
                style={{ padding: '11px 20px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              >
                Request a Quote
              </button>
            </div>
          )}

          {searched && !direct && stockists !== null && stockists.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                No stockists found in that area.
              </div>
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280' }}>Try a different postcode or state, or contact us directly.</p>
              <button
                onClick={() => { onClose(); onEnquiry() }}
                style={{ padding: '11px 20px', background: '#185D7A', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              >
                General Enquiry
              </button>
            </div>
          )}

          {searched && stockists && stockists.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              {stockists.map(s => (
                <div key={s.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{s.name}</div>
                  {s.address && <div style={{ marginTop: '3px', fontSize: '13px', color: '#6b7280' }}>{s.address}</div>}
                  {(!s.address && (s.suburb || s.state)) && (
                    <div style={{ marginTop: '3px', fontSize: '13px', color: '#6b7280' }}>
                      {[s.suburb, s.state].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {s.opening_hours && <div style={{ marginTop: '4px', fontSize: '12px', color: '#9ca3af' }}>{s.opening_hours}</div>}
                  <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {s.phone && (
                      <a href={`tel:${s.phone}`} style={{ fontSize: '13px', fontWeight: 600, color: '#185D7A', textDecoration: 'none', background: '#eef6fa', border: '1px solid #b6dcea', padding: '6px 12px', borderRadius: '8px' }}>
                        {s.phone}
                      </a>
                    )}
                    {s.email && (
                      <a href={`mailto:${s.email}`} style={{ fontSize: '13px', fontWeight: 600, color: '#185D7A', textDecoration: 'none', background: '#eef6fa', border: '1px solid #b6dcea', padding: '6px 12px', borderRadius: '8px' }}>
                        Email
                      </a>
                    )}
                    {s.google_maps_url && (
                      <a href={s.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: '#374151', textDecoration: 'none', background: '#f3f4f6', border: '1px solid #d1d5db', padding: '6px 12px', borderRadius: '8px' }}>
                        Directions
                      </a>
                    )}
                    {s.website_url && (
                      <a href={s.website_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', fontWeight: 600, color: '#374151', textDecoration: 'none', background: '#f3f4f6', border: '1px solid #d1d5db', padding: '6px 12px', borderRadius: '8px' }}>
                        Website
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function WidgetClient({
  systems, manufacturerName, widgetToken, buttonConfig: buttonConfigProp,
}: {
  systems: WidgetSystem[]
  manufacturerName?: string
  widgetToken: string
  buttonConfig?: WidgetButtonConfig | null
}) {
  const buttonConfig = buttonConfigProp ?? DEFAULT_BUTTON_CONFIG
  const [openSystem,   setOpenSystem]   = useState<WidgetSystem | null>(null)
  const [activeSystem, setActiveSystem] = useState<WidgetSystem | null>(null)
  const [showEnquiry,  setShowEnquiry]  = useState(false)
  const [showStockist, setShowStockist] = useState(false)
  const [showRfqForm,  setShowRfqForm]  = useState(false)
  const [rfqItems,     setRfqItems]     = useState<SelectedItem[]>([])

  function openEnquiry(system: WidgetSystem) {
    setActiveSystem(system)
    setOpenSystem(null)
    setShowEnquiry(true)
  }

  function openStockist(system: WidgetSystem) {
    setActiveSystem(system)
    setOpenSystem(null)
    setShowStockist(true)
  }

  function openRfqForm(system: WidgetSystem, items: SelectedItem[]) {
    setActiveSystem(system)
    setRfqItems(items)
    setOpenSystem(null)
    setShowRfqForm(true)
  }

  function closeAll() {
    setShowEnquiry(false)
    setShowStockist(false)
    setShowRfqForm(false)
    setActiveSystem(null)
    setRfqItems([])
  }

  const modalSystem = activeSystem ?? systems[0]

  return (
    <>
      <style>{`
        .widget-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 560px) { .widget-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); } }
      `}</style>

      <div className="widget-grid">
        {systems.map((system) => (
          <SystemCardTile
            key={system.id}
            system={system}
            onClick={() => setOpenSystem(system)}
          />
        ))}
      </div>

      {openSystem && (
        <SystemDetailModal
          system={openSystem}
          manufacturerName={manufacturerName}
          onClose={() => setOpenSystem(null)}
          onEnquiry={() => openEnquiry(openSystem)}
          onQuote={(items) => openRfqForm(openSystem, items)}
          onStockist={() => openStockist(openSystem)}
          buttonConfig={buttonConfig}
        />
      )}

      {showEnquiry && modalSystem && (
        <EnquiryModal
          system={modalSystem}
          widgetToken={widgetToken}
          onClose={closeAll}
        />
      )}

      {showRfqForm && modalSystem && (
        <QuoteRequestModal
          system={modalSystem}
          widgetToken={widgetToken}
          preselectedItems={rfqItems}
          onClose={closeAll}
        />
      )}

      {showStockist && modalSystem && (
        <StockistModal
          system={modalSystem}
          widgetToken={widgetToken}
          onClose={closeAll}
          onEnquiry={() => { setShowStockist(false); setShowEnquiry(true) }}
        />
      )}
    </>
  )
}
