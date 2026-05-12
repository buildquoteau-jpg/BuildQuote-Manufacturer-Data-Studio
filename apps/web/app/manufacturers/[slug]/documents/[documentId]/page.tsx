import { supabase } from '../../../../../lib/supabase'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string; documentId: string }
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString()
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleString()
}

function fmtConfidence(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

const LIFECYCLE_STEPS = [
  { key: 'uploaded',   label: 'Uploaded' },
  { key: 'queued',     label: 'Queued for extraction' },
  { key: 'extracting', label: 'Extraction preview' },
  { key: 'review',     label: 'Human verification' },
  { key: 'approved',   label: 'Approved for BuildQuote' },
]

function LifecycleStep({ label, active, index }: { label: string; active: boolean; index: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.6rem 0.75rem',
      borderRadius: 6,
      background: active ? '#eff6ff' : 'transparent',
      border: active ? '1px solid #bfdbfe' : '1px solid transparent',
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: '50%',
        fontSize: '0.75rem',
        fontWeight: 700,
        background: active ? '#3b82f6' : '#e5e7eb',
        color: active ? '#fff' : '#6b7280',
        flexShrink: 0,
      }}>
        {index + 1}
      </span>
      <span style={{ fontSize: '0.9rem', color: active ? '#1d4ed8' : '#6b7280', fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
      {active && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          background: '#dbeafe',
          color: '#1d4ed8',
          padding: '0.1rem 0.45rem',
          borderRadius: 4,
          fontWeight: 600,
        }}>
          current
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, { bg: string; color: string }> = {
    // run / doc statuses
    uploaded:     { bg: '#dbeafe', color: '#1d4ed8' },
    queued:       { bg: '#fef9c3', color: '#854d0e' },
    running:      { bg: '#ffedd5', color: '#9a3412' },
    extracting:   { bg: '#ffedd5', color: '#9a3412' },
    completed:    { bg: '#dcfce7', color: '#166534' },
    failed:       { bg: '#fee2e2', color: '#991b1b' },
    // verification statuses
    pending_review:     { bg: '#f3f4f6', color: '#374151' },
    in_review:          { bg: '#dbeafe', color: '#1d4ed8' },
    approved:           { bg: '#dcfce7', color: '#166534' },
    rejected:           { bg: '#fee2e2', color: '#991b1b' },
    needs_source_check: { bg: '#ffedd5', color: '#9a3412' },
    exported:           { bg: '#ede9fe', color: '#5b21b6' },
  }
  const c = colours[status] ?? { bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: 4,
      fontSize: '0.78rem',
      fontWeight: 600,
      background: c.bg,
      color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    required:  { bg: '#f3f4f6', color: '#374151' },
    optional:  { bg: '#dbeafe', color: '#1d4ed8' },
    accessory: { bg: '#fef9c3', color: '#854d0e' },
  }
  const c = map[role] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.12rem 0.45rem',
      borderRadius: 4,
      fontSize: '0.78rem',
      fontWeight: 500,
      background: c.bg,
      color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {role}
    </span>
  )
}

const CELL: React.CSSProperties = { padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }
const VAL: React.CSSProperties  = { padding: '0.4rem 0' }

const TH: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#6b7280',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
}
const TD: React.CSSProperties = {
  padding: '0.45rem 0.75rem',
  fontSize: '0.85rem',
  borderBottom: '1px solid #f3f4f6',
  color: '#374151',
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: '1.5rem',
    }}>
      {children}
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0.75rem 1rem' }}>{text}</p>
  )
}

type ReadinessStatus = 'ready' | 'needs_review' | 'missing' | 'pending' | 'check_catalogue' | 'flagged' | 'not_required_yet'

interface ReadinessCheck {
  label: string
  status: ReadinessStatus
  detail?: string
}

