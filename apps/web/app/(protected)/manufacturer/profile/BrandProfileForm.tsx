'use client'

import { useState, useTransition } from 'react'
import { saveBrandProfile, type BrandProfileFields } from '@/lib/studio-manufacturer/brand-actions'
import { AssetSlotControl, type SlotAsset, type SlotPick } from './AssetSlotControl'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.7rem',
  border: '1.5px solid var(--ds-border)',
  borderRadius: 8,
  fontSize: '0.875rem',
  color: 'var(--ds-text)',
  background: '#fff',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <label style={{
        display: 'block',
        fontSize: '0.78rem',
        fontWeight: 700,
        color: 'var(--ds-text-sub)',
        marginBottom: '0.3rem',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function ImagePreview({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <img
        src={url}
        alt={alt}
        style={{
          maxHeight: '80px',
          maxWidth: '100%',
          borderRadius: '6px',
          border: '1px solid var(--ds-border)',
          objectFit: 'contain',
          background: '#f8fafc',
        }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

// A framed preview block with a label and an optional caption.
function PreviewFrame({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--ds-border-soft)',
      borderRadius: 10,
      background: '#f8fafc',
      padding: '0.9rem 1rem 0.85rem',
      marginBottom: '1.1rem',
    }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ds-text-faint)', marginBottom: '0.6rem' }}>
        {title}
      </div>
      {children}
      {caption && (
        <p style={{ margin: '0.45rem 0 0', fontSize: '0.67rem', color: 'var(--ds-text-faint)' }}>{caption}</p>
      )}
    </div>
  )
}

// Top↔Bottom crop slider used by both images.
function CropSlider({ value, onChange }: { value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
      <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint)', minWidth: '24px' }}>Top</span>
      <input
        type="range" min={0} max={100} step={1}
        value={value} onChange={onChange}
        style={{ flex: 1, accentColor: '#185D7A', cursor: 'pointer' }}
        aria-label="Image vertical position"
      />
      <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint)', minWidth: '44px', textAlign: 'right' }}>Bottom</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', minWidth: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}%
      </span>
    </div>
  )
}

// Full-width banner, a faithful 1:1 reproduction of the live ManufacturerHero
// (app/(protected)/studio/showroom/[id] + the public manufacturer-portal hero):
// same overlay gradient, 14px radius, 56/32/52 padding and typography.
function BannerPreview({ url, positionY, logoUrl, manufacturerName, description, websiteUrl }: {
  url: string
  positionY: number
  logoUrl: string | null
  manufacturerName: string
  description: string | null
  websiteUrl: string | null
}) {
  const showLogo = !!logoUrl
  const heroBg: React.CSSProperties = {
    backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: `center ${positionY}%`,
  }
  return (
    <div style={{ ...heroBg, borderRadius: 14, padding: '56px 32px 52px', textAlign: 'center', overflow: 'hidden' }}>
      {showLogo && (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.93)', borderRadius: 10, padding: '8px 18px', marginBottom: 20 }}>
          <img src={logoUrl!} alt="" style={{ height: 38, objectFit: 'contain', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>
      )}
      <div style={{ fontSize: showLogo ? 22 : 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 10, textShadow: '0 2px 12px rgba(0,0,0,0.4)', lineHeight: 1.1 }}>
        {manufacturerName}
      </div>
      {description && (
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.65, maxWidth: 580, margin: '0 auto 24px', textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}>
          {description}
        </p>
      )}
      {websiteUrl && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 22px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600 }}>
          Visit {manufacturerName} ↗
        </span>
      )}
    </div>
  )
}

