import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminManufacturerList } from '@/lib/studio-admin/manufacturers'
import { ManufacturersList } from './WorkspaceGateModal'
import { NewManufacturerButton } from './NewManufacturerButton'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
            Overview of Data Studio manufacturer workspaces.
          </span>
          <NewManufacturerButton />
        </div>
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
        <ManufacturersList manufacturers={result.manufacturers} />
      )}

    </StudioShell>
  )
}
