import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { PublishSystemCard } from './PublishSystemCard'

export const dynamic = 'force-dynamic'

// Publish tab (Library V7): the one place a manufacturer actually pushes a
// card live. Verify systems / Asset picker only edit drafts — nothing here
// changes buildquote.com.au until Publish is pressed on a specific card.
// Only shows systems that have been through verification
// (verification_status === 'manufacturer_verified'); everything else is
// still being reviewed and isn't offered for publish yet.

// reviewer_notes is a human string like "Verified by MB on 26/07/26" (set by
// markSystemVerified) — the only place initials are recorded today.
function parseVerifiedByInitials(reviewerNotes: string | null): string | null {
  const m = /^Verified by (\S+) on/i.exec(reviewerNotes ?? '')
  return m ? m[1] : null
}

export default async function PublishPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Publish">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Publish</h1>
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
      <StudioShell role="manufacturer" subtitle="Publish">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Publish</h1>
        <div className="studio-warn">Could not load cards: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result
  const ready = systems.filter((s) => s.verification_status === 'manufacturer_verified')

  return (
    <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Publish`}>
      {/* Full-width manufacturer banner */}
      <div style={{
        position: 'relative', margin: '-1.5rem -1.5rem 1.5rem', padding: '3rem 1.5rem',
        minHeight: 220, display: 'flex', alignItems: 'flex-end',
        background: manufacturer.heroImageUrl
          ? `linear-gradient(to top, rgba(8,15,22,0.92) 0%, rgba(8,15,22,0.55) 55%, rgba(8,15,22,0.25) 100%), url(${manufacturer.heroImageUrl}) center/cover`
          : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)',
        color: '#fff',
      }}>
        <div style={{ maxWidth: 760 }}>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
            {manufacturer.name}
          </h1>
          {manufacturer.description && (
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', margin: '0.7rem 0 0' }}>
              {manufacturer.description}
            </p>
          )}
          {manufacturer.websiteUrl && (
            <a href={manufacturer.websiteUrl} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-block', marginTop: '1rem', padding: '9px 18px', borderRadius: 8,
              border: '1.5px solid rgba(255,255,255,0.5)', color: '#fff', fontWeight: 700, fontSize: '0.85rem',
              textDecoration: 'none', background: 'rgba(255,255,255,0.08)',
            }}>
              Visit website ↗
            </a>
          )}
        </div>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 1.25rem', lineHeight: 1.65, maxWidth: 680 }}>
        Cards that have been verified and are ready to go live. Publishing pushes a card straight to
        buildquote.com.au — there's no separate approval step right now.
      </p>

      {ready.length === 0 ? (
        <div className="studio-info">
          No cards are verified yet — mark a system as verified in Verify systems first.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {ready.map((s) => (
            <PublishSystemCard
              key={s.id}
              systemId={s.id}
              name={s.name}
              category={s.category}
              subcategory={s.subcategory}
              heroUrl={s.hero_image_asset_id ? `/api/assets/${s.hero_image_asset_id}` : (s.gallery_images?.[0]?.url ?? s.hero_image_url)}
              verifiedAt={s.verified_at}
              verifiedByInitials={parseVerifiedByInitials(s.reviewer_notes)}
              publishedVersion={s.published_version}
              lastPublishedAt={s.last_published_at}
              editHref={`/manufacturer/cms/${s.id}`}
            />
          ))}
        </div>
      )}
    </StudioShell>
  )
}
