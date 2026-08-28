'use client'

// Links & resources — design doc addendum 3 §C5 step 2. Lifted out of the
// legacy CmsEditor.tsx's CustomDocumentsField (that component and its
// InstallGuidesField sibling still live there, untouched, since CmsEditor is
// unreachable behind the workspace-redesign flag — this is a clean rebuild,
// not a refactor-in-place). Same underlying data — staged_systems.
// custom_document_links, a flat jsonb array — but every entry now carries a
// `type` tag ("your product page" vs. "web guides") per the user's own
// framing, and reuses the existing manufacturer-wide link library so a
// decking calculator or warranty page doesn't need retyping on every system.

import { useRef, useState } from 'react'
import { setCustomDocumentLinks, type CustomDocumentLink } from '@/lib/studio-manufacturer/verification-actions'
import { addLinkLibraryEntry } from '@/lib/studio-manufacturer/link-library-actions'
import { LinkLibraryPicker } from '@/components/studio/LinkLibraryPicker'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

const LINK_TYPES: { value: NonNullable<CustomDocumentLink['type']>; label: string }[] = [
  { value: 'product_page', label: 'Your product page' },
  { value: 'web_guide', label: 'Web guide' },
]

export function LinksSection({
  systemId,
  manufacturerId,
  initialLinks,
  linkLibrary,
  onChanged,
}: {
  systemId: string
  manufacturerId: string
  initialLinks: CustomDocumentLink[]
  linkLibrary: LinkLibraryEntry[]
  onChanged?: (count: number) => void
}) {
  const [links, setLinks] = useState<CustomDocumentLink[]>(initialLinks)
  const [library, setLibrary] = useState(linkLibrary)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function save(next: CustomDocumentLink[]) {
    setLinks(next)
    onChanged?.(next.filter((l) => l.label.trim() && l.url.trim()).length)
    setSaveState('saving')
    setError(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      timer.current = null
      const res = await setCustomDocumentLinks(systemId, manufacturerId, next)
      if (!res.ok) {
        setSaveState('error')
        setError(res.error ?? 'Save failed.')
      } else {
        setSaveState('saved')
      }
    }, 800)
  }

  function update(i: number, patch: Partial<CustomDocumentLink>) {
    save(links.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  function remove(i: number) {
    save(links.filter((_, j) => j !== i))
  }

  function add() {
    save([...links, { label: '', url: '', type: 'web_guide' }])
  }

  function attachFromLibrary(entry: LinkLibraryEntry) {
    if (links.some((l) => l.url === entry.url)) return
    save([...links, { label: entry.label, url: entry.url, type: 'web_guide' }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', margin: 0, lineHeight: 1.55 }}>
        Add your own product page, plus any web guides — datasheets, energy
        ratings, sustainability reports, warranty pages — that should link
        from this system&apos;s card.
      </p>

      {library.length > 0 && (
        <div>
          <LinkLibraryPicker library={library} onAttach={attachFromLibrary} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {links.map((link, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={link.type ?? 'web_guide'}
              onChange={(e) => update(i, { type: e.target.value as CustomDocumentLink['type'] })}
              style={{ ...inputStyle, flex: '0 0 150px' }}
            >
              {LINK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              value={link.label}
              placeholder="Button title (e.g. Energy rating)"
              onChange={(e) => update(i, { label: e.target.value })}
              style={{ ...inputStyle, flex: '0 0 28%' }}
            />
            <input
              value={link.url}
              placeholder="https://…"
              onChange={(e) => update(i, { url: e.target.value })}
              style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
            />
            {link.label.trim() && link.url.trim() && (
              <IconButton
                label="Save to link library for reuse on other systems"
                onClick={() => {
                  addLinkLibraryEntry(manufacturerId, link.label, link.url).then((res) => {
                    if (res.ok) setLibrary((prev) => [res.entry, ...prev])
                  })
                }}
              >
                ★
              </IconButton>
            )}
            <IconButton label="Remove link" onClick={() => remove(i)}>✕</IconButton>
          </div>
        ))}
        <button type="button" onClick={add} style={addButtonStyle}>
          + Add a link
        </button>
      </div>

      <div style={{ fontSize: '0.72rem', color: saveState === 'error' ? '#dc2626' : 'var(--ds-text-faint)' }}>
        {saveState === 'saving' && 'Saving…'}
        {saveState === 'saved' && 'Saved.'}
        {saveState === 'error' && (error ?? 'Save failed.')}
      </div>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 6, border: '1px solid var(--ds-border)',
        background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-surface, rgba(255,255,255,0.04))',
  color: 'inherit', fontSize: '0.85rem', outline: 'none',
}

const addButtonStyle: React.CSSProperties = {
  alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7,
  border: '1.5px dashed var(--ds-border)', background: 'transparent',
  color: 'var(--ds-text-muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
}
