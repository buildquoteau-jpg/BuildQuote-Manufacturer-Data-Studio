'use client'

// Hybrid publishing (Library V7): CMS-style card editor.
//
// Left column: editable sections. Every change autosaves to the Draft
// (debounced, via the same server actions as the Verify-systems grid so the
// field_verifications audit trail is preserved). Right column: live preview
// through the master System Card renderer — exactly what publishes.
//
// Publish is deliberate: the live card only changes when the Publish button
// calls publishCardLive, which snapshots the draft into the production
// published_cards table and refreshes the buildquote.com.au pages.
//
// Structured sub-records (profiles, components, colours) are edited in the
// existing Verify-systems grid for now — this editor links across. The two
// UIs run side by side so they can be compared.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  upsertFieldVerification,
  setInstallGuideUrls,
  setCustomDocumentLinks,
  setGalleryImages,
} from '@/lib/studio-manufacturer/verification-actions'
import { publishCardLive } from '@/lib/studio-manufacturer/publish-live-actions'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import { SystemCardRenderer } from '@/components/system-card-renderer/SystemCardRenderer'
import type { VerificationSystem, ManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
import type { ManufacturerAsset } from '@/lib/studio-manufacturer/assets'
import type { LinkLibraryEntry } from '@/lib/studio-manufacturer/link-library'
import { addLinkLibraryEntry } from '@/lib/studio-manufacturer/link-library-actions'
import { LinkLibraryPicker } from '@/components/studio/LinkLibraryPicker'

type GalleryImage = NonNullable<VerificationSystem['gallery_images']>[number]

type Props = {
  manufacturerId: string
  manufacturer: ManufacturerInfo
  initialSystem: VerificationSystem
  assets: ManufacturerAsset[]
  linkLibrary: LinkLibraryEntry[]
}

const TEXT_FIELDS = [
  { name: 'name', label: 'Card title', required: true },
  { name: 'category', label: 'Category' },
  { name: 'subcategory', label: 'Subcategory' },
] as const

const ATTR_TEXT_FIELDS = [
  { name: 'bal_rating', label: 'BAL rating' },
  { name: 'fire_rating', label: 'Fire rating' },
  { name: 'acoustic_rating', label: 'Acoustic rating' },
  { name: 'structural_grade', label: 'Structural grade' },
] as const

const LINK_FIELDS = [
  { name: 'website_url', label: 'Manufacturer website' },
  { name: 'tech_data_url', label: 'Technical data URL' },
] as const

export function CmsEditor({ manufacturerId, manufacturer, initialSystem, assets, linkLibrary: initialLinkLibrary }: Props) {
  const [system, setSystem] = useState<VerificationSystem>(initialSystem)
  const [linkLibrary, setLinkLibrary] = useState(initialLinkLibrary)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishResult, setPublishResult] = useState<
    | { ok: true; liveUrl: string; version: string; warnings: string[] }
    | { ok: false; error: string }
    | null
  >(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  // ── Autosave plumbing ──────────────────────────────────────────────────────
  const runSave = useCallback((key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setSaveState('saving')
    setSaveError(null)
    const existing = timers.current.get(key)
    if (existing) clearTimeout(existing)
    timers.current.set(key, setTimeout(async () => {
      timers.current.delete(key)
      const res = await fn()
      if (!res.ok) {
        setSaveState('error')
        setSaveError(res.error ?? 'Save failed.')
      } else if (timers.current.size === 0) {
        setSaveState('saved')
      }
    }, 800))
  }, [])

  const saveField = useCallback((fieldName: string, value: string | null) => {
    runSave(fieldName, () =>
      upsertFieldVerification(system.id, manufacturerId, fieldName, null, value, 'edited', null))
  }, [runSave, system.id, manufacturerId])

  function patch(update: Partial<VerificationSystem>) {
    setSystem(prev => ({ ...prev, ...update }))
  }

  // ── Gallery ────────────────────────────────────────────────────────────────
  const gallery: GalleryImage[] = system.gallery_images ?? []

  function saveGallery(next: GalleryImage[]) {
    patch({ gallery_images: next })
    runSave('gallery_images', () => setGalleryImages(system.id, manufacturerId, next))
  }

  function moveImage(from: number, to: number) {
    if (to < 0 || to >= gallery.length) return
    const next = [...gallery]
    const [img] = next.splice(from, 1)
    next.splice(to, 0, img)
    saveGallery(next)
  }

  const imageAssets = useMemo(
    () => assets.filter(a => !a.archived && a.displayUrl && (a.mimeType ?? '').startsWith('image/')),
    [assets],
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  // ── Publish ────────────────────────────────────────────────────────────────
  async function handlePublish() {
    setPublishing(true)
    setPublishResult(null)
    try {
      const res = await publishCardLive(system.id)
      setPublishResult(res)
    } finally {
      setPublishing(false)
    }
  }

  // ── Preview data ───────────────────────────────────────────────────────────
  // Gallery URLs stored on older drafts can be expired presigned links; the
  // preview renders via the permanent asset route (same rewrite publish does).
  const previewSystem = useMemo(() => {
    const adapted = adaptStagedSystem(system, manufacturer)
    adapted.gallery_images = (adapted.gallery_images ?? []).map(img =>
      img.asset_id ? { ...img, url: `/api/assets/${img.asset_id}` } : img)
    return adapted
  }, [system, manufacturer])

  const publishStatus = system.publish_status ?? 'draft'

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        <Link href="/manufacturer/cms" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-muted)', textDecoration: 'none' }}>
          ← All cards
        </Link>
        <h1 style={{ fontSize: '1.15rem', margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {system.name}
        </h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', minWidth: 92, textAlign: 'right' }}>
          {saveState === 'saving' ? 'Saving…'
            : saveState === 'saved' ? 'Saved · just now'
            : saveState === 'error' ? 'Save failed' : ''}
        </span>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing}
          style={{
            padding: '9px 22px', borderRadius: 8, border: 'none',
            background: '#16a34a', color: '#fff', fontSize: '0.86rem', fontWeight: 800,
            cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.6 : 1,
          }}
        >
          {publishing ? 'Publishing…'
            : publishStatus === 'draft' ? 'Publish to library'
            : 'Publish update'}
        </button>
      </div>

      {saveError && <div className="studio-warn" style={{ marginBottom: '1rem' }}>Autosave failed: {saveError}</div>}

      {publishResult && (
        publishResult.ok ? (
          <div className="studio-info" style={{ marginBottom: '1rem' }}>
            Published v{publishResult.version} —{' '}
            <a href={publishResult.liveUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
              view the live card ↗
            </a>
            {publishResult.warnings.length > 0 && (
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
                {publishResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        ) : (
          <div className="studio-warn" style={{ marginBottom: '1rem' }}>Publish failed: {publishResult.error}</div>
        )
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(340px, 480px)', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Editor column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          <Section title="Basics">
            {TEXT_FIELDS.map(f => (
              <Field key={f.name} label={f.label}>
                <input
                  value={(system[f.name] as string | null) ?? ''}
                  onChange={e => { patch({ [f.name]: e.target.value } as Partial<VerificationSystem>); saveField(f.name, e.target.value) }}
                  style={inputStyle}
                />
              </Field>
            ))}
            <Field label="Description">
              <textarea
                value={system.description ?? ''}
                rows={4}
                onChange={e => { patch({ description: e.target.value }); saveField('description', e.target.value) }}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>
          </Section>

          <Section
            title={`Gallery (${gallery.length}/10)`}
            hint="Swipeable hero images on the live card. The first image is the cover — it appears on tiles and in SMS/WhatsApp/email share previews."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {gallery.map((img, i) => (
                <div key={`${img.url}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.45rem 0.6rem',
                }}>
                  {/* Thumbnail via the permanent asset route when linked —
                      older entries may hold expired presigned URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.asset_id ? `/api/assets/${img.asset_id}` : img.url} alt="" style={{ width: 64, height: 42, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      value={img.alt}
                      placeholder="Alt text (required)"
                      onChange={e => {
                        const next = gallery.map((g, j) => j === i ? { ...g, alt: e.target.value } : g)
                        saveGallery(next)
                      }}
                      style={{ ...inputStyle, padding: '5px 8px', fontSize: '0.78rem' }}
                    />
                    {i === 0 && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#f97316' }}>Cover / share image</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <IconButton label="Move up" onClick={() => moveImage(i, i - 1)} disabled={i === 0}>↑</IconButton>
                    <IconButton label="Move down" onClick={() => moveImage(i, i + 1)} disabled={i === gallery.length - 1}>↓</IconButton>
                    <IconButton label="Remove" onClick={() => saveGallery(gallery.filter((_, j) => j !== i))}>✕</IconButton>
                  </div>
                </div>
              ))}

              {gallery.length < 10 && (
                <button type="button" onClick={() => setPickerOpen(o => !o)} style={{
                  padding: '9px 12px', borderRadius: 8, border: '1.5px dashed var(--ds-border)',
                  background: 'transparent', color: 'var(--ds-text-muted)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                }}>
                  {pickerOpen ? 'Close asset picker' : '+ Add image from your Assets'}
                </button>
              )}

              {pickerOpen && (
                imageAssets.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
                    No images in your asset library yet — upload them on the{' '}
                    <Link href="/manufacturer/assets" style={{ fontWeight: 700 }}>Assets page</Link> first.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '0.5rem' }}>
                    {imageAssets.map(a => {
                      const inGallery = gallery.some(g => g.asset_id === a.id || g.url === (a.publicUrl ?? a.displayUrl))
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={inGallery}
                          title={a.title ?? undefined}
                          onClick={() => {
                            // Never store displayUrl (presigned, expires in an
                            // hour) — use the permanent public asset route.
                            const url = a.publicUrl ?? `${window.location.origin}/api/assets/${a.id}`
                            saveGallery([...gallery, {
                              asset_id: a.id,
                              url,
                              og_jpg_url: /\.jpe?g(\?|#|$)/i.test(url) ? url : null,
                              alt: a.altText ?? a.title ?? system.name,
                              caption: a.caption ?? null,
                            }])
                            if (gallery.length + 1 >= 10) setPickerOpen(false)
                          }}
                          style={{
                            position: 'relative', padding: 0, border: '1px solid var(--ds-border)', borderRadius: 6,
                            overflow: 'hidden', cursor: inGallery ? 'default' : 'pointer', opacity: inGallery ? 0.35 : 1,
                            background: 'transparent',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.displayUrl!} alt={a.altText ?? ''} style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
                        </button>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          </Section>

          <Section title="Links & guides">
            {LINK_FIELDS.map(f => (
              <Field key={f.name} label={f.label}>
                <input
                  value={(system[f.name] as string | null) ?? ''}
                  placeholder="https://…"
                  onChange={e => { patch({ [f.name]: e.target.value } as Partial<VerificationSystem>); saveField(f.name, e.target.value) }}
                  style={inputStyle}
                />
              </Field>
            ))}
            <Field label="Design guide URL">
              <input
                value={system.design_guide_url ?? ''}
                placeholder="https://…"
                onChange={e => {
                  patch({ design_guide_url: e.target.value })
                  runSave('design_guide_url', () =>
                    upsertFieldVerification(system.id, manufacturerId, 'design_guide_url', null, e.target.value, 'edited', null))
                }}
                style={inputStyle}
              />
            </Field>
            <InstallGuidesField
              guides={system.install_guide_urls ?? []}
              onChange={guides => {
                patch({ install_guide_urls: guides })
                runSave('install_guide_urls', () => setInstallGuideUrls(system.id, manufacturerId, guides))
              }}
            />
            <CustomDocumentsField
              links={system.custom_document_links ?? []}
              onChange={links => {
                patch({ custom_document_links: links })
                runSave('custom_document_links', () => setCustomDocumentLinks(system.id, manufacturerId, links))
              }}
              manufacturerId={manufacturerId}
              linkLibrary={linkLibrary}
              onLibraryAdd={entry => setLinkLibrary(prev => [entry, ...prev])}
            />
          </Section>

          <Section title="Profiles, components & colours">
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', margin: 0, lineHeight: 1.6 }}>
              {system.profiles.length} profile{system.profiles.length !== 1 ? 's' : ''} ·{' '}
              {system.components.length} component{system.components.length !== 1 ? 's' : ''} ·{' '}
              {system.colours.length} colour{system.colours.length !== 1 ? 's' : ''}.
              Structured rows are edited in{' '}
              <Link href="/manufacturer/review" style={{ fontWeight: 700 }}>Verify systems</Link>{' '}
              for now — changes made there flow straight into this draft.
            </p>
          </Section>
        </div>

        {/* ── Live preview column ── */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ds-text-faint)', marginBottom: '0.5rem' }}>
            Live preview — exactly what publishes
          </div>
          <SystemCardRenderer system={previewSystem} />
        </div>
      </div>
    </div>
  )
}

// ── Small building blocks ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-surface, rgba(255,255,255,0.04))',
  color: 'inherit', fontSize: '0.85rem', outline: 'none',
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{
      border: '1px solid var(--ds-border)', borderRadius: 10,
      padding: '1rem 1.1rem 1.1rem',
      background: 'var(--ds-surface, rgba(255,255,255,0.02))',
    }}>
      <h2 style={{ fontSize: '0.92rem', margin: '0 0 0.35rem' }}>{title}</h2>
      {hint && <p style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint)', margin: '0 0 0.8rem', lineHeight: 1.55 }}>{hint}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '0.84rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function IconButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26, height: 26, borderRadius: 6, border: '1px solid var(--ds-border)',
        background: 'transparent', color: 'inherit', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1, fontSize: '0.8rem', lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}

function InstallGuidesField({
  guides,
  onChange,
}: {
  guides: { label: string; url: string }[]
  onChange: (guides: { label: string; url: string }[]) => void
}) {
  return (
    <div>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', marginBottom: 4 }}>
        Installation guides
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {guides.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <input
              value={g.label}
              placeholder="Label (e.g. Timber frame)"
              onChange={e => onChange(guides.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              style={{ ...inputStyle, flex: '0 0 38%' }}
            />
            <input
              value={g.url}
              placeholder="https://…"
              onChange={e => onChange(guides.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <IconButton label="Remove guide" onClick={() => onChange(guides.filter((_, j) => j !== i))}>✕</IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...guides, { label: '', url: '' }])}
          style={{
            alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7,
            border: '1.5px dashed var(--ds-border)', background: 'transparent',
            color: 'var(--ds-text-muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add installation guide
        </button>
      </div>
    </div>
  )
}

// Arbitrary named documents (energy ratings, sustainability reports, warranty
// PDFs…). Same shape as install guides, but the title is required — it becomes
// the button text on the card.
function CustomDocumentsField({
  links,
  onChange,
  manufacturerId,
  linkLibrary,
  onLibraryAdd,
}: {
  links: { label: string; url: string }[]
  onChange: (links: { label: string; url: string }[]) => void
  manufacturerId: string
  linkLibrary: LinkLibraryEntry[]
  onLibraryAdd: (entry: LinkLibraryEntry) => void
}) {
  function handleAttachFromLibrary(entry: LinkLibraryEntry) {
    if (links.some(l => l.url === entry.url)) return
    onChange([...links, { label: entry.label, url: entry.url }])
  }

  return (
    <div>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ds-text-muted)', marginBottom: 4 }}>
        Additional documents
      </div>
      {linkLibrary.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <LinkLibraryPicker library={linkLibrary} onAttach={handleAttachFromLibrary} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {links.map((g, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <input
              value={g.label}
              placeholder="Button title (e.g. Energy rating)"
              onChange={e => onChange(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
              style={{ ...inputStyle, flex: '0 0 38%' }}
            />
            <input
              value={g.url}
              placeholder="https://… (PDF or web page)"
              onChange={e => onChange(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
              style={{ ...inputStyle, flex: 1 }}
            />
            {g.label.trim() && g.url.trim() && (
              <IconButton
                label="Save to link library for reuse on other systems"
                onClick={() => {
                  addLinkLibraryEntry(manufacturerId, g.label, g.url).then(res => {
                    if (res.ok) onLibraryAdd(res.entry)
                  })
                }}
              >★</IconButton>
            )}
            <IconButton label="Remove document" onClick={() => onChange(links.filter((_, j) => j !== i))}>✕</IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...links, { label: '', url: '' }])}
          style={{
            alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 7,
            border: '1.5px dashed var(--ds-border)', background: 'transparent',
            color: 'var(--ds-text-muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add document
        </button>
      </div>
    </div>
  )
}