const READINESS_STYLE: Record<ReadinessStatus, { dot: string; label: string; textColor: string; bg: string }> = {
  ready:            { dot: '#22c55e', label: 'Ready',             textColor: '#166534', bg: '#dcfce7' },
  needs_review:     { dot: '#f59e0b', label: 'Needs review',      textColor: '#92400e', bg: '#fef3c7' },
  missing:          { dot: '#ef4444', label: 'Missing',           textColor: '#991b1b', bg: '#fee2e2' },
  pending:          { dot: '#6b7280', label: 'Pending',           textColor: '#374151', bg: '#f3f4f6' },
  check_catalogue:  { dot: '#f59e0b', label: 'Check catalogue',   textColor: '#92400e', bg: '#fef3c7' },
  flagged:          { dot: '#ef4444', label: 'Flagged',           textColor: '#991b1b', bg: '#fee2e2' },
  not_required_yet: { dot: '#d1d5db', label: 'Not required yet',  textColor: '#9ca3af', bg: '#f3f4f6' },
}

function ReadinessRow({ check }: { check: ReadinessCheck }) {
  const s = READINESS_STYLE[check.status]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.6rem',
      padding: '0.45rem 0.75rem',
      borderBottom: '1px solid #f3f4f6',
      fontSize: '0.88rem',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: s.dot, flexShrink: 0, marginTop: '0.35rem',
      }} />
      <div style={{ flex: 1, color: '#374151' }}>{check.label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
        <span style={{
          fontSize: '0.78rem', fontWeight: 600,
          color: s.textColor, background: s.bg,
          padding: '0.1rem 0.45rem', borderRadius: 4, whiteSpace: 'nowrap',
        }}>
          {s.label}
        </span>
        {check.detail && (
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right' }}>{check.detail}</span>
        )}
      </div>
    </div>
  )
}

