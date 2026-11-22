'use client'

// Profile (variant/size) table — design doc §7.3 "Variants & sizes",
// replaces VerificationGrid's Profiles block. Inline add/edit/remove against
// the existing staged_system_profiles actions — no new data layer.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMissingProfile,
  updateProfile,
  removeProfile,
} from '@/lib/studio-manufacturer/verification-actions'
import type { VerificationSystemProfile } from '@/lib/studio-manufacturer/workspace'
import { InlineItemImagePicker } from './InlineItemImagePicker'

const cellStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', fontSize: '0.82rem' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.3rem 0.4rem', border: '1px solid var(--ds-border, #d1d5db)', borderRadius: 4, fontSize: '0.82rem' }

export function VariantsSection({
  systemId, manufacturerId, initialProfiles, websiteUrl,
}: {
  systemId: string
  manufacturerId: string
  initialProfiles: VerificationSystemProfile[]
  websiteUrl?: string | null
}) {
  const router = useRouter()
  const [profiles, setProfiles] = useState(initialProfiles)
  useEffect(() => { setProfiles(initialProfiles) }, [initialProfiles])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pullUrl, setPullUrl] = useState(websiteUrl ?? '')
  const [pulling, setPulling] = useState(false)
  const [pullMsg, setPullMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ profile_name: '', product_code: '', length_mm: '', width_mm: '', thickness_mm: '', uom: '' })

  async function pullPicsFromPage() {
    const trimmed = pullUrl.trim()
    if (!trimmed) return
    setPulling(true)
    setError(null)
    setPullMsg(null)
    try {
      const res = await fetch(`/api/manufacturer/systems/${systemId}/import-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId, url: trimmed, mode: 'item_images', autoExtract: false }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not pull profile pics.'); return }
      const total = (data.profilePicsAdded ?? 0) + (data.componentPicsAdded ?? 0)
      setPullMsg(
        total > 0
          ? `Matched ${data.profilePicsAdded ?? 0} profile pic${data.profilePicsAdded === 1 ? '' : 's'}${data.componentPicsAdded ? ` & ${data.componentPicsAdded} component pic${data.componentPicsAdded === 1 ? '' : 's'}` : ''}.`
          : 'No matching board profile photos were found on that page — you can upload any photo directly using the + Pic box below.',
      )
      if (total > 0) router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPulling(false)
    }
  }

  function patchField(id: string, field: keyof VerificationSystemProfile, value: string) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
    setError(null)
    startTransition(async () => {
      const numeric = field === 'length_mm' || field === 'width_mm' || field === 'height_mm' || field === 'thickness_mm'
      const res = await updateProfile(id, systemId, manufacturerId, {
        [field]: numeric ? (value ? Number(value) : null) : (value || null),
      } as any)
      if (!res.ok) setError(res.error)
    })
  }

  function saveImage(id: string, url: string | null) {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, image_url: url } : p)))
    setError(null)
    startTransition(async () => {
      const res = await updateProfile(id, systemId, manufacturerId, { image_url: url })
      if (!res.ok) setError(res.error)
    })
  }

  function remove(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id))
    startTransition(async () => {
      const res = await removeProfile(id, systemId, manufacturerId)
      if (!res.ok) setError(res.error)
    })
  }

  function addRow() {
    if (!draft.profile_name.trim()) return
    startTransition(async () => {
      const res = await addMissingProfile(systemId, manufacturerId, {
        profile_name: draft.profile_name.trim(),
        product_code: draft.product_code.trim() || undefined,
        length_mm: draft.length_mm ? Number(draft.length_mm) : null,
        width_mm: draft.width_mm ? Number(draft.width_mm) : null,
        thickness_mm: draft.thickness_mm ? Number(draft.thickness_mm) : null,
        uom: draft.uom.trim() || undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setProfiles((prev) => [...prev, {
        id: res.id, profile_name: draft.profile_name.trim(), product_code: draft.product_code || null,
        description: null, dimensions: null,
        length_mm: draft.length_mm ? Number(draft.length_mm) : null,
        width_mm: draft.width_mm ? Number(draft.width_mm) : null,
        height_mm: null,
        thickness_mm: draft.thickness_mm ? Number(draft.thickness_mm) : null,
        uom: draft.uom || null, supplier_pack_qty: null, supplier_pack_uom: null, sort_order: profiles.length,
      }])
      setDraft({ profile_name: '', product_code: '', length_mm: '', width_mm: '', thickness_mm: '', uom: '' })
      setAdding(false)
    })
  }

  return (
    <div>
      {profiles.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="url"
            value={pullUrl}
            onChange={(e) => setPullUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pullPicsFromPage() } }}
            placeholder="Product page URL to pull profile board pics…"
            disabled={pulling}
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            onClick={pullPicsFromPage}
            disabled={pulling || !pullUrl.trim()}
            style={{
              fontSize: '0.76rem', fontWeight: 700, color: '#185D7A',
              background: 'rgba(24,93,122,0.08)', border: '1px solid rgba(24,93,122,0.35)',
              borderRadius: 6, padding: '0.32rem 0.65rem', cursor: pulling || !pullUrl.trim() ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {pulling ? 'Pulling pics…' : '⚡ Pull profile pics from page'}
          </button>
        </div>
      )}
      {pullMsg && <div style={{ fontSize: '0.76rem', color: '#16a34a', marginBottom: '0.5rem', fontWeight: 600 }}>{pullMsg}</div>}
      {profiles.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#185D7A' }}>
                {['Pic', 'Name', 'Product code', 'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'UOM', ''].map((h) => (
                  <th key={h} style={{ ...cellStyle, textAlign: 'left', color: '#fff', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
                  <td style={cellStyle}>
                    <InlineItemImagePicker
                      manufacturerId={manufacturerId}
                      systemId={systemId}
                      label={p.profile_name ?? 'Profile'}
                      value={p.image_url}
                      onSave={(url) => saveImage(p.id, url)}
                    />
                  </td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.profile_name ?? ''} onBlur={(e) => patchField(p.id, 'profile_name', e.target.value)} /></td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.product_code ?? ''} onBlur={(e) => patchField(p.id, 'product_code', e.target.value)} /></td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.length_mm ?? ''} onBlur={(e) => patchField(p.id, 'length_mm', e.target.value)} /></td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.width_mm ?? ''} onBlur={(e) => patchField(p.id, 'width_mm', e.target.value)} /></td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.thickness_mm ?? ''} onBlur={(e) => patchField(p.id, 'thickness_mm', e.target.value)} /></td>
                  <td style={cellStyle}><input style={inputStyle} defaultValue={p.uom ?? ''} onBlur={(e) => patchField(p.id, 'uom', e.target.value)} /></td>
                  <td style={cellStyle}>
                    <button type="button" onClick={() => remove(p.id)} disabled={pending} style={{ fontSize: '0.74rem', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {profiles.length === 0 && !adding && (
        <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint, #9ca3af)', fontStyle: 'italic', padding: '0.6rem 0' }}>No variants yet.</div>
      )}

      {adding ? (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Name" value={draft.profile_name} onChange={(e) => setDraft((d) => ({ ...d, profile_name: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
          <input placeholder="Product code" value={draft.product_code} onChange={(e) => setDraft((d) => ({ ...d, product_code: e.target.value }))} style={{ ...inputStyle, width: 110 }} />
          <input placeholder="Length mm" value={draft.length_mm} onChange={(e) => setDraft((d) => ({ ...d, length_mm: e.target.value }))} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="Width mm" value={draft.width_mm} onChange={(e) => setDraft((d) => ({ ...d, width_mm: e.target.value }))} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="UOM" value={draft.uom} onChange={(e) => setDraft((d) => ({ ...d, uom: e.target.value }))} style={{ ...inputStyle, width: 70 }} />
          <button type="button" onClick={addRow} disabled={pending} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: 'none', background: '#185D7A', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>Add</button>
          <button type="button" onClick={() => setAdding(false)} style={{ padding: '0.35rem 0.7rem', borderRadius: 6, border: '1.5px solid #d1d5db', background: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ marginTop: '0.6rem', fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          + Add variant
        </button>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '0.4rem' }}>{error}</div>}
    </div>
  )
}
