import { StudioShell } from '@/components/studio/StudioShell'
import { getAdminParserInspection } from '@/lib/studio-admin/parser-inspection'
import { computeHealthWarnings } from '@/lib/studio-admin/parser-inspection-health'
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
  EvidenceCoverage,
} from '@/lib/studio-admin/parser-inspection'
import type { HealthWarning } from '@/lib/studio-admin/parser-inspection-health'

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

function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function fmtN(n: number | null): string {
  return n !== null ? String(n) : '—'
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

const SEV_COLOUR: Record<string, string> = {
  error: '#991b1b',
  warn:  '#92400e',
  info:  'var(--ds-text-muted)',
}

const SEV_BG: Record<string, string> = {
  error: '#fef2f2',
  warn:  '#fffbeb',
  info:  'var(--ds-card-bg)',
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

function CountGrid({ counts, evidenceCoverage }: { counts: ParserInspectionCounts; evidenceCoverage: EvidenceCoverage }) {
  const rows: [string, string][] = [
    ['Systems', String(counts.stagedSystems)],
    ['Profiles', String(counts.stagedProfiles)],
    ['Components', String(counts.stagedComponents)],
    ['Colours', String(counts.stagedColours)],
    ['Links', String(counts.stagedLinks)],
    ['Field verifications', String(counts.fieldVerifications)],
    ['Parser field evidence', String(counts.parserFieldEvidence)],
    ['Evidence coverage', evidenceCoverage.entitiesTotal > 0 ? `${evidenceCoverage.pct}%` : '—'],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
      {rows.map(([label, val]) => {
        const n = parseInt(val, 10)
        const isEmpty = !isNaN(n) && n === 0
        return (
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
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isEmpty ? 'var(--ds-text-faint)' : 'var(--ds-text)' }}>{val}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-faint)', marginTop: '0.1rem' }}>{label}</div>
          </div>
        )
      })}
    </div>
  )
}

