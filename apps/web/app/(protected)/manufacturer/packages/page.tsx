import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { getPackagesPageData } from '@/lib/studio-manufacturer/packages'
import { CARD_READINESS_LABELS, type CardReadiness } from '@/lib/packages/readiness'
import { packageStatusLabel } from '@/lib/statuses'
import { StudioShell } from '@/components/studio/StudioShell'

// The Packages page is the handover product of the whole Studio: a static
// System Card website ZIP the manufacturer installs on their own site
// (default /system-cards/). BuildQuote is the card factory — the
// manufacturer's website is the public home of the finished cards.

const READINESS_CHIP_COLOURS: Record<CardReadiness['status'], { bg: string; fg: string }> = {
  ready:              { bg: '#dcfce7', fg: '#166534' },
  needs_approval:     { bg: '#fef3c7', fg: '#92400e' },
  needs_asset_import: { bg: '#fef3c7', fg: '#92400e' },
  needs_guide_url:    { bg: '#fef3c7', fg: '#92400e' },
  missing_data:       { bg: '#fee2e2', fg: '#991b1b' },
}

function ReadinessChip({ status }: { status: CardReadiness['status'] }) {
  const colours = READINESS_CHIP_COLOURS[status]
  return (
    <span style={{
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      padding: '0.18rem 0.6rem', borderRadius: 999,
      background: colours.bg, color: colours.fg,
    }}>
      {CARD_READINESS_LABELS[status]}
    </span>
  )
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function ManufacturerPackagesPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Packages">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Packages</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getPackagesPageData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Packages">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Packages</h1>
        <div className="studio-warn">Could not load package data: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, readiness, packages, packagesMigrationMissing, assetsMigrationMissing } = result.data
  const installPath = '/system-cards/'
  const websiteBase = (manufacturer.websiteUrl ?? 'https://your-website.com.au').replace(/\/$/, '')

  return (
    <StudioShell role="manufacturer" workspaceName={manufacturer.name} subtitle="Packages">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>System Card Website Package</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem', maxWidth: 760 }}>
        Your approved System Cards can be exported as a self-contained static website package and
        installed on your own website — typically at{' '}
        <code style={{ fontSize: '0.8rem' }}>{websiteBase}{installPath}</code>. The package includes a
        branded collection page, one page per card (with selectable line items, shopping list and
        PNG sharing), local image assets, QR codes and embed snippets. No BuildQuote hosting required.
      </p>

      {(packagesMigrationMissing || assetsMigrationMissing) && (
        <div className="studio-info" style={{ marginBottom: '1rem' }}>
          Database migrations {assetsMigrationMissing ? '046 ' : ''}
          {packagesMigrationMissing ? (assetsMigrationMissing ? 'and 047 ' : '047 ') : ''}
          have not been applied to this Supabase project yet — readiness checks run in a reduced
          mode and package records cannot be stored until they are.
        </div>
      )}

      {/* ── Readiness ── */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <div className="studio-section-heading">Package readiness</div>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#166534' }}>{readiness.readyCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>cards ready to package</div>
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: readiness.blockedCount ? '#92400e' : 'var(--ds-text-faint)' }}>
              {readiness.blockedCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>cards with blockers</div>
          </div>
        </div>

        {readiness.manufacturer.blockers.length > 0 && (
          <div className="studio-warn" style={{ marginBottom: '0.75rem' }}>
            <strong>Brand profile blockers:</strong>
            <ul style={{ margin: '0.35rem 0 0 1.1rem', padding: 0 }}>
              {readiness.manufacturer.blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}
        {readiness.manufacturer.warnings.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#92400e', marginBottom: '0.75rem' }}>
            {readiness.manufacturer.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}

        {readiness.cards.length === 0 ? (
          <div className="studio-info">
            No System Cards yet. Cards appear here once they are created from your documents in
            Verify Systems.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {readiness.cards.map((card) => (
              <div
                key={card.cardId}
                style={{
                  padding: '0.6rem 0.85rem',
                  background: 'var(--ds-card-bg)',
                  border: '1px solid var(--ds-border-soft)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1, minWidth: 180 }}>
                    {card.name}
                  </span>
                  <code style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)' }}>
                    {installPath}cards/{card.slug}/
                  </code>
                  <ReadinessChip status={card.status} />
                </div>
                {card.blockers.length > 0 && (
                  <ul style={{ margin: '0.4rem 0 0 1.1rem', padding: 0, fontSize: '0.78rem', color: '#991b1b' }}>
                    {card.blockers.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                {card.warnings.length > 0 && (
                  <ul style={{ margin: '0.3rem 0 0 1.1rem', padding: 0, fontSize: '0.76rem', color: '#92400e' }}>
                    {card.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Generate ── */}
      <div className="studio-section">
        <div className="studio-section-heading">Generate a package</div>
        <p style={{ fontSize: '0.83rem', color: 'var(--ds-text-muted)', marginBottom: '0.75rem', maxWidth: 720 }}>
          Generating bundles every <strong>Ready to package</strong> card into one downloadable ZIP.
          Cards with blockers are left out — fix the blockers above and regenerate to include them.
        </p>
        <button
          className="studio-btn studio-btn-primary"
          disabled
          title="Package generation is being rolled out — readiness checks are live now."
          style={{ opacity: 0.55, cursor: 'not-allowed' }}
        >
          Generate package
        </button>
        <p style={{ fontSize: '0.76rem', color: 'var(--ds-text-faint)', marginTop: '0.5rem' }}>
          Package generation is being rolled out — readiness checks are live now, and the generate
          button will activate here shortly.
        </p>
      </div>

      {/* ── Generated packages ── */}
      <div className="studio-section">
        <div className="studio-section-heading">Generated packages</div>
        {packages.length === 0 ? (
          <div className="studio-info">
            No packages generated yet. Once your first package is generated it appears here with
            download links for the ZIP, QR pack, link list and embed snippets.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--ds-text-muted)', fontSize: '0.74rem' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Version</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Status</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Cards</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Size</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Generated</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>By</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.id} style={{ borderTop: '1px solid var(--ds-border-soft)' }}>
                    <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>v{pkg.packageVersion}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{packageStatusLabel(pkg.status)}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{pkg.cardCount}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{formatBytes(pkg.fileSizeBytes)}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{formatDate(pkg.generatedAt ?? pkg.createdAt)}</td>
                    <td style={{ padding: '0.5rem 0.6rem' }}>{pkg.generatedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Install guide ── */}
      <div className="studio-section" id="install-guide">
        <div className="studio-section-heading">Install guide</div>
        <ol style={{ fontSize: '0.85rem', color: 'var(--ds-text)', margin: '0 0 0.9rem 1.2rem', padding: 0, lineHeight: 1.8 }}>
          <li>Download the package ZIP and unzip it. You get one <code>system-cards</code> folder.</li>
          <li>
            Upload the whole folder to your website so it is reachable at{' '}
            <code>{websiteBase}{installPath}</code> — via your web developer, hosting file manager,
            FTP, or your CMS&apos;s static file area.
          </li>
          <li>
            Open <code>{websiteBase}{installPath}</code> in a browser — you should see your branded
            collection page with every included card.
          </li>
          <li>
            Link to it from your site navigation (e.g. a &quot;System Cards&quot; menu item), and
            use the included QR pack and link list in print material and quotes.
          </li>
        </ol>
        <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', maxWidth: 720 }}>
          Every card page works entirely offline-from-BuildQuote: images are bundled locally and the
          shopping list / PNG sharing run in the visitor&apos;s browser. A more detailed
          <code> install-guide.html</code> ships inside each ZIP.
          On Wix or other builders that can&apos;t host uploaded folders, use{' '}
          <a href="/manufacturer/widgets" style={{ color: 'var(--ds-teal)' }}>Embeds &amp; Links</a>{' '}
          instead.
        </p>
      </div>
    </StudioShell>
  )
}
