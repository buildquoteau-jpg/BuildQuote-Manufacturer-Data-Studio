import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContext,
  getManufacturerInfo,
  getWorkspaceCounts,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioCard } from '@/components/studio/StudioCard'

export default async function ManufacturerDashboardPage() {
  const session = await getStudioSession()
  const ctx = resolveWorkspaceContext(session)

  // Admin with no manufacturer context
  if (!ctx.found && ctx.reason === 'admin_no_context') {
    return (
      <StudioShell role="manufacturer" subtitle="Admin support access">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Manufacturer workspace</h1>
        <div className="studio-info">
          Admin support access. To view a manufacturer workspace, open the manufacturer record
          from the{' '}
          <a href="/admin/manufacturers" style={{ color: 'var(--ds-navy)' }}>
            admin manufacturers list
          </a>
          .
        </div>
      </StudioShell>
    )
  }

  // manufacturer_user with no active memberships (layout redirects these, but handle gracefully)
  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="No workspace">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Manufacturer workspace</h1>
        <div className="studio-info">
          No manufacturer workspace assigned. Contact BuildQuote admin to get access.
        </div>
      </StudioShell>
    )
  }

  const displayName = session.profile?.fullName ?? session.profile?.email ?? 'Your workspace'

  const [mfrResult, countsResult] = await Promise.all([
    getManufacturerInfo(ctx.manufacturerId),
    getWorkspaceCounts(ctx.manufacturerId),
  ])

  const manufacturer = mfrResult.ok ? mfrResult.manufacturer : null
  const counts = countsResult.ok ? countsResult.counts : null

  const workspaceName = manufacturer?.name ?? displayName

  return (
    <StudioShell role="manufacturer" subtitle={workspaceName}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>Manufacturer workspace</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Review and preview your BuildQuote Data Studio records before publishing.
      </p>

      {/* Workspace summary */}
      <div
        style={{
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          padding: '0.75rem 1.1rem',
          marginBottom: '1.5rem',
          fontSize: '0.83rem',
          color: 'var(--ds-text-sub)',
          display: 'flex',
          gap: '1.25rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span>
          <span style={{ color: 'var(--ds-text-faint)' }}>Workspace · </span>
          <strong>{manufacturer?.name ?? '—'}</strong>
        </span>
        {manufacturer?.slug && (
          <span>
            <span style={{ color: 'var(--ds-text-faint)' }}>Slug · </span>
            <code
              style={{
                fontSize: '0.78rem',
                background: 'var(--ds-page-bg)',
                padding: '0.1rem 0.3rem',
                borderRadius: 3,
              }}
            >
              {manufacturer.slug}
            </code>
          </span>
        )}
        <span>
          <span style={{ color: 'var(--ds-text-faint)' }}>Your role · </span>
          <strong>{ctx.membership.role}</strong>
        </span>
        <span>
          <span style={{ color: 'var(--ds-text-faint)' }}>Status · </span>
          <span style={{ color: '#166534', fontWeight: 600 }}>
            {manufacturer?.status ?? ctx.membership.status}
          </span>
        </span>
        {ctx.allMemberships.length > 1 && (
          <span style={{ color: 'var(--ds-text-faint)', fontStyle: 'italic', marginLeft: 'auto' }}>
            {ctx.allMemberships.length} workspaces available — showing first
          </span>
        )}
      </div>

      {mfrResult.ok === false && (
        <div className="studio-warn" style={{ marginBottom: '1rem' }}>
          Could not load workspace details: {mfrResult.error}
        </div>
      )}

      <div className="studio-card-grid">
        <StudioCard
          icon="🏷"
          title="Brand profile"
          description="Set your logo, hero image, description and contact details."
          href="/manufacturer/profile"
        />
        <StudioCard
          icon="📄"
          title="Documents"
          description="View source documents for this workspace."
          href="/manufacturer/documents"
        />
        <StudioCard
          icon="✅"
          title="Verify systems"
          description="Review and approve each product system card before publishing."
          href="/manufacturer/review"
        />
        <StudioCard
          icon="👁"
          title="Showroom"
          description="Preview how your brand will appear on the public BuildQuote product directory."
          href="/studio/showroom"
        />
        <StudioCard
          icon="❓"
          title="Help & Support"
          description="Contact BuildQuote or find guides on uploading and reviewing your data."
          href="/manufacturer/help"
        />
      </div>

      <div className="studio-section">
        <div className="studio-section-heading">Overview</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {[
            { label: 'Documents', value: counts?.documentCount ?? '—' },
            { label: 'Staged systems', value: counts?.systemCount ?? '—' },
            { label: 'Components', value: counts?.componentCount ?? '—' },
            {
              label: 'Publish status',
              value: manufacturer?.status ?? '—',
              note: 'not published',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--ds-card-bg)',
                border: '1px solid var(--ds-border-soft)',
                borderRadius: 8,
                padding: '0.9rem 1rem',
              }}
            >
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--ds-navy)',
                  marginBottom: '0.15rem',
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-sub)' }}>
                {stat.label}
              </div>
              {stat.note && (
                <div style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)' }}>
                  {stat.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </StudioShell>
  )
}
