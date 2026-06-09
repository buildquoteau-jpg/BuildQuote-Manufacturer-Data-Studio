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

function HeroPreview({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <div style={{
      marginTop: '0.5rem',
      height: '120px',
      borderRadius: '8px',
      background: `url(${url}) center/cover`,
      border: '1px solid var(--ds-border)',
    }} />
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

      {/* ── Brand identity card ── */}
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

        {/* Logo */}
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

        {/* Hero image */}
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
          <HeroPreview url={fields.hero_image_url || null} />
        </Field>

        {/* Description */}
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

      {/* ── Preview strip ── */}
      <section style={{
        background: '#f8fafc',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 10,
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{
          fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--ds-text-faint)',
          marginBottom: '0.9rem',
        }}>
          Showroom card preview
        </div>

        {/* Manufacturer card as it will appear in the showroom grid */}
        <div style={{
          background: '#fff',
          border: '1.5px solid #e5e7eb',
          borderRadius: '14px',
          overflow: 'hidden',
          maxWidth: '280px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Hero area */}
          <div style={{
            height: '110px',
            background: fields.hero_image_url
              ? `url(${fields.hero_image_url}) center/cover`
              : '#f0f4f8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!fields.hero_image_url && (
              fields.logo_url
                ? <img src={fields.logo_url} alt={manufacturerName} style={{ maxWidth: '75%', maxHeight: '65%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span style={{ fontSize: '13px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.02em', textAlign: 'center', padding: '0 12px' }}>{manufacturerName}</span>
            )}
          </div>
          {/* Content */}
          <div style={{ padding: '12px 14px 14px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
              {manufacturerName}
            </div>
            {fields.description && (
              <div style={{
                fontSize: '12px', color: '#6b7280', lineHeight: 1.5,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
              }}>
                {fields.description}
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 600, color: '#185D7A' }}>
              View products
            </div>
          </div>
        </div>
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>
          This is how your brand appears in the showroom grid. Save to update.
        </p>
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
