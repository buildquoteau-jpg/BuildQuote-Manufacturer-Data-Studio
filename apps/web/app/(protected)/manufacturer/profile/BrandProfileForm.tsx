'use client'

import { useState, useTransition } from 'react'
import { saveBrandProfile, type BrandProfileFields } from '@/lib/studio-manufacturer/brand-actions'

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

// Unified preview panel: slider + page-hero + grid-card, all live.
function HeroPreviewPanel({
  heroUrl,
  positionY,
  logoUrl,
  manufacturerName,
  description,
  onSliderChange,
}: {
  heroUrl: string
  positionY: number
  logoUrl: string | null
  manufacturerName: string
  description: string | null
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const bgStyle: React.CSSProperties = {
    backgroundImage: `url(${heroUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: `center ${positionY}%`,
  }

  return (
    <div style={{
      border: '1px solid var(--ds-border-soft)',
      borderRadius: 10,
      overflow: 'hidden',
      background: '#f8fafc',
      marginBottom: '1.1rem',
    }}>
      {/* Slider row */}
      <div style={{ padding: '0.7rem 1rem 0.65rem', background: '#fff', borderBottom: '1px solid var(--ds-border-soft)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ds-text-faint)', marginBottom: '0.45rem' }}>
          Hero vertical position
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint)', minWidth: '24px' }}>Top</span>
          <input
            type="range" min={0} max={100} step={1}
            value={positionY} onChange={onSliderChange}
            style={{ flex: 1, accentColor: '#185D7A', cursor: 'pointer' }}
            aria-label="Hero image vertical position"
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint)', minWidth: '44px', textAlign: 'right' }}>Bottom</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ds-text-sub)', minWidth: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {positionY}%
          </span>
        </div>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--ds-text-faint)' }}>
          Drag to choose which part of the image stays in frame. Both previews update live.
        </p>
      </div>

      {/* Two previews */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 196px', gap: '0.9rem', padding: '0.9rem 1rem 0.8rem' }}>

        {/* ── Page hero ── */}
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ds-text-faint)', marginBottom: '0.4rem' }}>
            Manufacturer page
          </div>
          <div style={{
            ...bgStyle,
            height: 180,
            borderRadius: 8,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,30,50,0.42)' }} />
            <div style={{ position: 'relative', textAlign: 'center', padding: '0 1rem', maxWidth: '90%' }}>
              {logoUrl && (
                <div style={{ marginBottom: '0.35rem' }}>
                  <img
                    src={logoUrl}
                    alt=""
                    style={{ maxWidth: 72, maxHeight: 30, objectFit: 'contain', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              )}
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.2 }}>
                {manufacturerName}
              </div>
              {description && (
                <div style={{
                  fontSize: '0.64rem', color: 'rgba(255,255,255,0.82)', marginTop: '0.3rem', lineHeight: 1.45,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {description}
                </div>
              )}
              <div style={{
                marginTop: '0.5rem', display: 'inline-block',
                border: '1px solid rgba(255,255,255,0.65)', borderRadius: 20,
                padding: '2px 10px', fontSize: '0.58rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600,
              }}>
                Visit {manufacturerName} ↗
              </div>
            </div>
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.67rem', color: 'var(--ds-text-faint)' }}>
            Full-width banner on the manufacturer detail page
          </p>
        </div>

        {/* ── Grid card ── */}
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ds-text-faint)', marginBottom: '0.4rem' }}>
            Showroom card
          </div>
          <div style={{
            background: '#fff',
            border: '1.5px solid #e5e7eb',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          }}>
            <div style={{ ...bgStyle, height: 88 }} />
            <div style={{ padding: '9px 11px 11px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '3px' }}>
                {manufacturerName}
              </div>
              {description && (
                <div style={{
                  fontSize: '10.5px', color: '#6b7280', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {description}
                </div>
              )}
              <div style={{ marginTop: '6px', fontSize: '11px', fontWeight: 600, color: '#185D7A' }}>
                View products
              </div>
            </div>
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.67rem', color: 'var(--ds-text-faint)' }}>
            As it appears in the showroom grid
          </p>
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
}: {
  manufacturerId: string
  manufacturerName: string
  slug: string
  initialValues: BrandProfileFields
}) {
  const [fields, setFields] = useState<BrandProfileFields>({
    description:    initialValues.description    ?? '',
    website_url:    initialValues.website_url    ?? '',
    hero_image_url: initialValues.hero_image_url ?? '',
    hero_image_position_y: initialValues.hero_image_position_y ?? 50,
    logo_url:       initialValues.logo_url       ?? '',
    phone:          initialValues.phone          ?? '',
    abn:            initialValues.abn            ?? '',
  })

  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set(key: keyof BrandProfileFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields(prev => ({ ...prev, [key]: e.target.value }))
      setSaved(false)
    }
  }

  function setPositionY(e: React.ChangeEvent<HTMLInputElement>) {
    setFields(prev => ({ ...prev, hero_image_position_y: Number(e.target.value) }))
    setSaved(false)
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-navy)'
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = 'var(--ds-border)'
  }

  function handleSave() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const payload: BrandProfileFields = {
        description:    fields.description    || null,
        website_url:    fields.website_url    || null,
        hero_image_url: fields.hero_image_url || null,
        hero_image_position_y: fields.hero_image_position_y,
        logo_url:       fields.logo_url       || null,
        phone:          fields.phone          || null,
        abn:            fields.abn            || null,
      }
      const res = await saveBrandProfile(manufacturerId, payload)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

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
          hint="Paste the URL of your logo PNG. Ideally transparent background, horizontal orientation."
        >
          <input
            type="url"
            value={fields.logo_url ?? ''}
            onChange={set('logo_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://cdn.yourbrand.com.au/logo.png"
            style={inputStyle}
          />
          <ImagePreview url={fields.logo_url || null} alt={`${manufacturerName} logo`} />
        </Field>

        <Field
          label="Hero image"
          hint="A high-quality lifestyle or product image shown at the top of your manufacturer page. Landscape, at least 1200px wide."
        >
          <input
            type="url"
            value={fields.hero_image_url ?? ''}
            onChange={set('hero_image_url')}
            onFocus={onFocus} onBlur={onBlur}
            placeholder="https://cdn.yourbrand.com.au/hero.jpg"
            style={inputStyle}
          />
        </Field>

        {/* Live dual preview — only shown when a hero URL is set */}
        {fields.hero_image_url && (
          <HeroPreviewPanel
            heroUrl={fields.hero_image_url}
            positionY={fields.hero_image_position_y}
            logoUrl={fields.logo_url || null}
            manufacturerName={manufacturerName}
            description={fields.description || null}
            onSliderChange={setPositionY}
          />
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
