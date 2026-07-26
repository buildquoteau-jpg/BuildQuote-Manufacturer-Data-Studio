'use client'

// Per-card publish action for the Publish tab. Pressing Publish calls
// publishCardLive directly (instant live publish, no admin approval queue —
// see lib/studio-manufacturer/publish-live-actions.ts for why and how to
// re-impose the approval step later).

import { useState, useTransition, type CSSProperties } from 'react'
import { publishCardLive } from '@/lib/studio-manufacturer/publish-live-actions'

type Props = {
  systemId: string
  name: string
  category: string | null
  subcategory: string | null
  heroUrl: string | null
  verifiedAt: string | null
  verifiedByInitials: string | null
  publishedVersion: string | null
  lastPublishedAt: string | null
  editHref: string
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function tagStyle(color: string): CSSProperties {
  return {
    fontSize: '0.68rem', fontWeight: 700, color, background: `${color}1a`,
    borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap',
  }
}

export function PublishSystemCard(props: Props) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<
    { ok: true; liveUrl: string; version: string; warnings: string[] } | { ok: false; error: string } | null
  >(null)
  const [publishedNow, setPublishedNow] = useState<{ version: string; at: string } | null>(null)

  function handlePublish() {
    setResult(null)
    startTransition(async () => {
      const res = await publishCardLive(props.systemId)
      setResult(res)
      if (res.ok) setPublishedNow({ version: res.version, at: new Date().toISOString() })
    })
  }

  const publishedVersion = publishedNow?.version ?? props.publishedVersion
  const lastPublishedAt = publishedNow?.at ?? props.lastPublishedAt
  const isPublished = !!publishedVersion

  return (
    <div style={{
      border: '1px solid var(--ds-border)', borderRadius: 12, overflow: 'hidden',
      background: 'var(--ds-surface, rgba(255,255,255,0.03))', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 140, background: props.heroUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)' }}>
        {props.heroUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.heroUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{props.name}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: 2 }}>
            {[props.category, props.subcategory].filter(Boolean).join(' · ') || 'No category'}
          </div>
        </div>

        {/* Verified/Published tag row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
          <span style={tagStyle('#16a34a')}>
            Verified: {fmtDate(props.verifiedAt) ?? '—'}
          </span>
          {props.verifiedByInitials && (
            <span style={tagStyle('#185D7A')}>By: {props.verifiedByInitials}</span>
          )}
          <span style={tagStyle(isPublished ? '#16a34a' : '#9ca3af')}>
            Published: {isPublished ? `${fmtDate(lastPublishedAt)} · v${publishedVersion}` : 'Not yet'}
          </span>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handlePublish}
            disabled={pending}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: pending ? '#9ca3af' : '#16a34a', color: '#fff', fontSize: '0.82rem', fontWeight: 800,
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {pending ? 'Publishing…' : isPublished ? 'Publish update' : 'Publish'}
          </button>
          <a href={props.editHref} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-muted)', textDecoration: 'none' }}>
            Edit card
          </a>
        </div>

        {result && (
          result.ok ? (
            <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
              Published v{result.version} —{' '}
              <a href={result.liveUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: '#16a34a' }}>
                view live ↗
              </a>
              {result.warnings.length > 0 && (
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1rem' }}>
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{result.error}</div>
          )
        )}
      </div>
    </div>
  )
}
