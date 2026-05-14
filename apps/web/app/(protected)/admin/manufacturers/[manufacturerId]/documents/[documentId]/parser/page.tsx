import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminParserInspection } from '@/lib/studio-admin/parser-inspection'
import type {
  ParserStagedSystem,
  ParserStagedProfile,
  ParserStagedComponent,
  ParserStagedColour,
  ParserStagedLink,
  ParserFieldVerification,
  ParserFieldEvidence,
  ParserExtractionRun,
  ParserInspectionCounts,
} from '@/lib/studio-admin/parser-inspection'

type Props = {
  params: { manufacturerId: string; documentId: string }
}

// ----------------------------------------------------------
// Utilities
// ----------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

const VSTAT_COLOUR: Record<string, string> = {
  approved:           '#166534',
  pending_review:     'var(--ds-text-muted)',
  needs_source_check: '#991b1b',
  rejected:           '#991b1b',
}

function vstatColour(s: string): string {
  return VSTAT_COLOUR[s] ?? 'var(--ds-text-muted)'
}

// ----------------------------------------------------------
// Sub-components
// ----------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="studio-section-heading">{children}</div>
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.83rem', padding: '0.3rem 0', borderBottom: '1px solid var(--ds-border-soft)' }}>
      <span style={{ color: 'var(--ds-text-faint)', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--ds-text-muted)' }}>{value}</span>
    </div>
  )
}

