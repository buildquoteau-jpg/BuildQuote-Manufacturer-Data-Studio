import { StudioCard } from '../../components/studio/StudioCard'

export default function DashboardPage() {
  return (
    <div className="studio-page">
      <header className="studio-header">
        <a href="/dashboard">BuildQuote Data Studio</a>
      </header>

      <main className="studio-main">
        <div className="studio-warn">
          ⚠ Auth not wired yet — role-based redirect not connected. Choose a shell to navigate:
        </div>

        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Dashboard</h1>
        <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
          Once auth is connected, this page will redirect based on your role.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 8, padding: '1.25rem', background: 'var(--ds-card-bg)' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="studio-badge studio-badge-admin">Admin</span>
            </div>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>BuildQuote Admin</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1rem' }}>
              Universal access across all manufacturer workspaces. Review, approve, and publish data.
            </p>
            <a href="/admin/manufacturers" className="studio-btn studio-btn-primary" style={{ fontSize: '0.85rem' }}>
              Open admin shell →
            </a>
          </div>

          <div style={{ border: '1px solid var(--ds-border)', borderRadius: 8, padding: '1.25rem', background: 'var(--ds-card-bg)' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <span className="studio-badge studio-badge-mfr">Manufacturer</span>
            </div>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>Manufacturer User</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1rem' }}>
              Access your own workspace. Upload documents, review extracted data, preview your public page.
            </p>
            <a href="/manufacturer/dashboard" className="studio-btn studio-btn-primary" style={{ fontSize: '0.85rem' }}>
              Open manufacturer shell →
            </a>
          </div>
        </div>

        <div style={{ marginTop: '2rem', fontSize: '0.82rem', color: 'var(--ds-text-faint)' }}>
          <a href="/login">← Back to login shell</a>
        </div>
      </main>
    </div>
  )
}
