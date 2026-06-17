'use client'

import { useState, useTransition } from 'react'

type StagedSystem = {
  id: string
  name: string
  category: string
  product_code: string | null
  verification_status: string | null
  production_system_id: string | null
  hero_image_url: string | null
}

type EmbedWidget = {
  id: string
  public_token: string
  status: string
  created_at: string
} | null

type ButtonConfig = {
  show_request_quote: boolean
  show_find_stockist: boolean
  show_general_enquiry: boolean
}

const DEFAULT_BUTTON_CONFIG: ButtonConfig = {
  show_request_quote: true,
  show_find_stockist: true,
  show_general_enquiry: true,
}

type Props = {
  manufacturerId: string
  manufacturerName: string
  logoUrl: string | null
  allSystems: StagedSystem[]
  widget: EmbedWidget
  selectedSystemIds: string[]
  origin: string
  buttonConfig: ButtonConfig | null
}

function isSelectable(s: StagedSystem): boolean {
  return s.verification_status === 'approved' || !!s.production_system_id
}

export function WidgetManager({
  manufacturerId, manufacturerName, allSystems,
  widget, selectedSystemIds: initialSelected, origin, buttonConfig: initialButtonConfig,
}: Props) {
  const [selected,      setSelected]      = useState<Set<string>>(new Set(initialSelected))
  const [btnConfig,     setBtnConfig]     = useState<ButtonConfig>(initialButtonConfig ?? DEFAULT_BUTTON_CONFIG)
  const [copied,        setCopied]        = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [saveMsg,       setSaveMsg]       = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function toggleBtn(key: keyof ButtonConfig) {
    setBtnConfig(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const token   = widget?.public_token ?? null
  const widgetId = widget?.id ?? null

  const selectable = allSystems.filter(isSelectable)
  const locked     = allSystems.filter(s => !isSelectable(s))

  function toggleSystem(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const embedCode = token
    ? `<iframe\n  src="${origin}/widget/${token}"\n  width="100%"\n  height="700"\n  style="border:none;border-radius:12px;"\n  loading="lazy"\n  title="${manufacturerName} Products"\n></iframe>`
    : null

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/manufacturer/widget/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer_id: manufacturerId,
          widget_id:       widgetId,
          system_ids:      Array.from(selected),
          button_config:   btnConfig,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaveMsg('Saved!')
      startTransition(() => { window.location.reload() })
    } catch {
      setSaveMsg('Save failed — please try again.')
    } finally {
      setSaving(false)
    }
  }

  function copyEmbed() {
    if (!embedCode) return
    navigator.clipboard.writeText(embedCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const tagStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
    border: active ? '1.5px solid #185D7A' : '1.5px solid #e2e8f0',
    background: active ? '#eef6fa' : '#f8fafc',
    color: active ? '#185D7A' : '#94a3b8',
    cursor: 'pointer', userSelect: 'none',
  })

  return (
    <div style={{ maxWidth: '760px' }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.25rem' }}>
        Product Widget
      </h1>
      <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 0 2rem' }}>
        Pick which approved systems appear in your embeddable widget, then copy the embed code to your website.
      </p>

      {/* System picker */}
      <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Select systems for your widget</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {selected.size} of {selectable.length} approved system{selectable.length !== 1 ? 's' : ''} selected
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSelected(new Set(selectable.map(s => s.id)))}
              style={{ fontSize: '12px', fontWeight: 600, color: '#185D7A', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              Select all
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              Clear
            </button>
          </div>
        </div>

        {selectable.length === 0 && locked.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No systems found. Systems appear here once they have been approved.
          </div>
        )}

        {selectable.length > 0 && (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {selectable.map(s => (
              <button
                key={s.id}
                onClick={() => toggleSystem(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px',
                  border: selected.has(s.id) ? '1.5px solid #185D7A' : '1.5px solid #e2e8f0',
                  background: selected.has(s.id) ? '#eef6fa' : '#fff',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{
                  flexShrink: 0, width: '20px', height: '20px', borderRadius: '6px',
                  background: selected.has(s.id) ? '#185D7A' : '#fff',
                  border: `2px solid ${selected.has(s.id) ? '#185D7A' : '#d1d5db'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.has(s.id) && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                {s.hero_image_url && (
                  <img src={s.hero_image_url} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{s.category}{s.product_code ? ` · ${s.product_code}` : ''}</div>
                </div>
                <span style={tagStyle(!!s.production_system_id)}>
                  {s.production_system_id ? 'Live' : 'Approved'}
                </span>
              </button>
            ))}
          </div>
        )}

        {locked.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 12px 8px' }}>
              Not yet approved
            </div>
            {locked.map(s => (
              <div
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #f1f5f9', background: '#fafafa', opacity: 0.5 }}
              >
                <div style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '6px', border: '2px solid #e2e8f0', background: '#f8fafc' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', lineHeight: 1.3 }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{s.category}{s.product_code ? ` · ${s.product_code}` : ''}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '8px' }}>
                  Pending review
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Button visibility */}
      <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Widget buttons</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Choose which action buttons appear on each product card</div>
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {([
            { key: 'show_request_quote',   label: 'Request a Quote',  desc: 'Opens a quote request form' },
            { key: 'show_find_stockist',   label: 'Find a Stockist',  desc: 'Lets visitors search local stockists' },
            { key: 'show_general_enquiry', label: 'General Enquiry',  desc: 'Opens a general contact form' },
          ] as { key: keyof ButtonConfig; label: string; desc: string }[]).map(({ key, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleBtn(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 12px', borderRadius: '10px', border: 'none',
                background: btnConfig[key] ? '#eef6fa' : '#fff',
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}
            >
              {/* Toggle pill */}
              <div style={{
                flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px',
                background: btnConfig[key] ? '#185D7A' : '#d1d5db',
                position: 'relative', transition: 'background 0.15s',
              }}>
                <div style={{
                  position: 'absolute', top: '3px',
                  left: btnConfig[key] ? '21px' : '3px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: '#fff', transition: 'left 0.15s',
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{desc}</div>
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                color: btnConfig[key] ? '#185D7A' : '#94a3b8',
                background: btnConfig[key] ? '#dbeafe' : '#f1f5f9',
                padding: '3px 9px', borderRadius: '6px',
              }}>
                {btnConfig[key] ? 'ON' : 'OFF'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
          style={{
            padding: '11px 24px', background: '#185D7A', color: '#fff',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700,
            cursor: saving || selected.size === 0 ? 'not-allowed' : 'pointer',
            opacity: saving || selected.size === 0 ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : token ? 'Update widget' : 'Create widget'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: '13px', color: saveMsg.includes('fail') ? '#dc2626' : '#059669', fontWeight: 600 }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* Embed code section */}
      {token && embedCode && (
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Embed code</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={`${origin}/widget/${token}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '12px', fontWeight: 600, color: '#185D7A', textDecoration: 'none', padding: '6px 12px', background: '#eef6fa', border: '1px solid #b6dcea', borderRadius: '8px' }}
              >
                Preview
              </a>
              <button
                onClick={copyEmbed}
                style={{ fontSize: '12px', fontWeight: 700, color: copied ? '#059669' : '#fff', background: copied ? '#d1fae5' : '#185D7A', border: 'none', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <pre style={{
            margin: 0, padding: '16px 20px',
            fontSize: '12px', lineHeight: 1.7,
            color: '#334155', background: '#f8fafc',
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            fontFamily: 'monospace',
          }}>
            {embedCode}
          </pre>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8' }}>
            Paste this snippet into any page on your website where you want your BuildQuote product widget to appear.
          </div>
        </div>
      )}
    </div>
  )
}
