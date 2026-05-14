import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminManufacturerReviewData } from '@/lib/studio-admin/manufacturer-workspace'
import type { StatusCount } from '@/lib/studio-admin/manufacturer-workspace'

type Props = {
  params: { manufacturerId: string }
}

const STATUS_COLOUR: Record<string, string> = {
  approved:           '#166534',
  in_review:          '#92400e',
  pending_review:     'var(--ds-text-muted)',
  needs_source_check: '#991b1b',
  pending:            'var(--ds-text-muted)',
  rejected:           '#991b1b',
}

function statusColour(status: string): string {
  return STATUS_COLOUR[status] ?? 'var(--ds-text-muted)'
}

function StatusBar({ groups }: { groups: StatusCount[] }) {
  if (groups.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
      {groups.map((g) => (
        <span
          key={g.status}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'var(--ds-page-bg)',
            border: '1px solid var(--ds-border-soft)',
            borderRadius: 4,
            padding: '0.2rem 0.55rem',
            fontSize: '0.78rem',
            color: statusColour(g.status),
            fontWeight: 600,
          }}
        >
          {g.count}{' '}
          <span style={{ fontWeight: 400, opacity: 0.75 }}>
            {g.status.replace(/_/g, ' ')}
          </span>
        </span>
      ))}
    </div>
  )
}

export default async function AdminManufacturerReviewPage({ params }: Props) {
  const { manufacturerId } = params
  const result = await getAdminManufacturerReviewData(manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="Review">
        <div style={{ marginBottom: '1.25rem' }}>
          <a
            href={`/admin/manufacturers/${manufacturerId}`}
            style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
          >
            ← Manufacturer detail
          </a>
        </div>
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const {
    manufacturer: m,
    systems,
    systemCount,
    componentCount,
    profileCount,
    colourCount,
    systemStatusGroups,
    componentStatusGroups,
  } = result

  return (
    <StudioShell role="admin" subtitle={`${m.name} · Review`}>
      <div style={{ marginBottom: '1.25rem' }}>
        <a
          href={`/admin/manufacturers/${manufacturerId}`}
          style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}
        >
          ← {m.name}
        </a>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.35rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Review overview</h1>
        <span
          className={`studio-badge studio-badge-${m.status === 'active' ? 'approved' : 'draft'}`}
        >
          {m.name}
        </span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem' }}>
        Read-only review overview. Field-level correction workflow comes later.
      </p>

      {/* Summary counts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '0.65rem',
          marginBottom: '1.5rem',
        }}
      >
        {[
          { label: 'Systems', value: systemCount },
          { label: 'Components', value: componentCount },
          { label: 'Profiles', value: profileCount },
          { label: 'Colours', value: colourCount },
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

      {/* Systems */}
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
          <span
            style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}
          >
            {systemCount} staged
          </span>
        </div>

        <StatusBar groups={systemStatusGroups} />

        {systems.length === 0 ? (
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
            {systems.map((sys) => (
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

      {/* Components */}
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
          <span
            style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}
          >
            {componentCount} staged
          </span>
        </div>

        <StatusBar groups={componentStatusGroups} />

        {componentCount === 0 && (
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
      {(profileCount > 0 || colourCount > 0) && (
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
            {profileCount > 0 && (
              <span>
                <span style={{ fontSize: '1rem' }}>📐</span>{' '}
                <strong>{profileCount}</strong> profile variants
              </span>
            )}
            {colourCount > 0 && (
              <span>
                <span style={{ fontSize: '1rem' }}>🎨</span>{' '}
                <strong>{colourCount}</strong> colour / finish options
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
          Approve / flag / edit controls are not active yet. Production publish remains
          BuildQuote-admin gated and is not implemented in this view.
        </div>
      </div>
    </StudioShell>
  )
}