// Showroom grid card, matching the live card's 110px-tall hero band.
function CardPreview({ url, positionY, manufacturerName, description }: {
  url: string
  positionY: number
  manufacturerName: string
  description: string | null
}) {
  const cardBg: React.CSSProperties = {
    backgroundImage: `url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: `center ${positionY}%`,
  }
  return (
    <div style={{
      width: 240,
      background: '#fff',
      border: '1.5px solid #e5e7eb',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
    }}>
      <div style={{ ...cardBg, height: 101 }} />
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>
          {manufacturerName}
        </div>
        {description && (
          <div style={{
            fontSize: 12, color: '#6b7280', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
          }}>
            {description}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#185D7A' }}>
          View products
        </div>
      </div>
    </div>
  )
}

export function BrandProfileForm({
  manufacturerId,
  manufacturerName,
  slug,
  initialValues,
  assets = [],
  assetsAvailable = false,
}: {
  manufacturerId: string
  manufacturerName: string
  slug: string
  initialValues: BrandProfileFields
  /** Asset library images for the choose-from-assets pickers. */
  assets?: SlotAsset[]
  /** False when migration 046 isn't applied — hides the asset controls. */
  assetsAvailable?: boolean
}) {
  const [fields, setFields] = useState<BrandProfileFields>({
    description:    initialValues.description    ?? '',
    website_url:    initialValues.website_url    ?? '',
    hero_image_url: initialValues.hero_image_url ?? '',
    hero_image_position_y: initialValues.hero_image_position_y ?? 50,
    hero_wide_image_url: initialValues.hero_wide_image_url ?? '',
    hero_wide_image_position_y: initialValues.hero_wide_image_position_y ?? 50,
    logo_url:       initialValues.logo_url       ?? '',
    phone:          initialValues.phone          ?? '',
    abn:            initialValues.abn            ?? '',
    logo_asset_id:            initialValues.logo_asset_id ?? null,
    hero_image_asset_id:      initialValues.hero_image_asset_id ?? null,
    hero_wide_image_asset_id: initialValues.hero_wide_image_asset_id ?? null,
  })

  // Session-local preview URLs for freshly picked assets whose durable public
  // URL isn't configured (presigned links must not be written to *_url columns).
  const [previewOverrides, setPreviewOverrides] = useState<{
    logo?: string; hero?: string; banner?: string
  }>({})

  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState(false)
  const [pending, startTransition] = useTransition()

  function pickAsset(slot: 'logo' | 'hero' | 'banner') {
    const idKey = slot === 'logo' ? 'logo_asset_id'
      : slot === 'hero' ? 'hero_image_asset_id'
      : 'hero_wide_image_asset_id'
    const urlKey = slot === 'logo' ? 'logo_url'
      : slot === 'hero' ? 'hero_image_url'
      : 'hero_wide_image_url'
    return (pick: SlotPick) => {
      setFields(prev => ({
        ...prev,
        [idKey]: pick.assetId,
        // Only overwrite the legacy URL column with a durable public URL —
        // presigned links expire and must not be persisted.
        ...(pick.publicUrl ? { [urlKey]: pick.publicUrl } : {}),
      }))
      if (pick.displayUrl) {
        setPreviewOverrides(prev => ({ ...prev, [slot]: pick.displayUrl! }))
      }
      setSaved(false)
    }
  }

  function clearAsset(slot: 'logo' | 'hero' | 'banner') {
    const idKey = slot === 'logo' ? 'logo_asset_id'
      : slot === 'hero' ? 'hero_image_asset_id'
      : 'hero_wide_image_asset_id'
    return () => {
      setFields(prev => ({ ...prev, [idKey]: null }))
      setPreviewOverrides(prev => {
        const next = { ...prev }
        delete next[slot]
        return next
      })
      setSaved(false)
    }
  }

  function set(key: keyof BrandProfileFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields(prev => ({ ...prev, [key]: e.target.value }))
      setSaved(false)
    }
  }

  function setPosition(key: 'hero_image_position_y' | 'hero_wide_image_position_y') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setFields(prev => ({ ...prev, [key]: Number(e.target.value) }))
      setSaved(false)
    }
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-navy)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-border)'
  }

  function handleSave() {
    setError(null); setSaved(false); setSyncWarning(false)
    startTransition(async () => {
      const payload: BrandProfileFields = {
        description:    fields.description    || null,
        website_url:    fields.website_url    || null,
        hero_image_url: fields.hero_image_url || null,
        hero_image_position_y: fields.hero_image_position_y,
        hero_wide_image_url: fields.hero_wide_image_url || null,
        hero_wide_image_position_y: fields.hero_wide_image_position_y,
        logo_url:       fields.logo_url       || null,
        phone:          fields.phone          || null,
        abn:            fields.abn            || null,
        logo_asset_id:            fields.logo_asset_id ?? null,
        hero_image_asset_id:      fields.hero_image_asset_id ?? null,
        hero_wide_image_asset_id: fields.hero_wide_image_asset_id ?? null,
      }
      const res = await saveBrandProfile(manufacturerId, payload)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      if (!res.productionSynced) setSyncWarning(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  // Preview URLs prefer the session-local override (freshly picked asset with
  // no durable public URL), then the stored URL field.
  const logoPreviewUrl = previewOverrides.logo || fields.logo_url || null
  const heroPreviewUrl = previewOverrides.hero || fields.hero_image_url || null
  const widePreviewUrl = previewOverrides.banner || fields.hero_wide_image_url || null

  // The full-width banner uses the dedicated wide image when set, otherwise it
  // falls back to the hero image (and its crop position) — matching the live page.
  const bannerUsesWide = !!widePreviewUrl
  const bannerUrl = widePreviewUrl || heroPreviewUrl
  const bannerPositionY = bannerUsesWide ? fields.hero_wide_image_position_y : fields.hero_image_position_y

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

      {/* ── Brand identity ── */}
      <section style={{
        background: '#fff',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 10,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ds-text-faint)',
          marginBottom: '1rem',
        }}>
          Brand identity
        </div>

        <Field
          label="Logo"
          hint="Upload or import your logo — ideally transparent background, horizontal orientation. You can still paste a URL directly."
        >
          <input
            type="url"
            value={fields.logo_url ?? ''}
            onChange={set('logo_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://cdn.yourbrand.com.au/logo.png"
            style={inputStyle}
          />
          {assetsAvailable && (
            <AssetSlotControl
              manufacturerId={manufacturerId}
              uploadAssetType="logo"
              pickerAssetTypes={['logo', 'icon']}
              assets={assets}
              currentAssetId={fields.logo_asset_id ?? null}
              onPick={pickAsset('logo')}
              onClear={clearAsset('logo')}
            />
          )}
          <ImagePreview url={logoPreviewUrl} alt={`${manufacturerName} logo`} />
        </Field>

        <Field
          label="Hero image"
          hint="Your main brand image. Shown on the showroom grid card, and on the full-width page banner unless you add a separate banner image below. Landscape, at least 1200px wide."
        >
          <input
            type="url"
            value={fields.hero_image_url ?? ''}
            onChange={set('hero_image_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://cdn.yourbrand.com.au/hero.jpg"
            style={inputStyle}
          />
          {assetsAvailable && (
            <AssetSlotControl
              manufacturerId={manufacturerId}
              uploadAssetType="brand_hero"
              pickerAssetTypes={['brand_hero', 'banner', 'card_hero', 'product']}
              assets={assets}
              currentAssetId={fields.hero_image_asset_id ?? null}
              onPick={pickAsset('hero')}
              onClear={clearAsset('hero')}
            />
          )}
        </Field>

        {/* Grid card preview + crop (driven by the hero image) */}
        {heroPreviewUrl && (
          <PreviewFrame
            title="Showroom grid card"
            caption="As it appears in the showroom grid. Drag to set which part of the hero image stays in frame."
          >
            <CropSlider value={fields.hero_image_position_y} onChange={setPosition('hero_image_position_y')} />
            <CardPreview
              url={heroPreviewUrl}
              positionY={fields.hero_image_position_y}
              manufacturerName={manufacturerName}
              description={fields.description || null}
            />
          </PreviewFrame>
        )}

        {/* Optional dedicated banner image */}
        <Field
          label="Full-width banner image (optional)"
          hint="Use a wider or different image for the full-width banner at the top of your manufacturer page — handy when your hero image is too tall to crop well. Leave blank to reuse the hero image above."
        >
          <input
            type="url"
            value={fields.hero_wide_image_url ?? ''}
            onChange={set('hero_wide_image_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://cdn.yourbrand.com.au/banner.jpg"
            style={inputStyle}
          />
          {assetsAvailable && (
            <AssetSlotControl
              manufacturerId={manufacturerId}
              uploadAssetType="banner"
              pickerAssetTypes={['banner', 'brand_hero']}
              assets={assets}
              currentAssetId={fields.hero_wide_image_asset_id ?? null}
              onPick={pickAsset('banner')}
              onClear={clearAsset('banner')}
            />
          )}
        </Field>

        {/* Banner preview + crop (wide image when set, else hero fallback) */}
        {bannerUrl && (
          <PreviewFrame
            title="Manufacturer page — full-width banner"
            caption={
              bannerUsesWide
                ? 'Exactly how the banner renders on the manufacturer page (shown at preview width — on the live site it spans the full screen).'
                : 'Currently using your hero image. Add a banner image above to give the full-width banner its own picture and crop.'
            }
          >
            {bannerUsesWide && (
              <CropSlider value={fields.hero_wide_image_position_y} onChange={setPosition('hero_wide_image_position_y')} />
            )}
            <BannerPreview
              url={bannerUrl}
              positionY={bannerPositionY}
              logoUrl={logoPreviewUrl}
              manufacturerName={manufacturerName}
              description={fields.description || null}
              websiteUrl={fields.website_url || null}
            />
          </PreviewFrame>
        )}

        <Field
          label="Brand description"
          hint="1–3 sentences. Shown on your manufacturer card and page. Keep it clear and factual."
        >
          <textarea
            value={fields.description ?? ''}
            onChange={set('description')}
            onFocus={onFocus} onBlur={onBlur}
            rows={4}
            placeholder="We manufacture premium fibre cement cladding and weatherboard products for residential and commercial construction across Australia."
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }}
          />
          {fields.description && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--ds-text-faint)' }}>
              {fields.description.trim().length} characters
            </p>
          )}
        </Field>
      </section>

      {/* ── Contact & web ── */}
      <section style={{
        background: '#fff',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 10,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ds-text-faint)',
          marginBottom: '1rem',
        }}>
          Contact &amp; web
        </div>

        <Field label="Website URL" hint="Your main brand or product catalogue website.">
          <input
            type="url"
            value={fields.website_url ?? ''}
            onChange={set('website_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://www.yourbrand.com.au"
            style={inputStyle}
          />
        </Field>

        <Field label="Phone" hint="National enquiry line or head office number.">
          <input
            type="tel"
            value={fields.phone ?? ''}
            onChange={set('phone')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="1800 000 000"
            style={{ ...inputStyle, maxWidth: '220px' }}
          />
        </Field>

        <Field label="ABN" hint="Your Australian Business Number — used for verification only, not shown publicly.">
          <input
            type="text"
            value={fields.abn ?? ''}
            onChange={set('abn')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="12 345 678 901"
            style={{ ...inputStyle, maxWidth: '220px' }}
          />
        </Field>
      </section>

      {/* ── Save button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '2rem' }}>
        <button
          onClick={handleSave}
          disabled={pending}
          style={{
            padding: '0.6rem 1.5rem',
            borderRadius: 8,
            border: 'none',
            background: pending ? '#9ca3af' : '#185D7A',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: pending ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {pending ? 'Saving…' : 'Save brand profile'}
        </button>
        {saved && (
          <span style={{ fontSize: '0.875rem', color: '#16a34a', fontWeight: 600 }}>
            Saved
          </span>
        )}
        {syncWarning && (
          <span style={{ fontSize: '0.875rem', color: '#b45309' }} title="Your changes are saved here, but the live BuildQuote card couldn't be updated right now — it may still show older branding. This should resolve on your next save; contact BuildQuote if it persists.">
            Saved — but the live card didn&rsquo;t sync, may show old branding
          </span>
        )}
        {error && (
          <span style={{ fontSize: '0.875rem', color: '#dc2626' }}>
            {error}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
          Slug: <code style={{ background: 'var(--ds-page-bg)', padding: '1px 5px', borderRadius: 3 }}>{slug}</code>
        </span>
      </div>
    </div>
  )
}
