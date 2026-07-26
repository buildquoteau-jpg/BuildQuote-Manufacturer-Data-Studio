import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { CmsCreateCardButton } from './CmsCreateCardButton'

export const dynamic = 'force-dynamic'

// Hybrid publishing (Library V7): CMS-style card manager. Runs alongside the
// existing "Verify systems" grid (manufacturer/review) so the two editing
// experiences can be compared — this one is draft/publish-centric: every edit
// autosaves to the Draft, and pressing Publish pushes the card live to
// buildquote.com.au/library instantly.

const V6_ORIGIN = process.env.BUILDQUOTE_PUBLIC_ORIGIN || 'https://buildquote.com.au'

function statusPill(system: {
  publish_status: string | null
  published_version: string | null
}): { label: string; color: string; bg: string } {
  const status = system.publish_status ?? 'draft'
  if (status === 'published') {
    return { label: `Published v${system.published_version ?? '1.0'}`, color: '#16a34a', bg: 'rgba(22,163,74,0.12)' }
  }
  if (status === 'published_with_changes') {
    return { label: `Published v${system.published_version ?? '1.0'} · unpublished changes`, color: '#d97706', bg: 'rgba(217,119,6,0.12)' }
  }
  return { label: 'Draft', color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' }
}

export default async function CmsListPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Assets & Publish">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Assets &amp; Publish</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Assets & Publish">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Assets &amp; Publish</h1>
        <div className="studio-warn">Could not load cards: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result

  return (
    <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Assets & Publish`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Assets &amp; Publish</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0.5rem 0 0', lineHeight: 1.65, maxWidth: 640 }}>
            Edit a card and it autosaves as a <strong>Draft</strong> — the live card never changes until
            you press <strong>Publish</strong>, which updates buildquote.com.au immediately.
          </p>
        </div>
        <CmsCreateCardButton manufacturerId={ctx.manufacturerId} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '1.25rem' }}>
        {systems.length === 0 && (
          <div className="studio-info">No cards yet — create your first System Card above.</div>
        )}
        {systems.map((s) => {
          const heroUrl = s.gallery_images?.[0]?.url ?? s.hero_image_url
          const pill = statusPill(s)
          const liveUrl = s.slug ? `${V6_ORIGIN}/library/${manufacturer.slug}/${s.slug}` : null
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.9rem',
              padding: '0.7rem 0.9rem',
              background: 'var(--ds-surface, rgba(255,255,255,0.03))',
              border: '1px solid var(--ds-border)', borderRadius: 10,
            }}>
              <div style={{
                width: 72, height: 48, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                background: heroUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)',
              }}>
                {heroUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: 2 }}>
                  {[s.category, s.subcategory].filter(Boolean).join(' · ') || 'No category yet'}
                  {(s.gallery_images?.length ?? 0) > 0 && ` · ${s.gallery_images!.length} image${s.gallery_images!.length !== 1 ? 's' : ''}`}
                </div>
              </div>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700, color: pill.color, background: pill.bg,
                borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {pill.label}
              </span>
              {liveUrl && s.publish_status != null && s.publish_status !== 'draft' && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-muted)',
                  textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  View live ↗
                </a>
              )}
              <Link href={`/manufacturer/cms/${s.id}`} style={{
                fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: '#185D7A',
                borderRadius: 8, padding: '7px 16px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Edit
              </Link>
            </div>
          )
        })}
      </div>
    </StudioShell>
  )
}
