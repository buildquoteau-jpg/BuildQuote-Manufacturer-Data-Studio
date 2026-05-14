import { StudioShell } from '@/components/studio/StudioShell'

const PLACEHOLDER_MANUFACTURERS = [
  { id: 'demo-1', name: 'Acme Aluminium', slug: 'acme-aluminium', status: 'active', systems: 4, docsCount: 3 },
  { id: 'demo-2', name: 'Prestige Windows', slug: 'prestige-windows', status: 'draft', systems: 0, docsCount: 1 },
]

export default function AdminManufacturersPage() {
  return (
    <StudioShell role="admin" subtitle="All manufacturers">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.25rem' }}>Manufacturers</h1>
        <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
          Placeholder data — database not connected to this view yet
        </span>
      </div>

      <div className="studio-info">
        BuildQuote admin will have universal access across all manufacturer workspaces.
        Production publish is admin-gated and server-side only.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {PLACEHOLDER_MANUFACTURERS.map((m) => (
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
              gap: '0.5rem',
              textDecoration: 'none',
              color: 'inherit',
              transition: 'box-shadow 0.15s',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ds-navy)', marginBottom: '0.2rem' }}>{m.name}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                {m.slug} · {m.docsCount} doc{m.docsCount !== 1 ? 's' : ''} · {m.systems} system{m.systems !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                className={`studio-badge studio-badge-${m.status === 'active' ? 'approved' : 'draft'}`}
              >
                {m.status}
              </span>
              <span style={{ color: 'var(--ds-text-faint)', fontSize: '0.85rem' }}>→</span>
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border-soft)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
        Manufacturer management (invite, create workspace, suspend) will appear here once auth is wired.
      </div>
    </StudioShell>
  )
}
