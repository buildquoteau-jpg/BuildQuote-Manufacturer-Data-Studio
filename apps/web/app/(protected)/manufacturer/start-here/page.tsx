import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerInfo,
  getManufacturerDocuments,
  getManufacturerVerificationData,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'

export const dynamic = 'force-dynamic'

// The new front door (design doc addendum §B3): a manufacturer's brand
// identity at the top, then a numbered guided flow through the rest of the
// workspace — instead of landing on a flat 14-item nav with no order. Every
// number/link here reads from data that already exists elsewhere; this page
// adds no new tables and no new server actions, only a guided view over them.

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

  const [infoResult, docsResult, verificationResult] = await Promise.all([
    getManufacturerInfo(ctx.manufacturerId),
    getManufacturerDocuments(ctx.manufacturerId),
    getManufacturerVerificationData(ctx.manufacturerId),
  ])

  if (!infoResult.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Start Here">
        <div className="studio-warn">Could not load your workspace: {infoResult.error}</div>
      </StudioShell>
    )
  }

  const manufacturer = infoResult.manufacturer
  const documentCount = docsResult.ok ? docsResult.documents.length : 0
  const systems = verificationResult.ok ? verificationResult.systems : []

  const brandComplete = Boolean(manufacturer.description && manufacturer.websiteUrl && manufacturer.heroImageUrl)
  const needsReviewCount = systems.filter((s) => s.verification_status !== 'manufacturer_verified').length
  const readyToPublishCount = systems.filter((s) => s.publish_status === 'draft' || s.publish_status === null).length
  const publishedCount = systems.filter((s) => s.publish_status === 'published' || s.publish_status === 'published_with_changes').length

  const firstNeedsReview = systems.find((s) => s.verification_status !== 'manufacturer_verified')
  const reviewHref = firstNeedsReview ? `/manufacturer/workspace/${firstNeedsReview.id}` : '/manufacturer/cms'
  const knowledgeTabHref = systems[0] ? `/manufacturer/workspace/${systems[0].id}` : '/manufacturer/cms'

  const steps = [
    {
      n: 1,
      title: 'Brand profile',
      done: brandComplete,
      count: brandComplete ? 'Complete' : 'Needs attention',
      href: '/manufacturer/profile',
      body: 'Your company name, description, website and hero image — shown on every one of your System Cards.',
    },
    {
      n: 2,
      title: 'Upload documents',
      done: documentCount > 0,
      count: `${documentCount} uploaded`,
      href: '/manufacturer/documents',
      body: 'Catalogues, install guides and technical data sheets — the evidence every extracted fact traces back to.',
    },
    {
      n: 3,
      title: 'Review & verify products',
      done: systems.length > 0 && needsReviewCount === 0,
      count: systems.length === 0 ? 'No products yet' : `${needsReviewCount} need${needsReviewCount === 1 ? 's' : ''} you`,
      href: reviewHref,
      body: 'Work each product start to finish in the System Workspace — identity, images, variants, colours, components, attributes and applications, one page per product.',
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

      {/* Direct callout to the machine-readable object — this was previously unreachable. */}
      <Link href={knowledgeTabHref} style={{ textDecoration: 'none' }}>
        <div style={{
          padding: '1rem 1.1rem', borderRadius: 10, border: '1.5px solid #bfdbfe', background: '#eff6ff',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ fontSize: '1.3rem' }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e3a8a' }}>See what the AI knows about your products</div>
            <div style={{ fontSize: '0.8rem', color: '#1d4ed8', marginTop: '0.15rem' }}>
              Every product page has a &ldquo;What the AI knows&rdquo; view — every fact, its verification
              status, and the source it came from. Verified, sourced, and never guessed.
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
            Open a workspace →
          </div>
        </div>
      </Link>
    </StudioShell>
  )
}
