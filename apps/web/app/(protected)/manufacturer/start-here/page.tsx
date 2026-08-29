import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerInfo,
  getManufacturerVerificationData,
  getOpenAiQuestionsCount,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'

export const dynamic = 'force-dynamic'

// The front door (design doc addendum §B3, steps updated for addendum 3's
// system-by-system self-serve workflow — the four steps here must always
// match the four "doing work" items in StudioShell's nav: Brand profile,
// Systems, Verify systems, Publish. The original addendum-2 version of this
// page had a step 2 "Upload documents" pointing at the flat manufacturer-
// wide Documents page — that page is now unlinked from the nav (addendum 3
// §C1: noise until the per-system workflow is nailed), and per-system
// document upload lives inside each system's own setup flow instead. Keep
// these two four-item lists in sync by hand; there is no shared source of
// truth between StudioShell.tsx's MFR_NAV and this file's `steps` array.

export default async function StartHerePage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Start Here">
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const [infoResult, verificationResult, aiQuestionsCount] = await Promise.all([
    getManufacturerInfo(ctx.manufacturerId),
    getManufacturerVerificationData(ctx.manufacturerId),
    getOpenAiQuestionsCount(ctx.manufacturerId),
  ])

  if (!infoResult.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Start Here">
        <div className="studio-warn">Could not load your workspace: {infoResult.error}</div>
      </StudioShell>
    )
  }

  const manufacturer = infoResult.manufacturer
  const systems = verificationResult.ok ? verificationResult.systems : []

  const brandComplete = Boolean(manufacturer.description && manufacturer.websiteUrl && manufacturer.heroImageUrl)
  // "Not started" mirrors the Systems list's own setup-status heuristic
  // (page.tsx there) — a system with no photos, no links and no documents.
  const notStartedCount = systems.filter((s) =>
    (s.gallery_images?.length ?? 0) === 0 && (s.custom_document_links?.length ?? 0) === 0,
  ).length
  const needsReviewCount = systems.filter((s) => s.verification_status !== 'manufacturer_verified').length
  const readyToPublishCount = systems.filter((s) => s.publish_status === 'draft' || s.publish_status === null).length
  const publishedCount = systems.filter((s) => s.publish_status === 'published' || s.publish_status === 'published_with_changes').length

  const firstNeedsReview = systems.find((s) => s.verification_status !== 'manufacturer_verified')
  const reviewHref = firstNeedsReview ? `/manufacturer/workspace/${firstNeedsReview.id}` : '/manufacturer/systems'

  const steps = [
    {
      n: 1,
      title: 'Brand profile',
      done: brandComplete,
      count: brandComplete ? 'Complete' : 'Needs attention',
      href: '/manufacturer/profile',
      body: 'Your company name, description, website and hero image — shown on your manufacturer page, not on individual product cards.',
    },
    {
      n: 2,
      title: 'Systems',
      done: systems.length > 0 && notStartedCount === 0,
      count: systems.length === 0 ? 'No systems yet' : `${systems.length} system${systems.length === 1 ? '' : 's'}${notStartedCount > 0 ? ` · ${notStartedCount} not started` : ''}`,
      href: '/manufacturer/systems',
      body: 'List every product you want turned into a System Card, then click into each one to upload photos, links and source documents and set up its System Card.',
    },
    {
      n: 3,
      title: 'Verify systems',
      done: systems.length > 0 && needsReviewCount === 0,
      count: systems.length === 0 ? 'No products yet' : `${needsReviewCount} need${needsReviewCount === 1 ? 's' : ''} you`,
      href: reviewHref,
      body: 'Confirm what the AI found in the System Workspace — identity, images, variants, colours, components, attributes and applications, one page per product.',
    },
    {
      n: 4,
      title: 'Publish',
      done: publishedCount > 0 && readyToPublishCount === 0,
      count: systems.length === 0 ? '—' : `${publishedCount} live · ${readyToPublishCount} in draft`,
      href: '/manufacturer/publish',
      body: 'Send a verified card live. The live card only ever changes when you publish it here.',
    },
  ]

  return (
    <StudioShell role="manufacturer" subtitle="Start Here" workspaceName={manufacturer.name}>
      {/* Brand snapshot */}
      <div style={{
        display: 'flex', gap: '1.1rem', alignItems: 'center', padding: '1.1rem 1.3rem',
        background: 'var(--ds-surface, rgba(255,255,255,0.03))', border: '1px solid var(--ds-border)',
        borderRadius: 12, marginBottom: '1.5rem',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
          background: manufacturer.heroImageUrl ? undefined : 'linear-gradient(135deg, #185D7A 0%, #0f3d52 100%)',
        }}>
          {manufacturer.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={manufacturer.heroImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{manufacturer.name}</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted, #6b7280)', marginTop: '0.2rem' }}>
            {manufacturer.description || 'No description yet — add one in your brand profile.'}
          </div>
        </div>
        <Link href="/manufacturer/profile" style={{
          fontSize: '0.8rem', fontWeight: 700, color: '#185D7A', background: '#fff',
          border: '1.5px solid #185D7A', borderRadius: 8, padding: '0.4rem 0.8rem', textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Edit brand profile →
        </Link>
      </div>

      <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.3rem' }}>Start here</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted, #6b7280)', margin: '0 0 1.3rem', maxWidth: 640, lineHeight: 1.6 }}>
        Four steps take a product from nothing to a live, AI-ready System Card. Work through them
        in order, or jump straight to whichever one needs you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
        {steps.map((step) => (
          <Link key={step.n} href={step.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.9rem 1.1rem',
              background: 'var(--ds-surface, rgba(255,255,255,0.03))', border: '1px solid var(--ds-border)',
              borderRadius: 10,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step.done ? '#16a34a' : '#185D7A', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
              }}>
                {step.done ? '✓' : step.n}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>{step.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', marginTop: '0.15rem' }}>{step.body}</div>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: step.done ? '#16a34a' : '#d97706', whiteSpace: 'nowrap' }}>
                {step.count}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--ds-text-faint, #9ca3af)' }}>→</div>
            </div>
          </Link>
        ))}
      </div>

      {aiQuestionsCount > 0 && (
        <Link href="/manufacturer/ai-questions" style={{ textDecoration: 'none' }}>
          <div style={{
            padding: '1rem 1.1rem', borderRadius: 10, border: '1.5px solid #fde68a', background: '#fffbeb',
            display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.6rem',
          }}>
            <div style={{ fontSize: '1.3rem' }}>💬</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>
                {aiQuestionsCount} builder question{aiQuestionsCount === 1 ? '' : 's'} need{aiQuestionsCount === 1 ? 's' : ''} your input
              </div>
              <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.15rem' }}>
                Builders asked something our AI couldn&apos;t answer from your verified product data.
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
              Review AI Questions →
            </div>
          </div>
        </Link>
      )}
    </StudioShell>
  )
}
