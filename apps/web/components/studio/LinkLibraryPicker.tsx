'use client'

// Small "attach an existing link" dropdown used inside the custom-document
// editors (Verify systems + System Cards). Manufacturer link library is
// managed on the Assets tab — this just lets you quickly reuse an entry
// instead of retyping the same URL on every system.

import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'

export function LinkLibraryPicker({
  library,
  onAttach,
  disabled,
}: {
  library: LinkLibraryEntry[]
  onAttach: (entry: LinkLibraryEntry) => void
  disabled?: boolean
}) {
  if (library.length === 0) return null
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(e) => {
        const entry = library.find((l) => l.id === e.target.value)
        e.target.value = ''
        if (entry) onAttach(entry)
      }}
      style={{
        fontSize: '0.74rem', padding: '4px 6px', borderRadius: 6,
        border: '1.5px solid #185D7A', color: '#185D7A', fontWeight: 700,
        fontFamily: 'inherit', background: '#eef6fa', cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <option value="">+ Add from library…</option>
      {library.map((l) => (
        <option key={l.id} value={l.id}>{l.label}</option>
      ))}
    </select>
  )
}
