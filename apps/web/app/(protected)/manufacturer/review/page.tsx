import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContext,
  getManufacturerReviewData,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import type { StatusCount } from '@/lib/studio-manufacturer/workspace'

const STATUS_COLOUR: Record<string, string> = {
  approved:          '#166534',
  in_review:         '#92400e',
  pending_review:    'var(--ds-text-muted)',
  needs_source_check: '#991b1b',
  // field_verifications statuses
  pending:           'var(--ds-text-muted)',
  rejected:          '#991b1b',
}

function statusColour(status: string): string {
  return STATUS_COLOUR[status] ?? 'var(--ds-text-muted)'
}

function StatusPill({ status, count }: { status: string; count: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        background: 'var(--ds-page-bg)',
        border: '1px solid var(--ds-border-soft)',
        borderRadius: 4,
        padding: '0.2rem 0.55rem',
        fontSize: '0.78rem',
        color: statusColour(status),
        fontWeight: 600,
      }}
    >
      {count} <span style={{ fontWeight: 400, opacity: 0.75 }}>{status.replace(/_/g, ' ')}</span>
    </span>
  )
}

function StatusBar({ groups }: { groups: StatusCount[] }) {
  if (groups.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
      {groups.map((g) => (
        <StatusPill key={g.status} status={g.status} count={g.count} />
      ))}
    </div>
  )
}

export default async function ManufacturerReviewPage() {
  const session = await getStudioSession()
  const ctx = resolveWorkspaceContext(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Review queue">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Review overview</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerReviewData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Review queue">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Review overview</h1>
        <div className="studio-warn">Could not load review data: {result.error}</div>
      </StudioShell>
    )
  }

  const { data } = result

  return (
    <StudioShell role="manufacturer" subtitle="Review queue">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Review overview</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Read-only snapshot of extracted records awaiting human verification.
        Editing and approval controls come later.
      </p>

      {/* Summary counts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '0.65rem',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Systems', value: data.systemCount },
          { label: 'Components', value: data.componentCount },
          { label: 'Profiles', value: data.profileCount },
          { label: 'Colours', value: data.colourCount },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'var(--ds-card-bg)',
              border: '1px solid var(--ds-border-soft)',
              borderRadius: 8,
              padding: '0.8rem 1rem',
            }}
          >
            <div
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: 'var(--ds-navy)',
                marginBottom: '0.1rem',
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-sub)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Systems section */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.6rem',
            paddingBottom: '0.4rem',
            borderBottom: '1px solid var(--ds-border-soft)',
          }}
        >
          <span style={{ fontSize: '1rem' }}>🏗</span>
          <span
            className="studio-section-heading"
            style={{ margin: 0, border: 'none', padding: 0 }}
          >
            Systems
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
            {data.systemCount} staged
          </span>
        </div>

        {data.systemStatusGroups.length > 0 && (
          <StatusBar groups={data.systemStatusGroups} />
        )}

        {data.systems.length === 0 ? (
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--ds-text-muted)',
              marginTop: '0.75rem',
            }}
          >
            No staged systems yet.
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginTop: '0.65rem',
            }}
          >
            {data.systems.map((sys) => (
              <div
                key={sys.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 6,
                  padding: '0.6rem 0.9rem',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ds-text)' }}>
                    {sys.name}
                  </span>
                  {sys.category && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--ds-text-faint)',
                        marginLeft: '0.4rem',
                      }}
                    >
                      · {sys.category}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: statusColour(sys.verificationStatus),
                    fontWeight: 600,
                  }}
                >
                  {sys.verificationStatus.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Components section */}
      <div className="studio-section">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.6rem',
            paddingBottom: '0.4rem',
            borderBottom: '1px solid var(--ds-border-soft)',
          }}
        >
          <span style={{ fontSize: '1rem' }}>🔩</span>
          <span
            className="studio-section-heading"
            style={{ margin: 0, border: 'none', padding: 0 }}
          >
            Components / Accessories
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
            {data.componentCount} staged
          </span>
        </div>

        {data.componentStatusGroups.length > 0 && (
          <StatusBar groups={data.componentStatusGroups} />
        )}

        {data.componentCount === 0 && (
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--ds-text-muted)',
              marginTop: '0.75rem',
            }}
          >
            No staged components yet.
          </p>
        )}
      </div>

      {/* Profiles & colours summary */}
      {(data.profileCount > 0 || data.colourCount > 0) && (
        <div className="studio-section">
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              flexWrap: 'wrap',
              fontSize: '0.85rem',
              color: 'var(--ds-text-sub)',
            }}
          >
            {data.profileCount > 0 && (
              <span>
                <span style={{ fontSize: '1rem' }}>📐</span>{' '}
                <strong>{data.profileCount}</strong> profile variants
              </span>
            )}
            {data.colourCount > 0 && (
              <span>
                <span style={{ fontSize: '1rem' }}>🎨</span>{' '}
                <strong>{data.colourCount}</strong> colour / finish options
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="studio-section">
        <div
          style={{
            background: 'var(--ds-card-bg)',
            border: '1px solid var(--ds-border-soft)',
            borderRadius: 8,
            padding: '1rem 1.25rem',
            fontSize: '0.85rem',
            color: 'var(--ds-text-muted)',
          }}
        >
          Approve / flag / edit controls are not available yet. Once all records are verified,
          you will be able to mark this workspace as ready for BuildQuote review. Production
          publish remains BuildQuote-admin gated.
        </div>
      </div>
    </StudioShell>
  )
}
