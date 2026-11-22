import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { StudioShell } from '@/components/studio/StudioShell'
import { VerificationGrid } from './VerificationGrid'

export const dynamic = 'force-dynamic'

export default async function ManufacturerReviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ legacy?: string }>
}) {
  const sp = searchParams ? await searchParams : {}
  const useLegacy = sp?.legacy === '1'

  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Verify systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Verify your systems</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const [result, assetsResult, linkLibraryResult] = await Promise.all([
    getManufacturerVerificationData(ctx.manufacturerId),
    useLegacy ? getManufacturerAssets(ctx.manufacturerId) : Promise.resolve({ ok: true as const, assets: [] }),
    useLegacy ? getManufacturerLinkLibrary(ctx.manufacturerId) : Promise.resolve({ ok: true as const, links: [] }),
  ])

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Verify systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Verify your systems</h1>
        <div className="studio-warn">Could not load systems: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result
  const verifiedCount = systems.filter((s) => s.verification_status === 'manufacturer_verified').length
  const inReviewCount = systems.filter((s) => s.verification_status === 'in_review').length
  const pendingCount = systems.filter((s) => s.verification_status === 'pending_review').length
  const publishedCount = systems.filter((s) => !!s.last_published_at).length

  if (useLegacy) {
    const assets = assetsResult.ok ? assetsResult.assets : []
    const linkLibrary = linkLibraryResult.ok ? linkLibraryResult.links : []
    return (
      <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Legacy verify view`}>
        <div style={{ marginBottom: '1rem' }}>
          <Link href="/manufacturer/review" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#185D7A', textDecoration: 'none' }}>
            ← Back to unified Verify systems
          </Link>
        </div>
        <VerificationGrid
          manufacturerId={ctx.manufacturerId}
          manufacturerName={manufacturer.name}
          manufacturerSlug={manufacturer.slug}
          systems={systems}
          assets={assets}
          linkLibrary={linkLibrary}
        />
      </StudioShell>
    )
  }

  // Sort: unverified / in-review systems first (most recently updated first), then verified
  const sorted = [...systems].sort((a, b) => {
    const aVer = a.verification_status === 'manufacturer_verified' ? 1 : 0
    const bVer = b.verification_status === 'manufacturer_verified' ? 1 : 0
    if (aVer !== bVer) return aVer - bVer
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  return (
    <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Verify systems`}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Verify your systems</h1>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint)' }}>
              {systems.length} system{systems.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Link href="/manufacturer/systems" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', textDecoration: 'none' }}>
            + Add or set up a system →
          </Link>
        </div>

        <p style={{ fontSize: '0.86rem', color: 'var(--ds-text-muted)', margin: '0 0 0.9rem', lineHeight: 1.6 }}>
          Click any system below to open its unified review workspace — verify photos, colours, profiles,
          accessories, and AI facts, then click <strong>Mark verified</strong> or <strong>Verify &amp; Publish live</strong> right on that page.
        </p>

        {systems.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, maxWidth: 340 }}>
              <div style={{ height: 6, background: 'var(--ds-border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((verifiedCount / systems.length) * 100)}%`,
                  background: '#16a34a',
                  borderRadius: 99,
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
              {verifiedCount > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>{verifiedCount} verified</span>}
              {inReviewCount > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{inReviewCount} in review</span>}
              {pendingCount > 0 && <span style={{ color: 'var(--ds-text-faint)', fontWeight: 600 }}>{pendingCount} draft</span>}
              {publishedCount > 0 && <span style={{ color: '#0d9488', fontWeight: 600 }}>{publishedCount} live</span>}
            </div>
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="studio-info">
          No systems yet. Add your first system in{' '}
          <Link href="/manufacturer/systems" style={{ fontWeight: 700, color: '#185D7A' }}>Systems</Link>.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.9rem' }}>
          {sorted.map((s) => {
            const isVerified = s.verification_status === 'manufacturer_verified'
            const isLive = !!s.last_published_at
            const thumb = s.hero_image_url || s.gallery_images?.[0]?.url || null
            return (
              <div
                key={s.id}
                style={{
                  border: '1px solid var(--ds-border, #e5e7eb)',
                  borderRadius: 10,
                  background: '#fff',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ height: 120, background: '#f1f5f9', position: 'relative', overflow: 'hidden' }}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.76rem', color: '#94a3b8' }}>
                      No hero photo yet
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 5 }}>
                    {isLive && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#0d9488', color: '#fff' }}>
                        Live {s.published_version ? `v${s.published_version}` : ''}
                      </span>
                    )}
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: isVerified ? '#dcfce7' : '#fef3c7',
                      color: isVerified ? '#166534' : '#92400e',
                    }}>
                      {isVerified ? '✓ Verified' : s.verification_status === 'in_review' ? 'In review' : 'Draft'}
                    </span>
                  </div>
                </div>

                <div style={{ padding: '0.85rem 0.95rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{s.name}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--ds-text-muted)' }}>
                    {[s.category, s.subcategory].filter(Boolean).join(' · ') || 'Uncategorised'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--ds-text-faint)' }}>
                    {s.profiles.length} profile{s.profiles.length === 1 ? '' : 's'} · {s.colours.length} colour{s.colours.length === 1 ? '' : 's'} · {s.components.length} component{s.components.length === 1 ? '' : 's'}
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: '0.6rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link
                      href={`/manufacturer/workspace/${s.id}`}
                      style={{
                        flex: 1, textAlign: 'center', fontSize: '0.8rem', fontWeight: 700,
                        color: '#fff', background: isVerified ? '#185D7A' : '#16a34a',
                        borderRadius: 7, padding: '7px 12px', textDecoration: 'none',
                      }}
                    >
                      {isVerified ? 'Edit & publish →' : 'Review & verify →'}
                    </Link>
                    <Link
                      href={`/manufacturer/systems/${s.id}/setup`}
                      style={{
                        fontSize: '0.76rem', fontWeight: 600, color: 'var(--ds-text-muted)',
                        border: '1px solid var(--ds-border)', borderRadius: 7, padding: '7px 10px', textDecoration: 'none',
                      }}
                    >
                      Setup
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </StudioShell>
  )
}
