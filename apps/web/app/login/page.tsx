export default function LoginPage() {
  return (
    <div className="studio-page" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>BuildQuote Data Studio</h1>
          <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Manufacturer data review &amp; publishing
          </p>
        </div>

        <div className="studio-warn" style={{ marginBottom: '1.5rem' }}>
          ⚠ Auth not wired yet — this is a shell only. No login logic is connected.
        </div>

        <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: '1.25rem' }}>Sign in</h2>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ds-text-sub)' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              disabled
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                border: '1px solid var(--ds-border)',
                borderRadius: 6,
                fontSize: '0.9rem',
                background: 'var(--ds-page-bg)',
                color: 'var(--ds-text-muted)',
                cursor: 'not-allowed',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--ds-text-sub)' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              disabled
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                border: '1px solid var(--ds-border)',
                borderRadius: 6,
                fontSize: '0.9rem',
                background: 'var(--ds-page-bg)',
                color: 'var(--ds-text-muted)',
                cursor: 'not-allowed',
              }}
            />
          </div>

          <button
            disabled
            className="studio-btn studio-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Sign in — not connected yet
          </button>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
          <p style={{ margin: '0 0 0.5rem' }}>While auth is not connected, navigate directly:</p>
          <a href="/admin/manufacturers" style={{ marginRight: '1rem' }}>→ Admin shell</a>
          <a href="/manufacturer/dashboard">→ Manufacturer shell</a>
        </div>
      </div>
    </div>
  )
}
