import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getPortalData,
  type PortalSystem,
  type PortalDocument,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { OpenDocumentButton } from '@/components/studio/OpenDocumentButton'

// ============================================================
// Verification progress stages
// ============================================================

type VerifStage = {
  key: string
  label: string
  color: string
  dimColor: string
}

const VERIF_STAGES: VerifStage[] = [
  { key: 'submitted',    label: 'Submitted',              color: '#3b82f6', dimColor: '#e2e8f0' },
  { key: 'under_review', label: 'Under Review',           color: '#f59e0b', dimColor: '#e2e8f0' },
  { key: 'verified',     label: 'Manufacturer Verified',  color: '#4FCBB0', dimColor: '#e2e8f0' },
  { key: 'published',    label: 'BuildQuote Published',   color: '#22c55e', dimColor: '#e2e8f0' },
]

/**
 * Returns which stages are "lit" for a given system.
 * Returns 'warning' for stages that have a problem flag.
 */
function resolveStages(
  status: string,
  productionSystemId: string | null,
): ('lit' | 'dim' | 'warning')[] {
  const needsAttention = status === 'rejected' || status === 'needs_source_check'
  const inReview = status === 'in_review' || status === 'manufacturer_verified' || needsAttention
  const verified = status === 'manufacturer_verified'
  const published = productionSystemId !== null

  return [
    'lit',                                        // always submitted
    inReview ? (needsAttention ? 'warning' : 'lit') : 'dim',
    verified ? 'lit' : 'dim',
    published ? 'lit' : 'dim',
  ]
}