function CountGrid({ counts }: { counts: ParserInspectionCounts }) {
  const rows: [string, number][] = [
    ['Systems', counts.stagedSystems],
    ['Profiles', counts.stagedProfiles],
    ['Components', counts.stagedComponents],
    ['Colours', counts.stagedColours],
    ['Links', counts.stagedLinks],
    ['Field verifications', counts.fieldVerifications],
    ['Parser field evidence', counts.parserFieldEvidence],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
      {rows.map(([label, count]) => (
        <div
          key={label}
          style={{
            background: 'var(--ds-card-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 8,
            padding: '0.6rem 0.85rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: count > 0 ? 'var(--ds-text)' : 'var(--ds-text-faint)' }}>{count}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)', marginTop: '0.1rem' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

function RunPanel({ run }: { run: ParserExtractionRun }) {
  const statusColour = run.status === 'completed' ? '#166534' : run.status === 'failed' ? '#991b1b' : 'var(--ds-text-muted)'
  return (
    <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
      <MetaRow label="Run ID" value={<code style={{ fontSize: '0.78rem' }}>{run.id}</code>} />
      <MetaRow label="Type" value={run.runType.replace(/_/g, ' ')} />
      <MetaRow label="Status" value={<span style={{ color: statusColour, fontWeight: 600 }}>{run.status}</span>} />
      <MetaRow label="Tool" value={run.toolName ?? '—'} />
      <MetaRow label="Started" value={formatDate(run.startedAt)} />
      <MetaRow label="Completed" value={formatDate(run.completedAt)} />
      {run.errorMessage && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--ds-text-muted)', background: 'var(--ds-warn-bg)', borderRadius: 4, padding: '0.35rem 0.55rem' }}>
          Error: {run.errorMessage}
        </div>
      )}
    </div>
  )
}

function Badge({ text, colour }: { text: string; colour?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.7rem',
      fontWeight: 600,
      color: colour ?? 'var(--ds-text-muted)',
      background: 'var(--ds-border-soft)',
      borderRadius: 3,
      padding: '0.1rem 0.4rem',
    }}>
      {text.replace(/_/g, ' ')}
    </span>
  )
}

function SystemsTable({ systems }: { systems: ParserStagedSystem[] }) {
  if (systems.length === 0) return <div style={{ color: 'var(--ds-text-faint)', fontSize: '0.83rem' }}>No systems found.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
            {['Name', 'Product code', 'Category', 'Confidence', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {systems.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{s.name}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{s.productCode ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{s.category ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{pct(s.extractionConfidence)}</td>
              <td style={{ padding: '0.35rem 0.5rem' }}><Badge text={s.verificationStatus} colour={vstatColour(s.verificationStatus)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProfilesTable({ profiles }: { profiles: ParserStagedProfile[] }) {
  if (profiles.length === 0) return <div style={{ color: 'var(--ds-text-faint)', fontSize: '0.83rem' }}>No profiles found.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
            {['Profile name', 'Product code', 'UOM', 'L×W×T (mm)', 'Pack format', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const dims = [p.lengthMm, p.widthMm, p.thicknessMm]
              .map((v) => (v !== null ? String(v) : '—'))
              .join(' × ')
            return (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{p.profileName ?? p.name ?? '—'}</td>
                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.productCode ?? '—'}</td>
                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.uom ?? '—'}</td>
                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{dims}</td>
                <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.packFormat ?? '—'}</td>
                <td style={{ padding: '0.35rem 0.5rem' }}><Badge text={p.verificationStatus} colour={vstatColour(p.verificationStatus)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ComponentsTable({ components }: { components: ParserStagedComponent[] }) {
  if (components.length === 0) return <div style={{ color: 'var(--ds-text-faint)', fontSize: '0.83rem' }}>No components found.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
            {['Name', 'SKU', 'Category', 'UOM', 'Pack format', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{c.name}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.sku ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.category ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.uom ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.packFormat ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem' }}><Badge text={c.verificationStatus} colour={vstatColour(c.verificationStatus)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ColoursTable({ colours }: { colours: ParserStagedColour[] }) {
  if (colours.length === 0) return <div style={{ color: 'var(--ds-text-faint)', fontSize: '0.83rem' }}>No colours found.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
            {['Colour name', 'SKU', 'SKU suffix', 'Stocked', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colours.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{c.colourName}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.sku ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.skuSuffix ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{c.isStocked ? 'Yes' : 'No'}</td>
              <td style={{ padding: '0.35rem 0.5rem' }}><Badge text={c.verificationStatus} colour={vstatColour(c.verificationStatus)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinksPanel({ links, orphanLinkCount }: { links: ParserStagedLink[]; orphanLinkCount: number }) {
  return (
    <>
      <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: '0.5rem' }}>
        {links.length} system–component link{links.length !== 1 ? 's' : ''}
        {orphanLinkCount > 0 && (
          <span style={{ marginLeft: '0.5rem', color: '#991b1b', fontWeight: 600 }}>
            ⚠ {orphanLinkCount} orphan link{orphanLinkCount !== 1 ? 's' : ''} (component not in document scope)
          </span>
        )}
      </div>
      {links.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                {['Role', 'Notes'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.slice(0, 50).map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)' }}>{l.role}</td>
                  <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{l.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {links.length > 50 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
              Showing 50 of {links.length} links.
            </div>
          )}
        </div>
      )}
    </>
  )
}

function EvidencePanel({ fieldVerifications, parserFieldEvidence }: { fieldVerifications: ParserFieldVerification[]; parserFieldEvidence: ParserFieldEvidence[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Field verifications */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--ds-text-muted)' }}>
          Field verifications ({fieldVerifications.length})
        </div>
        {fieldVerifications.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>None found for this document.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.77rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                  {['Entity type', 'Field', 'Extracted value', 'Status', 'Page'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldVerifications.slice(0, 80).map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{f.entityType}</td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)' }}>{f.fieldName}</td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.extractedValue ?? '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem' }}><Badge text={f.status} /></td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{f.sourcePageNumber ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fieldVerifications.length > 80 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
                Showing 80 of {fieldVerifications.length} rows.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Parser field evidence */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--ds-text-muted)' }}>
          Parser field evidence ({parserFieldEvidence.length})
        </div>
        {parserFieldEvidence.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
            No parser field evidence for this extraction run.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.77rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                  {['Entity type', 'Field', 'Extracted value', 'Confidence', 'Uncertain', 'Page'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parserFieldEvidence.slice(0, 80).map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--ds-border-soft)', opacity: p.isUncertain ? 0.7 : 1 }}>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{p.entityType}</td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.fieldName}</td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.extractedValue ?? '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>
                      {p.confidence !== null ? pct(p.confidence) : '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', color: p.isUncertain ? '#92400e' : 'var(--ds-text-faint)' }}>
                      {p.isUncertain ? 'yes' : '—'}
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{p.sourcePageNumber ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parserFieldEvidence.length > 80 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
                Showing 80 of {parserFieldEvidence.length} rows.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------
// Page
// ----------------------------------------------------------

export default async function AdminParserInspectionPage({ params }: Props) {
  const { manufacturerId, documentId } = params
  const result = await getAdminParserInspection(manufacturerId, documentId)

  const breadcrumb = (
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--ds-text-faint)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
      <a href={`/admin/manufacturers/${manufacturerId}`} style={{ color: 'var(--ds-text-muted)' }}>
        {result.ok ? result.manufacturer.name : 'Manufacturer'}
      </a>
      <span>›</span>
      <a href={`/admin/manufacturers/${manufacturerId}/documents`} style={{ color: 'var(--ds-text-muted)' }}>Documents</a>
      <span>›</span>
      <a href={`/admin/manufacturers/${manufacturerId}/documents/${documentId}`} style={{ color: 'var(--ds-text-muted)' }}>
        {result.ok ? result.documentName : documentId}
      </a>
      <span>›</span>
      <span>Parser inspection</span>
    </div>
  )

  if (!result.ok) {
    return (
      <StudioShell role="admin" subtitle="Parser inspection">
        {breadcrumb}
        <div className="studio-warn">{result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer: m, documentName, documentStatus, parseRun, counts, systems, profiles, components, colours, links, fieldVerifications, parserFieldEvidence, orphanLinkCount } = result

  const hasData = counts.stagedSystems > 0 || counts.stagedComponents > 0

  return (
    <StudioShell role="admin" subtitle={`${m.name} · ${documentName} · Parser`}>
      {breadcrumb}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <h1 style={{ fontSize: '1.2rem' }}>Parser staging inspection</h1>
        <span className={`studio-badge studio-badge-${documentStatus === 'parsed' || documentStatus === 'approved' ? 'approved' : 'draft'}`}>
          {documentStatus}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', fontWeight: 400 }}>read-only</span>
      </div>
      <p style={{ fontSize: '0.83rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem' }}>
        {m.name} · {documentName}
      </p>

      {/* No data warning */}
      {!hasData && (
        <div className="studio-warn" style={{ marginBottom: '1.5rem' }}>
          No staged parser data found for this document. Run <code>pnpm parser:insert-local</code> first.
        </div>
      )}

      {/* Orphan warning */}
      {orphanLinkCount > 0 && (
        <div className="studio-warn" style={{ marginBottom: '1rem' }}>
          {orphanLinkCount} system–component link{orphanLinkCount !== 1 ? 's' : ''} reference a component not found in this document's staged_components. Run <code>pnpm parser:verify-local-insert</code> for details.
        </div>
      )}

      {/* Count summary */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <SectionHeading>Staged row counts</SectionHeading>
        <CountGrid counts={counts} />
      </div>

      {/* Extraction run */}
      {parseRun && (
        <div className="studio-section">
          <SectionHeading>Parse extraction run</SectionHeading>
          <RunPanel run={parseRun} />
        </div>
      )}

      {/* Systems */}
      <div className="studio-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.3rem' }}>
          <SectionHeading>Systems ({counts.stagedSystems})</SectionHeading>
          {counts.stagedSystems > systems.length && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>showing first {systems.length}</span>
          )}
        </div>
        <SystemsTable systems={systems} />
      </div>

      {/* Profiles */}
      <div className="studio-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.3rem' }}>
          <SectionHeading>Profiles ({counts.stagedProfiles})</SectionHeading>
          {counts.stagedProfiles > profiles.length && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>showing first {profiles.length}</span>
          )}
        </div>
        <ProfilesTable profiles={profiles} />
      </div>

      {/* Components */}
      <div className="studio-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.3rem' }}>
          <SectionHeading>Components ({counts.stagedComponents})</SectionHeading>
          {counts.stagedComponents > components.length && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>showing first {components.length}</span>
          )}
        </div>
        <ComponentsTable components={components} />
      </div>

      {/* Colours */}
      <div className="studio-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.3rem' }}>
          <SectionHeading>Colours ({counts.stagedColours})</SectionHeading>
          {counts.stagedColours > colours.length && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)' }}>showing first {colours.length}</span>
          )}
        </div>
        <ColoursTable colours={colours} />
      </div>

      {/* Links */}
      <div className="studio-section">
        <SectionHeading>System–component links ({counts.stagedLinks})</SectionHeading>
        <LinksPanel links={links} orphanLinkCount={orphanLinkCount} />
      </div>

      {/* Evidence */}
      <div className="studio-section">
        <SectionHeading>Extraction evidence</SectionHeading>
        <EvidencePanel fieldVerifications={fieldVerifications} parserFieldEvidence={parserFieldEvidence} />
      </div>

      {/* Footer */}
      <div style={{ marginTop: '1rem', fontSize: '0.77rem', color: 'var(--ds-text-faint)', lineHeight: 1.6 }}>
        Read-only inspection · No storage paths, keys, or secrets shown ·
        Rows capped at 150 per table · Run <code>pnpm parser:verify-local-insert</code> for full CLI report
      </div>
    </StudioShell>
  )
}