export default async function DocumentDetail({ params }: Props) {
  // --- Manufacturer lookup ---
  const { data: manufacturer, error: mfrError } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (mfrError || !manufacturer) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href="/">← Home</a></p>
        <p style={{ color: '#888' }}>Manufacturer not found.</p>
      </main>
    )
  }

  // --- Document lookup (scoped to manufacturer) ---
  const { data: doc, error: docError } = await supabase
    .from('source_documents')
    .select('id, manufacturer_id, document_name, document_type, document_date, status, uploaded_at')
    .eq('id', params.documentId)
    .eq('manufacturer_id', manufacturer.id)
    .single()

  if (docError || !doc) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a></p>
        <p style={{ color: '#888' }}>Document not found.</p>
      </main>
    )
  }

  // --- Parallel: extraction data scoped to this document ---
  const [
    { data: runs },
    { data: chunkRows },
    { data: stagedSystems },
    { data: stagedComponents },
  ] = await Promise.all([
    supabase
      .from('extraction_runs')
      .select('id, run_type, status, tool_name, model_name, started_at, completed_at, error_message, created_at')
      .eq('source_document_id', doc.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('document_chunks')
      .select('id')
      .eq('source_document_id', doc.id),

    supabase
      .from('staged_systems')
      .select('id, name, product_code, category, subcategory, description, verification_status, extraction_confidence, created_at')
      .eq('source_document_id', doc.id)
      .order('sort_order', { ascending: true }),

    supabase
      .from('staged_components')
      .select('id, name, sku, category, uom, description, verification_status, extraction_confidence')
      .eq('source_document_id', doc.id)
      .order('sort_order', { ascending: true }),
  ])

  const chunkCount = chunkRows?.length ?? 0
  const systemIds = stagedSystems?.map((s) => s.id) ?? []

  // --- Variant counts (only if systems exist) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sscLinks:       any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sysColourRows:  any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sysProfileRows: any[] = []

  if (systemIds.length > 0) {
    const [{ data: sscData }, { data: colourData }, { data: profileData }] = await Promise.all([
      supabase.from('staged_system_components')
        .select('staged_system_id, staged_component_id, role, notes, sort_order, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order', { ascending: true }),
      supabase.from('staged_system_colours')
        .select('staged_system_id, colour_name, is_stocked, sort_order')
        .in('staged_system_id', systemIds)
        .order('sort_order', { ascending: true }),
      supabase.from('staged_system_profiles')
        .select('staged_system_id, name, dimensions, sort_order, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order', { ascending: true }),
    ])
    sscLinks       = sscData     ?? []
    sysColourRows  = colourData  ?? []
    sysProfileRows = profileData ?? []
  }

  const relationshipCount = sscLinks.length
  const colourCount       = sysColourRows.length
  const profileCount      = sysProfileRows.length
  const compById          = new Map((stagedComponents ?? []).map((c) => [c.id, c]))
  const sysWithLinksCount = new Set(sscLinks.map((l) => l.staged_system_id)).size
  const sysNoLinksCount   = systemIds.length - sysWithLinksCount

  const activeStep = LIFECYCLE_STEPS.findIndex((s) => s.key === doc.status)

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>

      {/* A — Navigation */}
      <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
        <a href="/" style={{ color: '#888' }}>Manufacturers</a>
        {' / '}
        <a href={`/manufacturers/${manufacturer.slug}`} style={{ color: '#888' }}>{manufacturer.name}</a>
        {' / '}
        <span style={{ color: '#374151' }}>{doc.document_name}</span>
      </p>
      <p style={{ marginTop: 0 }}>
        <a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a>
      </p>

      {/* B — Header summary card */}
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        background: '#fafafa',
      }}>
        <h1 style={{ margin: '0 0 1rem 0', fontSize: '1.4rem' }}>{doc.document_name}</h1>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            <tr>
              <td style={CELL}>Manufacturer</td>
              <td style={VAL}>{manufacturer.name}</td>
            </tr>
            <tr>
              <td style={CELL}>Document type</td>
              <td style={VAL}>{doc.document_type ?? '—'}</td>
            </tr>
            <tr>
              <td style={CELL}>Document date</td>
              <td style={VAL}>{doc.document_date ?? '—'}</td>
            </tr>
            <tr>
              <td style={CELL}>Status</td>
              <td style={VAL}><StatusBadge status={doc.status} /></td>
            </tr>
            <tr>
              <td style={CELL}>Uploaded at</td>
              <td style={VAL}>{fmtDate(doc.uploaded_at)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* C — Document lifecycle */}
      <h2 style={{ marginBottom: '0.4rem' }}>Document lifecycle</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Workflow placeholders — steps will become interactive in a future milestone.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {LIFECYCLE_STEPS.map((step, i) => (
          <LifecycleStep key={step.key} label={step.label} active={i === activeStep} index={i} />
        ))}
      </div>

      {/* D — Extraction runs */}
      <h2 style={{ marginBottom: '0.4rem' }}>Extraction runs</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Pipeline runs triggered against this document. Read-only.
      </p>
      <SectionCard>
        {!runs || runs.length === 0 ? (
          <EmptyNote text="No extraction run has been created for this document yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Run type</th>
                <th style={TH}>Status</th>
                <th style={TH}>Tool</th>
                <th style={TH}>Model</th>
                <th style={TH}>Started</th>
                <th style={TH}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td style={TD}>{run.run_type}</td>
                  <td style={TD}><StatusBadge status={run.status} /></td>
                  <td style={{ ...TD, color: '#6b7280' }}>{run.tool_name ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{run.model_name ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{fmtDateTime(run.started_at)}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{fmtDateTime(run.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* E — Document chunks */}
      <h2 style={{ marginBottom: '0.4rem' }}>Document chunks</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Text and table chunks extracted from this document.
      </p>
      <SectionCard>
        {chunkCount === 0 ? (
          <EmptyNote text="No document chunks have been created yet." />
        ) : (
          <p style={{ margin: '0.75rem 1rem', fontSize: '0.9rem', color: '#374151' }}>
            Document chunks: <strong>{chunkCount}</strong>
          </p>
        )}
      </SectionCard>

      {/* F — Staged systems */}
      <h2 style={{ marginBottom: '0.4rem' }}>Staged systems</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        AI-drafted system cards awaiting human verification. Read-only.
      </p>
      <SectionCard>
        {!stagedSystems || stagedSystems.length === 0 ? (
          <EmptyNote text="No staged systems have been extracted yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={TH}>Product code</th>
                <th style={TH}>Category</th>
                <th style={TH}>Subcategory</th>
                <th style={TH}>Verification</th>
                <th style={TH}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {stagedSystems.map((sys) => (
                <tr key={sys.id}>
                  <td style={{ ...TD, fontWeight: 500 }}>
                    {sys.name}
                    {sys.description && (
                      <div style={{ fontWeight: 400, fontSize: '0.77rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                        {sys.description}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, color: '#6b7280' }}>{sys.product_code ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{sys.category ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{sys.subcategory ?? '—'}</td>
                  <td style={TD}><StatusBadge status={sys.verification_status} /></td>
                  <td style={{ ...TD, color: '#6b7280' }}>{fmtConfidence(sys.extraction_confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* G — Staged components */}
      <h2 style={{ marginBottom: '0.4rem' }}>Staged components</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        AI-drafted component rows awaiting human verification. Read-only.
      </p>
      <SectionCard>
        {!stagedComponents || stagedComponents.length === 0 ? (
          <EmptyNote text="No staged components have been extracted yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Name</th>
                <th style={TH}>SKU</th>
                <th style={TH}>Category</th>
                <th style={TH}>UOM</th>
                <th style={TH}>Verification</th>
                <th style={TH}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {stagedComponents.map((comp) => (
                <tr key={comp.id}>
                  <td style={{ ...TD, fontWeight: 500 }}>
                    {comp.name}
                    {comp.description && (
                      <div style={{ fontWeight: 400, fontSize: '0.77rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                        {comp.description}
                      </div>
                    )}
                  </td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.sku ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.category ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.uom ?? '—'}</td>
                  <td style={TD}><StatusBadge status={comp.verification_status} /></td>
                  <td style={{ ...TD, color: '#6b7280' }}>{fmtConfidence(comp.extraction_confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* H — System composition */}
      {systemIds.length > 0 && (
        <>
          <h2 style={{ marginBottom: '0.4rem' }}>System composition</h2>
          <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
            Each system with its linked components, colours, and profiles. Read-only.
          </p>

          {/* Relationship coverage summary */}
          <SectionCard>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem', margin: '0.5rem 1rem 0.25rem' }}>
              <tbody>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>Systems</td>
                  <td style={{ ...VAL, fontWeight: 600 }}>{systemIds.length}</td>
                </tr>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>System–component links</td>
                  <td style={{ ...VAL, fontWeight: 600 }}>{relationshipCount}</td>
                </tr>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>Systems with linked components</td>
                  <td style={{ ...VAL, fontWeight: 600, color: sysWithLinksCount > 0 ? '#166534' : '#374151' }}>{sysWithLinksCount}</td>
                </tr>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>Systems with no linked components</td>
                  <td style={{ ...VAL, fontWeight: 600, color: sysNoLinksCount > 0 ? '#92400e' : '#374151' }}>{sysNoLinksCount}</td>
                </tr>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>Colour variants</td>
                  <td style={{ ...VAL, fontWeight: 600 }}>{colourCount}</td>
                </tr>
                <tr>
                  <td style={{ ...CELL, fontSize: '0.85rem' }}>Profile variants</td>
                  <td style={{ ...VAL, fontWeight: 600 }}>{profileCount}</td>
                </tr>
              </tbody>
            </table>
            <p style={{ margin: '0 1rem 0.75rem', fontSize: '0.82rem', color: '#9ca3af' }}>
              Relationship data is staged and must be checked against the manufacturer catalogue before publishing.
            </p>
          </SectionCard>

          {/* Per-system breakdown */}
          {(stagedSystems ?? []).map((sys) => {
            const links      = sscLinks.filter((l) => l.staged_system_id === sys.id)
            const sysColours = sysColourRows.filter((c) => c.staged_system_id === sys.id)
            const sysProfs   = sysProfileRows.filter((p) => p.staged_system_id === sys.id)
            const hasVariants = sysColours.length > 0 || sysProfs.length > 0
            return (
              <div key={sys.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                marginBottom: '1rem',
                overflow: 'hidden',
              }}>
                {/* System header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                  padding: '0.65rem 1rem',
                  background: '#fafafa',
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{sys.name}</span>
                  {sys.product_code && (
                    <code style={{ fontSize: '0.8rem', color: '#374151', background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: 3 }}>
                      {sys.product_code}
                    </code>
                  )}
                  <StatusBadge status={sys.verification_status} />
                </div>

                {/* Linked components */}
                {links.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Component</th>
                          <th style={TH}>SKU</th>
                          <th style={TH}>Role</th>
                          <th style={TH}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {links.map((link) => {
                          const comp = compById.get(link.staged_component_id)
                          return (
                            <tr key={link.staged_component_id}>
                              <td style={{ ...TD, fontWeight: 500 }}>{comp?.name ?? '—'}</td>
                              <td style={{
                                ...TD,
                                color: '#6b7280',
                                fontFamily: comp?.sku ? 'monospace' : undefined,
                                fontSize: comp?.sku ? '0.82rem' : undefined,
                              }}>
                                {comp?.sku ?? '—'}
                              </td>
                              <td style={TD}><RoleBadge role={link.role} /></td>
                              <td style={TD}><StatusBadge status={link.verification_status} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ margin: '0.6rem 1rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                    No linked components staged yet.
                  </p>
                )}

                {/* Colours and profiles */}
                {hasVariants && (
                  <div style={{
                    padding: '0.5rem 1rem 0.65rem',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                  }}>
                    {sysColours.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af', flexShrink: 0 }}>Colours:</span>
                        {sysColours.map((col) => (
                          <span key={col.colour_name} style={{
                            fontSize: '0.78rem',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 4,
                            background: col.is_stocked ? '#f3f4f6' : 'transparent',
                            color: col.is_stocked ? '#374151' : '#9ca3af',
                            border: col.is_stocked ? '1px solid #e5e7eb' : '1px dashed #d1d5db',
                          }}>
                            {col.colour_name}{!col.is_stocked && ' (not stocked)'}
                          </span>
                        ))}
                      </div>
                    )}
                    {sysProfs.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af', flexShrink: 0 }}>Profiles:</span>
                        {sysProfs.map((p, i) => (
                          <span key={i} style={{ fontSize: '0.78rem', color: '#374151' }}>
                            {p.name ?? '—'}{p.dimensions ? ` — ${p.dimensions}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* I — Catalogue code check */}
      {((stagedSystems && stagedSystems.length > 0) || (stagedComponents && stagedComponents.length > 0)) && (() => {
        const systemsWithCode    = (stagedSystems ?? []).filter((s) => s.product_code).length
        const systemsMissing     = (stagedSystems ?? []).length - systemsWithCode
        const componentsWithSku  = (stagedComponents ?? []).filter((c) => c.sku).length
        const componentsMissing  = (stagedComponents ?? []).length - componentsWithSku
        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Catalogue code check</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Read-only summary of code coverage across staged data for this document.
            </p>
            <SectionCard>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem', margin: '0.5rem 1rem 0.25rem' }}>
                <tbody>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Systems with product code</td>
                    <td style={{ ...VAL, fontWeight: 600, color: systemsWithCode > 0 ? '#166534' : '#374151' }}>{systemsWithCode}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Systems missing product code</td>
                    <td style={{ ...VAL, fontWeight: 600, color: '#374151' }}>{systemsMissing}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Components with SKU</td>
                    <td style={{ ...VAL, fontWeight: 600, color: componentsWithSku > 0 ? '#166534' : '#374151' }}>{componentsWithSku}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Components missing SKU</td>
                    <td style={{ ...VAL, fontWeight: 600, color: '#374151' }}>{componentsMissing}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ margin: '0.5rem 1rem 0.75rem', fontSize: '0.82rem', color: '#9ca3af' }}>
                Missing codes are expected for staged data until catalogue verification is complete.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* J_pre — Verification readiness */}
      {(() => {
        const runsCount      = runs?.length ?? 0
        const systemsCount   = stagedSystems?.length ?? 0
        const componentsCount = stagedComponents?.length ?? 0

        const systemsWithCode   = (stagedSystems ?? []).filter((s) => s.product_code).length
        const systemsMissingCode = systemsCount - systemsWithCode
        const componentsWithSku  = (stagedComponents ?? []).filter((c) => c.sku).length
        const componentsMissingSku = componentsCount - componentsWithSku

        const systemsUnnamed    = (stagedSystems ?? []).filter((s) => !s.name?.trim()).length
        const componentsUnnamed = (stagedComponents ?? []).filter((c) => !c.name?.trim()).length

        const sysApproved  = (stagedSystems ?? []).filter((s) => s.verification_status === 'approved').length
        const sysRejected  = (stagedSystems ?? []).filter((s) => s.verification_status === 'rejected').length
        const sysPending   = (stagedSystems ?? []).filter((s) => ['pending_review', 'in_review'].includes(s.verification_status)).length

        const compApproved = (stagedComponents ?? []).filter((c) => c.verification_status === 'approved').length
        const compRejected = (stagedComponents ?? []).filter((c) => c.verification_status === 'rejected').length
        const compPending  = (stagedComponents ?? []).filter((c) => ['pending_review', 'in_review'].includes(c.verification_status)).length

        const linkRejected = sscLinks.filter((l) => l.verification_status === 'rejected').length
        const anyRejected  = sysRejected > 0 || compRejected > 0 || linkRejected > 0

        const checks: ReadinessCheck[] = [
          {
            label: 'Extraction run exists',
            status: runsCount > 0 ? 'ready' : 'missing',
            detail: runsCount > 0 ? `${runsCount} run${runsCount > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'Document chunks extracted',
            status: chunkCount > 0 ? 'ready' : 'missing',
            detail: chunkCount > 0 ? `${chunkCount} chunk${chunkCount > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'Staged systems present',
            status: systemsCount > 0 ? 'ready' : 'missing',
            detail: systemsCount > 0 ? `${systemsCount} system${systemsCount > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'All staged systems have names',
            status: systemsCount === 0 ? 'not_required_yet' : systemsUnnamed === 0 ? 'ready' : 'needs_review',
            detail: systemsUnnamed > 0 ? `${systemsUnnamed} unnamed` : undefined,
          },
          {
            label: 'Staged components present',
            status: componentsCount > 0 ? 'ready' : 'missing',
            detail: componentsCount > 0 ? `${componentsCount} component${componentsCount > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'All staged components have names',
            status: componentsCount === 0 ? 'not_required_yet' : componentsUnnamed === 0 ? 'ready' : 'needs_review',
            detail: componentsUnnamed > 0 ? `${componentsUnnamed} unnamed` : undefined,
          },
          {
            label: 'At least one system has linked components',
            status: systemsCount === 0 ? 'not_required_yet' : sysWithLinksCount > 0 ? 'ready' : 'needs_review',
            detail: systemsCount > 0 ? `${sysWithLinksCount} of ${systemsCount} linked` : undefined,
          },
          {
            label: 'Systems with no linked components',
            status: sysNoLinksCount === 0 ? 'ready' : 'needs_review',
            detail: sysNoLinksCount > 0 ? `${sysNoLinksCount} unlinked — needs review` : undefined,
          },
          {
            label: 'Catalogue codes / product codes',
            status: systemsCount === 0
              ? 'not_required_yet'
              : systemsWithCode > 0 && systemsMissingCode === 0
                ? 'ready'
                : 'check_catalogue',
            detail: systemsMissingCode > 0 ? `${systemsMissingCode} missing — expected at this stage` : undefined,
          },
          {
            label: 'Component SKUs',
            status: componentsCount === 0
              ? 'not_required_yet'
              : componentsWithSku > 0 && componentsMissingSku === 0
                ? 'ready'
                : 'check_catalogue',
            detail: componentsMissingSku > 0 ? `${componentsMissingSku} missing — expected at this stage` : undefined,
          },
          {
            label: 'System verification statuses',
            status: systemsCount === 0
              ? 'not_required_yet'
              : sysRejected > 0
                ? 'flagged'
                : sysApproved === systemsCount
                  ? 'ready'
                  : 'pending',
            detail: systemsCount > 0
              ? `${sysApproved} approved, ${sysPending} pending${sysRejected > 0 ? `, ${sysRejected} rejected` : ''}`
              : undefined,
          },
          {
            label: 'Component verification statuses',
            status: componentsCount === 0
              ? 'not_required_yet'
              : compRejected > 0
                ? 'flagged'
                : compApproved === componentsCount
                  ? 'ready'
                  : 'pending',
            detail: componentsCount > 0
              ? `${compApproved} approved, ${compPending} pending${compRejected > 0 ? `, ${compRejected} rejected` : ''}`
              : undefined,
          },
        ]

        let overallState: string
        let overallBg: string
        let overallColor: string

        if (anyRejected) {
          overallState = 'Has flagged items'
          overallBg    = '#fee2e2'
          overallColor = '#991b1b'
        } else if (runsCount === 0 || systemsCount === 0) {
          overallState = 'Early staging'
          overallBg    = '#f3f4f6'
          overallColor = '#6b7280'
        } else if (systemsCount > 0 && componentsCount > 0 && sysWithLinksCount === 0) {
          overallState = 'Relationship review needed'
          overallBg    = '#ffedd5'
          overallColor = '#9a3412'
        } else if (sysWithLinksCount > 0 && (systemsMissingCode > 0 || componentsMissingSku > 0)) {
          overallState = 'Needs catalogue review'
          overallBg    = '#fef9c3'
          overallColor = '#854d0e'
        } else if (runsCount > 0 && chunkCount > 0 && systemsCount > 0 && componentsCount > 0 && sysWithLinksCount > 0) {
          overallState = 'Ready for human verification'
          overallBg    = '#dcfce7'
          overallColor = '#166534'
        } else {
          overallState = 'In progress'
          overallBg    = '#f3f4f6'
          overallColor = '#6b7280'
        }

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Verification readiness</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Read-only guide to staging completeness for this document.
            </p>
            <SectionCard>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.4rem',
                padding: '0.65rem 0.75rem',
                background: overallBg,
                borderBottom: '1px solid #e5e7eb',
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Overall readiness</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: overallColor }}>{overallState}</span>
              </div>
              <div>
                {checks.map((check) => (
                  <ReadinessRow key={check.label} check={check} />
                ))}
              </div>
              <p style={{ margin: '0.5rem 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Readiness is a guide only. Publishing will require explicit verification and a separate controlled migration step.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* J — Extraction preview */}
      <h2 style={{ marginBottom: '0.4rem' }}>Extraction preview</h2>
      <div style={{
        border: '1px dashed #d1d5db',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
        background: '#f9fafb',
        marginBottom: '1.5rem',
      }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>
          When extraction runs complete, staged systems, components, dimensions, roles, and
          confidence flags will appear in the sections above. Field-level verification and
          approval controls will be added in a future milestone.
        </p>
      </div>

      {/* K — Verification checklist */}
      <h2 style={{ marginBottom: '0.4rem' }}>Verification checklist</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Future workflow steps — none of these are interactive yet.
      </p>
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '1rem 1.5rem',
        marginBottom: '1.5rem',
        background: '#fafafa',
      }}>
        {[
          'Confirm document belongs to the selected manufacturer',
          'Confirm document type and date',
          'Review extracted systems',
          'Review extracted components',
          'Check required accessories and fixings',
          'Approve for BuildQuote',
        ].map((item) => (
          <div key={item} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.45rem 0',
            borderBottom: '1px solid #f3f4f6',
            color: '#6b7280',
            fontSize: '0.9rem',
          }}>
            <span style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              border: '1.5px solid #d1d5db',
              display: 'inline-block',
              flexShrink: 0,
            }} />
            {item}
          </div>
        ))}
      </div>

      {/* K_post — Review workflow */}
      {(() => {
        type WFStatus = 'complete' | 'needs_review' | 'check_catalogue' | 'locked'

        interface WFStep {
          label: string
          status: WFStatus
          note?: string
        }

        const WF_STYLE: Record<WFStatus, { label: string; bg: string; color: string }> = {
          complete:        { label: 'Done',             bg: '#dcfce7', color: '#166534' },
          needs_review:    { label: 'Needs review',     bg: '#fef3c7', color: '#92400e' },
          check_catalogue: { label: 'Check catalogue',  bg: '#fef3c7', color: '#92400e' },
          locked:          { label: 'Not enabled yet',  bg: '#f3f4f6', color: '#9ca3af' },
        }

        const runsCount       = runs?.length ?? 0
        const systemsCount    = stagedSystems?.length ?? 0
        const componentsCount = stagedComponents?.length ?? 0
        const systemsMissingCode  = systemsCount - (stagedSystems ?? []).filter((s) => s.product_code).length
        const componentsMissingSku = componentsCount - (stagedComponents ?? []).filter((c) => c.sku).length

        const steps: WFStep[] = [
          {
            label: 'Document registered',
            status: 'complete',
          },
          {
            label: 'Extraction run recorded',
            status: runsCount > 0 ? 'complete' : 'needs_review',
            note: runsCount > 0 ? `${runsCount} run${runsCount > 1 ? 's' : ''}` : 'No runs yet',
          },
          {
            label: 'Text chunks available',
            status: chunkCount > 0 ? 'complete' : 'needs_review',
            note: chunkCount > 0 ? `${chunkCount} chunk${chunkCount > 1 ? 's' : ''}` : 'No chunks yet',
          },
          {
            label: 'Staged systems and components extracted',
            status: systemsCount > 0 && componentsCount > 0 ? 'complete' : 'needs_review',
            note: systemsCount > 0 || componentsCount > 0
              ? `${systemsCount} system${systemsCount !== 1 ? 's' : ''}, ${componentsCount} component${componentsCount !== 1 ? 's' : ''}`
              : 'None yet',
          },
          {
            label: 'System composition reviewed',
            status: sysWithLinksCount > 0 && sysNoLinksCount === 0 ? 'complete'
              : systemsCount > 0 ? 'needs_review'
              : 'needs_review',
            note: sysNoLinksCount > 0 ? `${sysNoLinksCount} system${sysNoLinksCount > 1 ? 's' : ''} unlinked` : undefined,
          },
          {
            label: 'Catalogue codes checked',
            status: systemsCount === 0 && componentsCount === 0 ? 'needs_review'
              : systemsMissingCode === 0 && componentsMissingSku === 0 ? 'complete'
              : 'check_catalogue',
            note: systemsMissingCode > 0 || componentsMissingSku > 0 ? 'Missing codes — expected at this stage' : undefined,
          },
          {
            label: 'Human verification',
            status: 'locked',
            note: 'Requires explicit field-by-field review — not available yet',
          },
          {
            label: 'Publish batch',
            status: 'locked',
            note: 'Future controlled step — not available on this page',
          },
          {
            label: 'Production migration',
            status: 'locked',
            note: 'Will not run from this page — requires separate deliberate migration',
          },
        ]

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Review workflow</h2>
            <p style={{ color: '#888', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Read-only summary of where this document sits in the staged review process.
            </p>
            <SectionCard>
              <div>
                {steps.map((step, i) => {
                  const s = WF_STYLE[step.status]
                  return (
                    <div key={step.label} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      padding: '0.5rem 0.75rem',
                      borderBottom: i < steps.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: '0.1rem',
                        background: step.status === 'locked' ? '#f3f4f6'
                          : step.status === 'complete' ? '#dcfce7'
                          : '#fef3c7',
                        color: step.status === 'locked' ? '#d1d5db'
                          : step.status === 'complete' ? '#166534'
                          : '#92400e',
                      }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '0.88rem',
                          color: step.status === 'locked' ? '#9ca3af' : '#374151',
                          fontWeight: step.status === 'locked' ? 400 : 500,
                        }}>
                          {step.label}
                        </div>
                        {step.note && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>{step.note}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: s.color,
                        background: s.bg,
                        padding: '0.1rem 0.45rem',
                        borderRadius: 4,
                        whiteSpace: 'nowrap',
                        marginTop: '0.1rem',
                      }}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p style={{ margin: '0.5rem 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Studio data stays separate from RFQ/MFP production until a deliberate verified publish/migration step is built.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* L — Safe metadata */}
      <h2 style={{ marginBottom: '0.4rem' }}>Safe metadata</h2>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
        <tbody>
          <tr>
            <td style={CELL}>Document ID</td>
            <td style={{ ...VAL, fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>{doc.id}</td>
          </tr>
          <tr>
            <td style={CELL}>Manufacturer ID</td>
            <td style={{ ...VAL, fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>{doc.manufacturer_id}</td>
          </tr>
          <tr>
            <td style={CELL}>Document type</td>
            <td style={VAL}>{doc.document_type ?? '—'}</td>
          </tr>
          <tr>
            <td style={CELL}>Document date</td>
            <td style={VAL}>{doc.document_date ?? '—'}</td>
          </tr>
          <tr>
            <td style={CELL}>Status</td>
            <td style={VAL}>{doc.status}</td>
          </tr>
          <tr>
            <td style={CELL}>Uploaded at</td>
            <td style={VAL}>{fmtDate(doc.uploaded_at)}</td>
          </tr>
        </tbody>
      </table>

      {/* M — Not available yet */}
      <p style={{
        fontSize: '0.82rem',
        color: '#9ca3af',
        borderTop: '1px solid #f3f4f6',
        paddingTop: '1rem',
      }}>
        File preview, extraction, editing, approval, and upload controls are intentionally not enabled
        in this local read-only shell.
      </p>

    </main>
  )
}