function HealthPanel({ warnings }: { warnings: HealthWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div style={{ fontSize: '0.83rem', color: '#166534', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0' }}>
        No issues detected.
      </div>
    )
  }
  const sorted = [...warnings].sort((a, b) => {
    const order = { error: 0, warn: 1, info: 2 }
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {sorted.map((w) => (
        <div
          key={w.code}
          style={{
            fontSize: '0.82rem',
            padding: '0.45rem 0.75rem',
            borderRadius: 6,
            border: `1px solid ${SEV_COLOUR[w.severity]}33`,
            background: SEV_BG[w.severity],
            color: SEV_COLOUR[w.severity],
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontWeight: 700, flexShrink: 0 }}>
            {w.severity === 'error' ? '✕' : w.severity === 'warn' ? '!' : 'i'}
          </span>
          <span>
            <span style={{ fontWeight: 600, marginRight: '0.35rem' }}>[{w.code}]</span>
            {w.message}
          </span>
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

function SystemsTable({ systems }: { systems: ParserStagedSystem[] }) {
  if (systems.length === 0) return <div style={{ color: 'var(--ds-text-faint)', fontSize: '0.83rem' }}>No systems found.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
            {['Name', 'Product code', 'Category', 'Profiles', 'Colours', 'Links', 'BAL', 'Confidence', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {systems.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>
                <div>{s.name}</div>
                {s.description && (
                  <div style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)', marginTop: 1, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description}</div>
                )}
              </td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{s.productCode ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{s.category ?? '—'}{s.subcategory ? ` / ${s.subcategory}` : ''}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: s.profileCount > 0 ? 'var(--ds-text)' : 'var(--ds-text-faint)', textAlign: 'right' }}>{s.profileCount}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: s.colourCount > 0 ? 'var(--ds-text)' : 'var(--ds-text-faint)', textAlign: 'right' }}>{s.colourCount}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: s.linkCount > 0 ? 'var(--ds-text)' : 'var(--ds-text-faint)', textAlign: 'right' }}>{s.linkCount}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{s.balRating ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{fmtPct(s.extractionConfidence)}</td>
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
            {['Profile name', 'Product code', 'UOM', 'L (mm)', 'W (mm)', 'T (mm)', 'H (mm)', 'D (mm)', 'Ø (mm)', 'Roll (m)', 'Pack format', 'Pack qty', 'Pack UOM', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>{p.profileName ?? p.name ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.productCode ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.uom ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.lengthMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.widthMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.thicknessMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.heightMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.depthMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.diameterMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.rollM)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.packFormat ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(p.supplierPackQty)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{p.supplierPackUom ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem' }}><Badge text={p.verificationStatus} colour={vstatColour(p.verificationStatus)} /></td>
            </tr>
          ))}
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
            {['Name', 'SKU', 'Category', 'UOM', 'Material', 'Finish', 'Colour', 'L (mm)', 'W (mm)', 'T (mm)', 'Pack format', 'Pack qty', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
              <td style={{ padding: '0.35rem 0.5rem', fontWeight: 500 }}>
                <div>{c.name}</div>
                {c.description && (
                  <div style={{ fontSize: '0.73rem', color: 'var(--ds-text-faint)', marginTop: 1, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                )}
              </td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.sku ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.category ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.uom ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{c.material ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{c.finish ?? (c.colour ?? '—')}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)' }}>{c.colour ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(c.lengthMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(c.widthMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(c.thicknessMm)}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-muted)' }}>{c.packFormat ?? '—'}</td>
              <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ds-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtN(c.supplierPackQty)}</td>
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
                {['Role', 'Notes', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.slice(0, 60).map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--ds-border-soft)' }}>
                  <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)' }}>{l.role}</td>
                  <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{l.notes ?? '—'}</td>
                  <td style={{ padding: '0.3rem 0.5rem' }}><Badge text={l.verificationStatus} colour={vstatColour(l.verificationStatus)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {links.length > 60 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
              Showing 60 of {links.length} links.
            </div>
          )}
        </div>
      )}
    </>
  )
}

function EvidenceByType({ items, label }: { items: ParserFieldEvidence[] | ParserFieldVerification[]; label: string }) {
  const grouped: Record<string, typeof items> = {}
  for (const item of items) {
    const et = item.entityType
    if (!grouped[et]) grouped[et] = []
    grouped[et].push(item as never)
  }
  const types = Object.keys(grouped).sort()

  if (items.length === 0) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>No {label.toLowerCase()} found.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {types.map((et) => (
        <div key={et}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-text-faint)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {et.replace(/_/g, ' ')} ({grouped[et].length})
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
            {grouped[et].slice(0, 5).map((item: ParserFieldEvidence | ParserFieldVerification) =>
              'confidence' in item
                ? `${item.fieldName}=${item.extractedValue ?? '—'} (${item.confidence !== null ? fmtPct(item.confidence) : '?'}${item.isUncertain ? ' ?' : ''})`
                : `${item.fieldName}=${item.extractedValue ?? '—'} [${item.status}]`
            ).join(' · ')}
            {grouped[et].length > 5 && ` · +${grouped[et].length - 5} more`}
          </div>
        </div>
      ))}
    </div>
  )
}

function EvidencePanel({ fieldVerifications, parserFieldEvidence }: { fieldVerifications: ParserFieldVerification[]; parserFieldEvidence: ParserFieldEvidence[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Field verifications */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ds-text-muted)' }}>
          Field verifications ({fieldVerifications.length})
        </div>
        {fieldVerifications.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>None found for this document.</div>
        ) : (
          <>
            <EvidenceByType items={fieldVerifications} label="Field verifications" />
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', cursor: 'pointer' }}>
                Show full table ({fieldVerifications.length} rows)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                <table style={{ width: '100%', fontSize: '0.77rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                      {['Entity type', 'Field', 'Extracted value', 'Status', 'Page'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldVerifications.slice(0, 100).map((f) => (
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
                {fieldVerifications.length > 100 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
                    Showing 100 of {fieldVerifications.length} rows.
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </div>

      {/* Parser field evidence */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ds-text-muted)' }}>
          Parser field evidence ({parserFieldEvidence.length})
        </div>
        {parserFieldEvidence.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
            No parser field evidence for this extraction run.
          </div>
        ) : (
          <>
            <EvidenceByType items={parserFieldEvidence} label="Parser field evidence" />
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', cursor: 'pointer' }}>
                Show full table ({parserFieldEvidence.length} rows)
              </summary>
              <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                <table style={{ width: '100%', fontSize: '0.77rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--ds-border)' }}>
                      {['Entity type', 'Field', 'Extracted value', 'Confidence', 'Uncertain', 'Page'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parserFieldEvidence.slice(0, 100).map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--ds-border-soft)', opacity: p.isUncertain ? 0.75 : 1 }}>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{p.entityType}</td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)' }}>{p.fieldName}</td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.extractedValue ?? '—'}
                        </td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>
                          {p.confidence !== null ? fmtPct(p.confidence) : '—'}
                        </td>
                        <td style={{ padding: '0.3rem 0.5rem', color: p.isUncertain ? '#92400e' : 'var(--ds-text-faint)' }}>
                          {p.isUncertain ? 'yes' : '—'}
                        </td>
                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ds-text-faint)' }}>{p.sourcePageNumber ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parserFieldEvidence.length > 100 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-faint)', marginTop: '0.35rem' }}>
                    Showing 100 of {parserFieldEvidence.length} rows.
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ manufacturerId, documentId }: { manufacturerId: string; documentId: string }) {
  return (
    <div style={{ background: 'var(--ds-card-bg)', border: '1px solid var(--ds-border)', borderRadius: 8, padding: '1.25rem 1.5rem', fontSize: '0.83rem', color: 'var(--ds-text-muted)', lineHeight: 1.7 }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ds-text)' }}>No staged parser data found for this document.</div>
      <div style={{ marginBottom: '0.75rem' }}>Run the full pipeline to populate staged data:</div>
      <pre style={{ background: 'var(--ds-border-soft)', borderRadius: 5, padding: '0.65rem 0.9rem', fontSize: '0.78rem', overflowX: 'auto', lineHeight: 1.6 }}>{
`# 1. Bundle the document
pnpm parser:bundle -- --document ${documentId}

# 2. Run AI extraction
pnpm parser:ai-local -- --input .local/parser-inputs/<bundle>.json

# 3. Dry-run validation
pnpm parser:dry-run -- --ai-output .local/parser-ai-outputs/<output>.json --strict

# 4. Preview insert
pnpm parser:insert-preview -- --ai-output .local/parser-ai-outputs/<output>.json --strict

# 5. Insert to local DB
pnpm parser:insert-local -- \\
  --input .local/parser-inputs/<bundle>.json \\
  --ai-output .local/parser-ai-outputs/<output>.json \\
  --strict --confirm-local-write`
      }</pre>
      <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: 'var(--ds-text-faint)' }}>
        See <code>docs/local-parser-insert-local.md</code> for the full pipeline reference.
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
        {result.ok ? result.document.documentName : documentId}
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

  const {
    manufacturer: m, document: doc, parseRun,
    counts, evidenceCoverage,
    systems, profiles, components, colours, links,
    fieldVerifications, parserFieldEvidence,
    orphanLinkCount,
    systemIdsWithEvidence, componentIdsWithEvidence,
  } = result

  const hasData = counts.stagedSystems > 0 || counts.stagedComponents > 0

  const warnings = computeHealthWarnings({
    systems, profiles, components, colours, links,
    counts, orphanLinkCount,
    entitiesWithEvidence: evidenceCoverage.entitiesWithEvidence,
    entitiesTotal: evidenceCoverage.entitiesTotal,
  })

  const errorCount = warnings.filter((w) => w.severity === 'error').length
  const warnCount  = warnings.filter((w) => w.severity === 'warn').length

  return (
    <StudioShell role="admin" subtitle={`${m.name} · ${doc.documentName} · Parser`}>
      {breadcrumb}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
        <h1 style={{ fontSize: '1.2rem' }}>Parser staging inspection</h1>
        <span className={`studio-badge studio-badge-${doc.status === 'parsed' || doc.status === 'approved' ? 'approved' : 'draft'}`}>
          {doc.status}
        </span>
        {errorCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b' }}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        )}
        {warnCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>
        )}
        <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', fontWeight: 400 }}>read-only</span>
      </div>

      {/* IDs block */}
      <div style={{ fontSize: '0.77rem', color: 'var(--ds-text-faint)', marginBottom: '1.25rem', lineHeight: 1.7 }}>
        <div><span style={{ minWidth: 120, display: 'inline-block' }}>Manufacturer</span><code>{m.name}</code></div>
        <div><span style={{ minWidth: 120, display: 'inline-block' }}>Document</span><code>{doc.documentName}</code> · <code style={{ opacity: 0.7 }}>{doc.id}</code></div>
        {doc.documentType && <div><span style={{ minWidth: 120, display: 'inline-block' }}>Doc type</span>{doc.documentType}</div>}
        {doc.documentDate && <div><span style={{ minWidth: 120, display: 'inline-block' }}>Doc date</span>{doc.documentDate}</div>}
        {parseRun && <div><span style={{ minWidth: 120, display: 'inline-block' }}>Extraction run</span><code>{parseRun.id}</code></div>}
      </div>

      {/* No data */}
      {!hasData && (
        <div style={{ marginBottom: '1.5rem' }}>
          <EmptyState manufacturerId={manufacturerId} documentId={documentId} />
        </div>
      )}

      {/* Health checks */}
      <div className="studio-section" style={{ marginTop: 0 }}>
        <SectionHeading>Health checks ({warnings.length} item{warnings.length !== 1 ? 's' : ''})</SectionHeading>
        <HealthPanel warnings={warnings} />
      </div>

      {/* Count summary */}
      <div className="studio-section">
        <SectionHeading>Staged row counts</SectionHeading>
        <CountGrid counts={counts} evidenceCoverage={evidenceCoverage} />
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
      <div style={{ marginTop: '1rem', fontSize: '0.77rem', color: 'var(--ds-text-faint)', lineHeight: 1.7 }}>
        <div>Read-only inspection · No storage paths, keys, or secrets shown · Rows capped at 200 per table</div>
        <div>
          Systems with evidence: {systemIdsWithEvidence.size} of {systems.length} ·
          Components with evidence: {componentIdsWithEvidence.size} of {components.length} ·
          Run <code>pnpm parser:verify-local-insert -- --document {documentId}</code> for full CLI report
        </div>
      </div>
    </StudioShell>
  )
}
