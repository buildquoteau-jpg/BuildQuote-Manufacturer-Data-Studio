import { getStudioSession } from '@/lib/studio-auth/session'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioCard } from '@/components/studio/StudioCard'

export default async function ManufacturerDashboardPage() {
  const session = await getStudioSession()
  // Manufacturer layout already guarantees an active membership exists.
  const membership = session.memberships[0]

  const displayName = session.profile?.fullName ?? session.profile?.email ?? 'Your workspace'

  return (
    <StudioShell role="manufacturer" subtitle={displayName}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>Dashboard</h1>
      <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Welcome to BuildQuote Data Studio. Manage your product data, review extractions, and
        preview your public page.
      </p>

      {/* Workspace summary — real session data, no extra DB query */}
      {membership && (
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
            <code style={{ fontSize: '0.78rem', background: 'var(--ds-page-bg)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>
              {membership.manufacturerId.slice(0, 8)}…
            </code>
          </span>
          <span>
            <span style={{ color: 'var(--ds-text-faint)' }}>Your role · </span>
            <strong>{membership.role}</strong>
          </span>
          <span>
            <span style={{ color: 'var(--ds-text-faint)' }}>Status · </span>
            <span style={{ color: '#166534', fontWeight: 600 }}>{membership.status}</span>
          </span>
          <span style={{ color: 'var(--ds-text-faint)', fontStyle: 'italic', marginLeft: 'auto' }}>
            Manufacturer name connected once DB is wired
          </span>
        </div>
      )}

      <div className="studio-card-grid">
        <StudioCard
          icon="📄"
          title="Documents"
          description="Upload product guides, install guides, and brochures for extraction."
          href="/manufacturer/documents"
        />
        <StudioCard
          icon="⚙️"
          title="Extraction Runs"
          description="View AI extraction run results from your uploaded documents."
          disabled
          href="/manufacturer/dashboard"
        />
        <StudioCard
          icon="✅"
          title="Review Staged Data"
          description="Verify extracted systems, profiles, components, and colours."
          href="/manufacturer/review"
        />
        <StudioCard
          icon="👁"
          title="Preview Public Page"
          description="See how your manufacturer page and system cards will look before publish."
          href="/manufacturer/preview"
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Documents', value: '—', note: 'not connected' },
            { label: 'Extraction runs', value: '—', note: 'not connected' },
            { label: 'Staged systems', value: '—', note: 'not connected' },
            { label: 'Components', value: '—', note: 'not connected' },
            { label: 'Publish status', value: '—', note: 'not published' },
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
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ds-navy)', marginBottom: '0.15rem' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-text-sub)' }}>{stat.label}</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)' }}>{stat.note}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginTop: '0.5rem' }}>
          Placeholder counts — database queries not connected yet.
        </p>
      </div>
    </StudioShell>
  )
}
