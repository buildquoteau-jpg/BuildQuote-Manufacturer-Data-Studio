import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminManufacturerList } from '@/lib/studio-admin/manufacturers'

export default async function AdminManufacturersPage() {
  const result = await getAdminManufacturerList()

  return (
    <StudioShell role="admin" subtitle="Manufacturer workspaces">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Manufacturer workspaces</h1>
        <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
          Read-only overview of Data Studio manufacturer workspaces.
        </span>
      </div>

      <div className="studio-info" style={{ marginBottom: '1.25rem' }}>
        BuildQuote admin has read access across all manufacturer workspaces.
        Production publish is admin-gated and server-side only.
      </div>

      {!result.ok ? (
        <div className="studio-warn">
          Could not load manufacturers: {result.error}
        </div>
      ) : result.manufacturers.length === 0 ? (
        <div
          style={{
            background: 'var(--ds-card-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 8,
            padding: '2rem 1.25rem',
            textAlign: 'center',
            color: 'var(--ds-text-muted)',
            fontSize: '0.9rem',
          }}
        >
          No manufacturer workspaces found in the local database.
          <br />
          <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-faint)', marginTop: '0.4rem', display: 'block' }}>
            Run <code>supabase db reset</code> locally to apply migrations and seed data.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {result.manufacturers.map((m) => (
            <a
              key={m.id}
              href={`/admin/manufacturers/${m.id}`}
              style={{
                background: 'var(--ds-card-bg)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8,
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.15s',
              }}
            >
              {/* Name + slug */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--ds-navy)',
                    marginBottom: '0.2rem',
                    fontSize: '0.95rem',
                  }}
                >
                  {m.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
                  {m.slug}
                  {' · '}
                  {m.documentCount} doc{m.documentCount !== 1 ? 's' : ''}
                  {' · '}
                  {m.systemCount} system{m.systemCount !== 1 ? 's' : ''}
                  {' · '}
                  {m.componentCount} component{m.componentCount !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Status + arrow */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                <span
                  className={`studio-badge studio-badge-${
                    m.status === 'active' ? 'approved' : m.status === 'archived' ? 'draft' : 'draft'
                  }`}
                >
                  {m.status}
                </span>
                <span style={{ color: 'var(--ds-text-faint)', fontSize: '0.85rem' }}>→</span>
              </div>
            </a>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem 1.25rem',
          background: 'var(--ds-card-bg)',
          border: '1px solid var(--ds-border-soft)',
          borderRadius: 8,
          fontSize: '0.82rem',
          color: 'var(--ds-text-muted)',
        }}
      >
        Manufacturer workspace management (invite users, create workspaces, suspend access)
        is coming in a later release.
      </div>
    </StudioShell>
  )
}