function VerificationBanner({ system }: { system: PortalSystem }) {
  const states = resolveStages(system.verificationStatus, system.productionSystemId)
  const needsAttention = system.verificationStatus === 'rejected' || system.verificationStatus === 'needs_source_check'

  return (
    <div>
      {needsAttention && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginBottom: '0.5rem',
            padding: '0.3rem 0.6rem',
            background: '#fef2f2',
            borderRadius: 5,
            fontSize: '0.75rem',
            color: '#b91c1c',
            fontWeight: 600,
          }}
        >
          <span>
            {system.verificationStatus === 'rejected' ? 'Rejected — please contact BuildQuote' : 'Needs source check — action required'}
          </span>
        </div>
      )}

      {/* Stage segments */}
      <div style={{ display: 'flex', gap: 3 }}>
        {VERIF_STAGES.map((stage, i) => {
          const state = states[i]
          const bg =
            state === 'lit' ? stage.color :
            state === 'warning' ? '#ef4444' :
            stage.dimColor
          const textColor = state === 'dim' ? '#94a3b8' : '#fff'
          const isLast = i === VERIF_STAGES.length - 1
          const isFirst = i === 0

          return (
            <div
              key={stage.key}
              title={stage.label}
              style={{
                flex: 1,
                padding: '0.3rem 0.25rem 0.35rem',
                background: bg,
                borderRadius: isFirst ? '5px 0 0 5px' : isLast ? '0 5px 5px 0' : 0,
                textAlign: 'center',
                fontSize: '0.6rem',
                fontWeight: 600,
                color: textColor,
                letterSpacing: '0.01em',
                lineHeight: 1.25,
                minHeight: '2.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
                userSelect: 'none',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}
            >
              {stage.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// System card
// ============================================================

function SystemCard({ system, manufacturerSlug }: { system: PortalSystem; manufacturerSlug: string }) {
  const verificationHref = system.sourceDocumentId
    ? `/manufacturers/${manufacturerSlug}/documents/${system.sourceDocumentId}`
    : null

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {/* Card body */}
      <div style={{ padding: '1rem 1.1rem 0.85rem', flex: 1 }}>
        {/* Category chip */}
        {system.category && (
          <div
            style={{
              display: 'inline-block',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#185D7A',
              background: '#e0f2fe',
              borderRadius: 4,
              padding: '0.15rem 0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            {system.category}
          </div>
        )}

        {/* System name */}
        <div
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: system.description ? '0.4rem' : '0',
            lineHeight: 1.35,
          }}
        >
          {system.name}
        </div>

        {/* Description */}
        {system.description && (
          <p
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              margin: 0,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
              overflow: 'hidden',
            }}
          >
            {system.description}
          </p>
        )}
      </div>

      {/* Verification link */}
      {verificationHref && (
        <div style={{ padding: '0 1.1rem 0.7rem' }}>
          <a
            href={verificationHref}
            style={{
              fontSize: '0.75rem',
              color: '#185D7A',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              textDecoration: 'none',
            }}
          >
            View verification details →
          </a>
        </div>
      )}

      {/* Verification progress banner */}
      <div style={{ padding: '0 0.75rem 0.75rem' }}>
        <VerificationBanner system={system} />
      </div>
    </div>
  )
}

// ============================================================
// Catalogue card
// ============================================================

const DOC_STATUS_LABEL: Record<string, string> = {
  uploaded:   'Uploaded',
  queued:     'Queued',
  extracting: 'Extracting',
  review:     'In Review',
  approved:   'Approved',
  failed:     'Failed',
}

const DOC_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  uploaded:   { bg: '#f1f5f9', color: '#475569' },
  queued:     { bg: '#fef9c3', color: '#854d0e' },
  extracting: { bg: '#fed7aa', color: '#9a3412' },
  review:     { bg: '#e0f2fe', color: '#0369a1' },
  approved:   { bg: '#dcfce7', color: '#166534' },
  failed:     { bg: '#fee2e2', color: '#991b1b' },
}

const DOC_TYPE_LABEL: Record<string, string> = {
  catalogue:  'CAT',
  price_list: 'PL',
  technical:  'TECH',
  brochure:   'DOC',
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch {
    return isoString
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

function CatalogueCard({ doc, manufacturerId }: { doc: PortalDocument; manufacturerId: string }) {
  const statusColors = DOC_STATUS_COLORS[doc.status] ?? { bg: '#f1f5f9', color: '#475569' }
  const docTypeLabel = DOC_TYPE_LABEL[doc.documentType ?? ''] ?? 'DOC'
  const fileSize = formatFileSize(doc.fileSizeBytes)

  return (
    <div
      style={{
        background: '#fff',
        border: '1.5px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Cover area */}
      <div
        style={{
          background: 'linear-gradient(135deg, #185D7A 0%, #1a7a9e 100%)',
          height: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.9)',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 6,
            padding: '0.3rem 0.6rem',
          }}
        >
          {docTypeLabel}
        </span>
        {/* Status badge */}
        <div
          style={{
            position: 'absolute',
            top: '0.6rem',
            right: '0.6rem',
            background: statusColors.bg,
            color: statusColors.color,
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '0.2rem 0.45rem',
            borderRadius: 4,
            letterSpacing: '0.03em',
          }}
        >
          {DOC_STATUS_LABEL[doc.status] ?? doc.status}
        </div>
      </div>

      {/* Info area */}
      <div style={{ padding: '0.85rem 1rem 1rem' }}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '0.3rem',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {doc.documentName}
        </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.75rem', marginTop: '0.4rem' }}>
            {doc.documentType && (
              <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'capitalize' }}>
                {doc.documentType.replace(/_/g, ' ')}
              </span>
            )}
            {doc.documentDate && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {doc.documentDate}
              </span>
            )}
            {fileSize && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {fileSize}
              </span>
            )}
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', width: '100%' }}>
              Uploaded {formatDate(doc.uploadedAt)}
              {doc.uploaderName ? ` by ${doc.uploaderName}` : ''}
            </span>
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <OpenDocumentButton documentId={doc.id} manufacturerId={manufacturerId} variant="button" />
          </div>
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================

export default async function ManufacturerPortalPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  const firstName = session.profile?.fullName
    ? session.profile.fullName.split(' ')[0]
    : null

  if (!ctx.found && ctx.reason === 'admin_no_context') {
    return (
      <StudioShell role="manufacturer" subtitle="Portal">
        <div className="studio-info">
          Admin support access. Open a manufacturer workspace from the{' '}
          <a href="/admin/manufacturers">admin manufacturers list</a>.
        </div>
      </StudioShell>
    )
  }

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Portal">
        <div className="studio-info">
          No manufacturer workspace assigned. Contact BuildQuote admin to get access.
        </div>
      </StudioShell>
    )
  }

  const result = await getPortalData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Portal">
        <div className="studio-warn">Could not load workspace: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, documents, systems } = result.data
  const publishedCount = systems.filter((s) => s.productionSystemId !== null).length
  const verifiedCount  = systems.filter((s) => s.verificationStatus === 'approved').length
  const pendingCount   = systems.filter(
    (s) => s.verificationStatus === 'pending_review' || s.verificationStatus === 'in_review',
  ).length

  return (
    <StudioShell role="manufacturer" workspaceName={manufacturer.name}>
      {/* ── Welcome hero ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #185D7A 0%, #1a7a9e 100%)',
          borderRadius: 14,
          padding: '1.75rem 2rem',
          marginBottom: '2rem',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {manufacturer.heroImageUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${manufacturer.heroImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.12,
              borderRadius: 14,
            }}
          />
        )}
        <div style={{ position: 'relative' }}>
        <p style={{ fontSize: '0.83rem', color: 'rgba(255,255,255,0.65)', margin: '0 0 0.3rem', fontWeight: 500 }}>
          Welcome{firstName ? `, ${firstName}` : ''} to your BuildQuote Manufacturer Portal
        </p>
        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: '#fff',
            margin: '0 0 0.6rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}
        >
          {manufacturer.name}
        </h1>
        {manufacturer.description && (
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)', margin: '0 0 1.25rem', maxWidth: 600, lineHeight: 1.6 }}>
            {manufacturer.description}
          </p>
        )}

        {/* Quick-stat row */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Catalogues',       value: documents.length },
            { label: 'Systems staged',   value: systems.length },
            { label: 'Verified',         value: verifiedCount },
            { label: 'Published to BQ',  value: publishedCount },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', fontWeight: 600, marginTop: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
        </div>{/* end position:relative content wrapper */}
      </div>

      {/* ── Catalogues ── */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.6rem',
            marginBottom: '1rem',
            paddingBottom: '0.6rem',
            borderBottom: '2px solid #e2e8f0',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Your current catalogues
          </h2>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </span>
        </div>

        {documents.length === 0 ? (
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              borderRadius: 12,
              padding: '2rem',
              textAlign: 'center',
              color: '#94a3b8',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No catalogues uploaded yet</div>
            <div style={{ fontSize: '0.83rem' }}>Contact BuildQuote to upload your product catalogues.</div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {documents.map((doc) => (
              <CatalogueCard key={doc.id} doc={doc} manufacturerId={ctx.manufacturerId} />
            ))}
          </div>
        )}
      </section>

      {/* ── Systems ── */}
      <section style={{ marginBottom: '2rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.6rem',
            marginBottom: '0.5rem',
            paddingBottom: '0.6rem',
            borderBottom: '2px solid #e2e8f0',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Your current systems
          </h2>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
            {systems.length} {systems.length === 1 ? 'system' : 'systems'}
          </span>
        </div>

        {/* Stage legend */}
        {systems.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '1rem',
              fontSize: '0.72rem',
              color: '#64748b',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Progress:</span>
            {VERIF_STAGES.map((s) => (
              <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color }} />
                {s.label}
              </span>
            ))}
            {pendingCount > 0 && (
              <span style={{ marginLeft: 'auto', color: '#64748b' }}>
                {pendingCount} awaiting review
              </span>
            )}
          </div>
        )}

        {systems.length === 0 ? (
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px dashed #cbd5e1',
              borderRadius: 12,
              padding: '2rem',
              textAlign: 'center',
              color: '#94a3b8',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No systems extracted yet</div>
            <div style={{ fontSize: '0.83rem' }}>Systems appear here once BuildQuote has processed your catalogues.</div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {systems.map((sys) => (
              <SystemCard key={sys.id} system={sys} manufacturerSlug={manufacturer.slug} />
            ))}
          </div>
        )}
      </section>

      {/* ── Footer nav ── */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          paddingTop: '1.25rem',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {[
          { href: '/manufacturer/profile',   label: 'Brand profile' },
          { href: '/manufacturer/documents', label: 'Documents' },
          { href: '/manufacturer/review',    label: 'Verify systems' },
          { href: '/studio/showroom',        label: 'Showroom' },
          { href: '/manufacturer/help',      label: 'Help & Support' },
        ].map((item: { href: string; label: string }) => (
          <a
            key={item.href}
            href={item.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.5rem 0.9rem',
              background: '#fff',
              border: '1.5px solid #e2e8f0',
              borderRadius: 8,
              fontSize: '0.83rem',
              fontWeight: 600,
              color: '#475569',
              textDecoration: 'none',
              transition: 'border-color 0.15s, color 0.15s',
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </StudioShell>
  )
}
