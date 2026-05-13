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

interface StagedProfile {
  staged_system_id: string
  profile_name: string | null
  product_code: string | null
  dimensions: string | null
  length_m: number | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  thickness_mm: number | null
  gauge_mm: number | null
  diameter_mm: number | null
  roll_m: number | null
  weight_kg: number | null
  pieces: number | null
  volume_ml: number | null
  weight_g: number | null
  pack_format: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  supplier_pack_note: string | null
  bal_rating: string | null
  sort_order: number | null
  verification_status: string
}

interface StagedComponent {
  id: string
  name: string
  sku: string | null
  category: string | null
  uom: string | null
  description: string | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  thickness_mm: number | null
  gauge_mm: number | null
  diameter_mm: number | null
  roll_m: number | null
  weight_kg: number | null
  pieces: number | null
  volume_ml: number | null
  weight_g: number | null
  pack_format: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  supplier_pack_note: string | null
  verification_status: string
  extraction_confidence: number | null
  production_component_id: string | null
  sort_order: number | null
}

type HasBaseDims = {
  dimensions?: string | null
  length_m?: number | null
  length_mm?: number | null
  width_mm?: number | null
  height_mm?: number | null
  roll_m?: number | null
}

function fmtDimLine(p: HasBaseDims): string | null {
  if (p.dimensions) return p.dimensions
  const parts: string[] = []
  if (p.length_mm != null) parts.push(String(p.length_mm))
  if (p.width_mm  != null) parts.push(String(p.width_mm))
  if (p.height_mm != null) parts.push(String(p.height_mm))
  if (parts.length >= 2) return parts.join(' × ') + ' mm'
  if (parts.length === 1) return parts[0] + ' mm'
  if (p.length_m != null) return `${p.length_m} m`
  if (p.roll_m   != null) return `${p.roll_m} m roll`
  return null
}

const LIFECYCLE_STEPS = [
  { key: 'uploaded',   label: 'Uploaded' },
  { key: 'queued',     label: 'Queued for extraction' },
  { key: 'extracting', label: 'Extracting' },
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
      background: active ? '#eef7fa' : 'transparent',
      border: active ? '1px solid #a3d5e8' : '1px solid transparent',
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
        background: active ? '#185D7A' : '#e2e8f0',
        color: active ? '#fff' : '#94a3b8',
        flexShrink: 0,
      }}>
        {index + 1}
      </span>
      <span style={{ fontSize: '0.9rem', color: active ? '#185D7A' : '#64748b', fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
      {active && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          background: '#cce7f0',
          color: '#185D7A',
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
    uploaded:     { bg: '#cce7f0', color: '#185D7A' },
    queued:       { bg: '#fef9c3', color: '#854d0e' },
    running:      { bg: '#fed7aa', color: '#c2410c' },
    extracting:   { bg: '#fed7aa', color: '#c2410c' },
    completed:    { bg: '#dcfce7', color: '#166534' },
    failed:       { bg: '#fee2e2', color: '#991b1b' },
    // verification statuses
    pending_review:     { bg: '#f1f5f9', color: '#475569' },
    in_review:          { bg: '#cce7f0', color: '#185D7A' },
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

const CELL: React.CSSProperties = { padding: '0.4rem 1.25rem 0.4rem 0', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.85rem' }
const VAL: React.CSSProperties  = { padding: '0.4rem 0', color: '#1e293b' }

const TH: React.CSSProperties = {
  padding: '0.45rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.73rem',
  fontWeight: 700,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const TD: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  borderBottom: '1px solid #f1f5f9',
  color: '#1e293b',
  verticalAlign: 'top',
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid #d1d5db',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: '1.5rem',
      background: '#ffffff',
    }}>
      {children}
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.75rem 1rem' }}>{text}</p>
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
      borderBottom: '1px solid #f1f5f9',
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
    .select('id, name, slug, production_manufacturer_id')
    .eq('slug', params.slug)
    .single()

  if (mfrError || !manufacturer) {
    return (
      <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.25rem' }}>
        <p><a href="/">← Home</a></p>
        <p style={{ color: '#64748b' }}>Manufacturer not found.</p>
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
      <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.25rem' }}>
        <p><a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a></p>
        <p style={{ color: '#64748b' }}>Document not found.</p>
      </main>
    )
  }

  // --- Parallel: extraction data scoped to this document ---
  const [
    { data: runs },
    { data: chunkRows },
    { data: stagedSystems },
    { data: stagedComponents },
    { data: fieldVerifications },
  ] = await Promise.all([
    supabase
      .from('extraction_runs')
      .select('id, run_type, status, tool_name, model_name, started_at, completed_at, error_message, created_at')
      .eq('source_document_id', doc.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('document_chunks')
      .select('id, chunk_index, page_number, heading, chunk_type, raw_text, confidence')
      .eq('source_document_id', doc.id)
      .order('chunk_index', { ascending: true }),

    supabase
      .from('staged_systems')
      .select('id, name, product_code, category, subcategory, description, verification_status, extraction_confidence, production_system_id, created_at')
      .eq('source_document_id', doc.id)
      .order('sort_order', { ascending: true }),

    supabase
      .from('staged_components')
      .select('id, name, sku, category, uom, description, length_mm, width_mm, height_mm, depth_mm, thickness_mm, gauge_mm, diameter_mm, roll_m, weight_kg, pieces, volume_ml, weight_g, pack_format, supplier_pack_qty, supplier_pack_uom, supplier_pack_note, verification_status, extraction_confidence, production_component_id, sort_order')
      .eq('source_document_id', doc.id)
      .order('sort_order', { ascending: true }),

    supabase
      .from('field_verifications')
      .select('id, entity_type, entity_id, field_name, extracted_value, verified_value, status, confidence, source_chunk_id, source_page_number')
      .eq('source_document_id', doc.id)
      .order('entity_type', { ascending: true })
      .order('entity_id',   { ascending: true })
      .order('field_name',  { ascending: true }),
  ])

  const chunkCount = chunkRows?.length ?? 0
  const systemIds = stagedSystems?.map((s) => s.id) ?? []

  // --- Variant counts (only if systems exist) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sscLinks:       any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sysColourRows:  any[] = []
  let sysProfileRows: StagedProfile[] = []

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
        .select('staged_system_id, profile_name, product_code, dimensions, length_m, length_mm, width_mm, height_mm, depth_mm, thickness_mm, gauge_mm, diameter_mm, roll_m, weight_kg, pieces, volume_ml, weight_g, pack_format, supplier_pack_qty, supplier_pack_uom, supplier_pack_note, bal_rating, sort_order, verification_status')
        .in('staged_system_id', systemIds)
        .order('sort_order', { ascending: true }),
    ])
    sscLinks       = sscData     ?? []
    sysColourRows  = colourData  ?? []
    sysProfileRows = profileData ?? []
  }

  // --- Publish planning: read-only queries scoped to this manufacturer ---
  const allEntityIds = [
    ...systemIds,
    ...(stagedComponents ?? []).map((c) => c.id),
  ]

  const { data: publishBatchRows } = await supabase
    .from('publish_batches')
    .select('id, status, created_at, notes')
    .eq('manufacturer_id', manufacturer.id)
    .order('created_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let publishBatchItemRows: any[] = []
  if (allEntityIds.length > 0) {
    const { data: pbiData } = await supabase
      .from('publish_batch_items')
      .select('entity_id, entity_type, status')
      .in('entity_id', allEntityIds)
    publishBatchItemRows = pbiData ?? []
  }

  const relationshipCount = sscLinks.length
  const colourCount       = sysColourRows.length
  const profileCount      = sysProfileRows.length
  const compById          = new Map((stagedComponents ?? []).map((c) => [c.id, c]))
  const sysWithLinksCount = new Set(sscLinks.map((l) => l.staged_system_id)).size
  const sysNoLinksCount   = systemIds.length - sysWithLinksCount

  const fvTotalByEntityId     = new Map<string, number>()
  const fvWithChunkByEntityId = new Map<string, number>()
  ;(fieldVerifications ?? []).forEach((fv) => {
    fvTotalByEntityId.set(fv.entity_id, (fvTotalByEntityId.get(fv.entity_id) ?? 0) + 1)
    if (fv.source_chunk_id) {
      fvWithChunkByEntityId.set(fv.entity_id, (fvWithChunkByEntityId.get(fv.entity_id) ?? 0) + 1)
    }
  })

  const activeStep = LIFECYCLE_STEPS.findIndex((s) => s.key === doc.status)

  return (
    <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.25rem 4rem' }}>

      {/* A — Navigation */}
      <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
        <a href="/" style={{ color: '#64748b' }}>Manufacturers</a>
        <span style={{ margin: '0 0.4rem', color: '#cbd5e1' }}>/</span>
        <a href={`/manufacturers/${manufacturer.slug}`} style={{ color: '#64748b' }}>{manufacturer.name}</a>
        <span style={{ margin: '0 0.4rem', color: '#cbd5e1' }}>/</span>
        <span style={{ color: '#475569', fontWeight: 500 }}>{doc.document_name}</span>
      </p>
      <p style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '0.85rem' }}>
        <a href={`/manufacturers/${manufacturer.slug}`} style={{ color: '#185D7A', fontWeight: 500 }}>← Back to {manufacturer.name}</a>
      </p>

      {/* B — Header summary card */}
      <div style={{
        border: '1px solid #d1d5db',
        borderLeft: '4px solid #185D7A',
        borderRadius: 10,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        background: '#ffffff',
      }}>
        <h1 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: 700, color: '#185D7A' }}>{doc.document_name}</h1>
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
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid #e2e8f0' }}>
          {([
            { label: 'Runs',        value: runs?.length ?? 0 },
            { label: 'Chunks',      value: chunkCount },
            { label: 'Systems',     value: stagedSystems?.length ?? 0 },
            { label: 'Components',  value: stagedComponents?.length ?? 0 },
            { label: 'Links',       value: relationshipCount },
            { label: 'Fields',      value: fieldVerifications?.length ?? 0 },
          ] as { label: string; value: number }[]).map((s) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
              <strong style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: 700 }}>{s.value}</strong>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* NEW — Review workspace */}
      <div style={{ marginBottom: '1.75rem' }}>
        {/* Instruction banner */}
        <div style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: 8,
          padding: '0.7rem 1rem',
          marginBottom: '1.1rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.87rem', color: '#0c4a6e', lineHeight: 1.6 }}>
            <strong>Review workspace</strong> — Compare the catalogue evidence with the extracted system card.
            Corrections will be logged with evidence and timestamps in a later workflow.
          </p>
        </div>

        {/* Two-column layout — stacks on narrow, side-by-side on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.1rem',
          alignItems: 'start',
        }}>

          {/* Left — Catalogue evidence */}
          <div style={{ border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '0.6rem 0.9rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#185D7A' }}>Catalogue evidence</div>
              <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '0.15rem' }}>Source document and extracted text chunks</div>
            </div>
            <div style={{ padding: '0.75rem 0.9rem' }}>
              {/* Source document info */}
              <div style={{ marginBottom: '0.7rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.04em', fontWeight: 700, marginBottom: '0.2rem' }}>Source document</div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 600 }}>{doc.document_name}</div>
                {doc.document_type && (
                  <div style={{ fontSize: '0.77rem', color: '#64748b', marginTop: '0.1rem' }}>
                    {doc.document_type}{doc.document_date ? ` · ${doc.document_date}` : ''}
                  </div>
                )}
              </div>
              {/* Chunk count summary */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.35rem 0.6rem', borderRadius: 6, marginBottom: '0.7rem',
                background: chunkCount > 0 ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${chunkCount > 0 ? '#bbf7d0' : '#e2e8f0'}`,
              }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: chunkCount > 0 ? '#166534' : '#9ca3af' }}>{chunkCount}</span>
                <span style={{ fontSize: '0.78rem', color: chunkCount > 0 ? '#16a34a' : '#9ca3af' }}>
                  text chunk{chunkCount !== 1 ? 's' : ''} extracted
                </span>
                {(fieldVerifications ?? []).length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                    {(fieldVerifications ?? []).filter((fv) => fv.source_chunk_id != null).length}/{(fieldVerifications ?? []).length} fields linked
                  </span>
                )}
              </div>
              {/* Evidence snippets */}
              {chunkCount === 0 ? (
                <div style={{ padding: '0.75rem 0.8rem', background: '#f9fafb', borderRadius: 6, border: '1px dashed #e2e8f0', textAlign: 'center' as const }}>
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500 }}>No catalogue evidence is linked yet</div>
                  <div style={{ fontSize: '0.73rem', color: '#cbd5e1', marginTop: '0.2rem', lineHeight: 1.45 }}>Once extraction chunks are available, the reviewer will compare them against the staged card data here.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.45rem' }}>
                  {(chunkRows ?? []).slice(0, 3).map((chunk) => (
                    <div key={chunk.id} style={{ padding: '0.45rem 0.6rem', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' as const, marginBottom: chunk.raw_text ? '0.25rem' : 0 }}>
                        {chunk.page_number != null && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#185D7A', background: '#cce7f0', padding: '0.1rem 0.35rem', borderRadius: 3 }}>
                            p.{chunk.page_number}
                          </span>
                        )}
                        {chunk.heading && (
                          <span style={{ fontWeight: 600, color: '#374151', fontSize: '0.78rem' }}>{chunk.heading}</span>
                        )}
                        {chunk.chunk_type && (
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af', marginLeft: 'auto', fontFamily: 'monospace' }}>{chunk.chunk_type}</span>
                        )}
                      </div>
                      {chunk.raw_text && (
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5, fontStyle: 'italic' }}>
                          {chunk.raw_text.slice(0, 120)}{chunk.raw_text.length > 120 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  ))}
                  {chunkCount > 3 && (
                    <p style={{ margin: '0.1rem 0 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                      +{chunkCount - 3} more chunk{chunkCount - 3 !== 1 ? 's' : ''} — see Document chunks below
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right — Extracted system card + field checklist */}
          <div style={{ border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '0.6rem 0.9rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#185D7A' }}>Extracted system card</div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                  {stagedSystems && stagedSystems.length > 0
                    ? `${stagedSystems.length} system${stagedSystems.length > 1 ? 's' : ''} staged${stagedSystems.length > 1 ? ' — showing first' : ''}`
                    : 'No staged systems yet'}
                </div>
              </div>
              {stagedSystems && stagedSystems.length > 0 && (
                <StatusBadge status={stagedSystems[0].verification_status} />
              )}
            </div>
            {!stagedSystems || stagedSystems.length === 0 ? (
              <div style={{ padding: '1.25rem 0.9rem', textAlign: 'center' as const }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#94a3b8' }}>No staged system card yet</div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.3rem', lineHeight: 1.45 }}>
                  No staged system card exists for this document yet. Extraction must create staged data before human verification can begin.
                </div>
              </div>
            ) : (() => {
              const _sys   = stagedSystems[0]
              const _links = sscLinks.filter((l) => l.staged_system_id === _sys.id)
              const _profs = sysProfileRows.filter((p) => p.staged_system_id === _sys.id)
              const _cols  = sysColourRows.filter((c) => c.staged_system_id === _sys.id)
              const _fvs   = (fieldVerifications ?? []).filter((fv) => fv.entity_id === _sys.id)
              const _fp    = _profs[0]

              type FieldStatus = 'Present' | 'Missing' | 'Linked' | 'Needs evidence' | 'Not available'
              const FS: Record<FieldStatus, { bg: string; color: string }> = {
                Present:           { bg: '#dcfce7', color: '#166534' },
                Missing:           { bg: '#fee2e2', color: '#991b1b' },
                Linked:            { bg: '#dbeafe', color: '#1d4ed8' },
                'Needs evidence':  { bg: '#fef3c7', color: '#92400e' },
                'Not available':   { bg: '#f3f4f6', color: '#9ca3af' },
              }
              const fieldRows: { label: string; value: string | null; status: FieldStatus }[] = [
                { label: 'System name',          value: _sys.name || null,                                                                        status: _sys.name?.trim() ? 'Present' : 'Missing' },
                { label: 'Product code / SKU',   value: _sys.product_code || null,                                                                status: _sys.product_code ? 'Present' : 'Missing' },
                { label: 'Category',             value: _sys.category || null,                                                                    status: _sys.category ? 'Present' : 'Missing' },
                { label: 'Subcategory',          value: _sys.subcategory || null,                                                                 status: _sys.subcategory ? 'Present' : 'Missing' },
                { label: 'Dimensions / profile', value: _fp ? (fmtDimLine(_fp) ?? _fp.profile_name ?? null) : null,                              status: _profs.length > 0 ? 'Present' : 'Missing' },
                { label: 'Length',               value: _fp ? (_fp.length_mm != null ? `${_fp.length_mm} mm` : _fp.length_m != null ? `${_fp.length_m} m` : null) : null, status: _fp && (_fp.length_mm != null || _fp.length_m != null) ? 'Present' : (_profs.length === 0 ? 'Missing' : 'Not available') },
                { label: 'Profile / colour',     value: _cols.length > 0 ? `${_cols.length} colour variant${_cols.length !== 1 ? 's' : ''}` : null, status: _cols.length > 0 ? 'Present' : 'Missing' },
                { label: 'Components',           value: _links.length > 0 ? `${_links.length} component${_links.length !== 1 ? 's' : ''}` : null, status: _links.length > 0 ? 'Linked' : 'Missing' },
                { label: 'Evidence link',        value: _fvs.length > 0 ? `${_fvs.filter((fv) => fv.source_chunk_id).length}/${_fvs.length} linked` : null, status: _fvs.length === 0 ? 'Missing' : _fvs.some((fv) => fv.source_chunk_id) ? 'Linked' : 'Needs evidence' },
              ]
              return (
                <>
                  <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{_sys.name}</div>
                    {_sys.product_code && (
                      <code style={{ display: 'inline-block', marginTop: '0.25rem', fontSize: '0.78rem', color: '#185D7A', background: '#cce7f0', padding: '0.15rem 0.45rem', borderRadius: 4, fontWeight: 600 }}>
                        {_sys.product_code}
                      </code>
                    )}
                    {_sys.description && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.77rem', color: '#64748b', lineHeight: 1.45 }}>
                        {_sys.description.slice(0, 100)}{_sys.description.length > 100 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div>
                    {fieldRows.map((row, i) => {
                      const s = FS[row.status]
                      return (
                        <div key={row.label} style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.38rem 0.9rem',
                          borderBottom: i < fieldRows.length - 1 ? '1px solid #f8fafc' : 'none',
                          fontSize: '0.83rem',
                        }}>
                          <div style={{ width: 140, flexShrink: 0, color: '#64748b', fontWeight: 500 }}>{row.label}</div>
                          <div style={{ flex: 1, color: row.value ? '#1e293b' : '#94a3b8', fontSize: '0.81rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                            {row.value ?? 'Missing'}
                          </div>
                          <span style={{ fontSize: '0.71rem', fontWeight: 600, color: s.color, background: s.bg, padding: '0.1rem 0.4rem', borderRadius: 4, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                            {row.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {stagedSystems.length > 1 && (
                    <p style={{ margin: 0, padding: '0.4rem 0.9rem', fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', background: '#f9fafb' }}>
                      +{stagedSystems.length - 1} more system{stagedSystems.length > 2 ? 's' : ''} — see Staged systems below
                    </p>
                  )}
                  <p style={{ margin: 0, padding: '0.4rem 0.9rem', fontSize: '0.72rem', color: '#9ca3af', borderTop: '1px solid #f1f5f9', fontStyle: 'italic', lineHeight: 1.5 }}>
                    Later, corrections will be saved as timestamped audit records. The original extracted value will be preserved, and verified corrections will become the resolved value used for publishing.
                  </p>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── Advanced diagnostics ── */}
      <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '1.5rem', marginBottom: '0.25rem' }}>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', fontWeight: 700, color: '#64748b' }}>Advanced diagnostics</h2>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.82rem', color: '#9ca3af' }}>
          Technical extraction details, field-level evidence, readiness checks, and publish planning. For internal reviewer use.
        </p>
      </div>

      {/* B_sum — Extraction summary */}
      {(() => {
        const sysN  = stagedSystems?.length  ?? 0
        const compN = stagedComponents?.length ?? 0
        const fvN   = fieldVerifications?.length ?? 0
        const runsN = runs?.length ?? 0
        const fvWithChunkN   = (fieldVerifications ?? []).filter((r) => r.source_chunk_id != null).length
        const sysApprovedN   = (stagedSystems ?? []).filter((s) => s.verification_status === 'approved').length
        const sysRejectedN   = (stagedSystems ?? []).filter((s) => s.verification_status === 'rejected').length
        const sysPendN       = sysN - sysApprovedN - sysRejectedN
        const compApprovedN  = (stagedComponents ?? []).filter((c) => c.verification_status === 'approved').length
        const compRejectedN  = (stagedComponents ?? []).filter((c) => c.verification_status === 'rejected').length
        const compPendN      = compN - compApprovedN - compRejectedN

        const summaryRows: { label: string; primary: string; secondary: string; dim: boolean }[] = [
          {
            label:     'Staged systems',
            primary:   sysN === 0 ? '—' : String(sysN),
            secondary: sysN === 0
              ? 'None extracted yet — normal before a run'
              : `${sysApprovedN} approved · ${sysPendN} pending${sysRejectedN > 0 ? ` · ${sysRejectedN} rejected` : ''}`,
            dim: sysN === 0,
          },
          {
            label:     'Staged components',
            primary:   compN === 0 ? '—' : String(compN),
            secondary: compN === 0
              ? 'None extracted yet'
              : `${compApprovedN} approved · ${compPendN} pending${compRejectedN > 0 ? ` · ${compRejectedN} rejected` : ''}`,
            dim: compN === 0,
          },
          {
            label:     'Evidence chunks',
            primary:   chunkCount === 0 ? '—' : String(chunkCount),
            secondary: chunkCount === 0
              ? 'No text chunks available yet'
              : `From ${runsN} extraction run${runsN !== 1 ? 's' : ''}`,
            dim: chunkCount === 0,
          },
          {
            label:     'Field verifications',
            primary:   fvN === 0 ? '—' : String(fvN),
            secondary: fvN === 0
              ? 'No field records yet'
              : `${fvWithChunkN} of ${fvN} linked to source chunk`,
            dim: fvN === 0,
          },
        ]

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Extraction summary</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              What this document has produced so far. All data is staged — not yet in production.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', border: '1px solid #d1d5db', borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', background: '#d1d5db' }}>
              {summaryRows.map((item) => (
                <div key={item.label} style={{ padding: '1rem 1rem', background: '#ffffff' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: item.dim ? '#d1d5db' : '#185D7A', lineHeight: 1.1, marginBottom: '0.25rem' }}>
                    {item.primary}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>
                    {item.secondary}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {/* C — Document lifecycle */}
      <h2 style={{ marginBottom: '0.4rem' }}>Document lifecycle</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Workflow placeholders — steps will become interactive in a future milestone.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {LIFECYCLE_STEPS.map((step, i) => (
          <LifecycleStep key={step.key} label={step.label} active={i === activeStep} index={i} />
        ))}
      </div>

      {/* D — Extraction runs */}
      <h2 style={{ marginBottom: '0.4rem' }}>Extraction runs</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Pipeline runs triggered against this document. Read-only.
      </p>
      <SectionCard>
        {!runs || runs.length === 0 ? (
          <div style={{ padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#1e293b', fontWeight: 600 }}>No extraction runs recorded yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.55 }}>
              Extraction runs are created when an AI pipeline processes this document. They will appear here once an operator triggers a run against this document.
            </p>
          </div>
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
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Text and table chunks extracted from this document. Preview limited to first 10.
      </p>
      <SectionCard>
        {chunkCount === 0 ? (
          <div style={{ padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#1e293b', fontWeight: 600 }}>No document chunks yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.55 }}>
              Chunks are sections of the document text created during extraction. They appear here once an extraction run has processed this document and split the content into reviewable segments.
            </p>
          </div>
        ) : (
          <>
            <p style={{ margin: '0.75rem 1rem 0.5rem', fontSize: '0.9rem', color: '#374151' }}>
              Total chunks: <strong>{chunkCount}</strong>
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                <thead>
                  <tr>
                    <th style={TH}>#</th>
                    <th style={TH}>Heading</th>
                    <th style={TH}>Type</th>
                    <th style={TH}>Page</th>
                    <th style={TH}>Preview</th>
                    <th style={TH}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {(chunkRows ?? []).slice(0, 10).map((chunk) => (
                    <tr key={chunk.id}>
                      <td style={{ ...TD, color: '#9ca3af', fontSize: '0.78rem' }}>{chunk.chunk_index}</td>
                      <td style={{ ...TD, fontWeight: 500, fontSize: '0.82rem' }}>{chunk.heading ?? '—'}</td>
                      <td style={{ ...TD, color: '#6b7280', fontSize: '0.78rem', fontFamily: 'monospace' }}>{chunk.chunk_type ?? '—'}</td>
                      <td style={{ ...TD, color: '#6b7280' }}>{chunk.page_number != null ? `p.${chunk.page_number}` : '—'}</td>
                      <td style={{ ...TD, color: '#6b7280', fontSize: '0.78rem' }}>
                        {chunk.raw_text
                          ? chunk.raw_text.slice(0, 100) + (chunk.raw_text.length > 100 ? '…' : '')
                          : '—'}
                      </td>
                      <td style={{ ...TD, color: '#6b7280' }}>{fmtConfidence(chunk.confidence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {chunkCount > 10 && (
              <p style={{ margin: '0.5rem 1rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Showing 10 of {chunkCount} chunks.
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* F — Staged systems */}
      <h2 style={{ marginBottom: '0.4rem' }}>Staged systems</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        AI-drafted system cards awaiting human verification. Read-only.
      </p>
      <SectionCard>
        {!stagedSystems || stagedSystems.length === 0 ? (
          <div style={{ padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#1e293b', fontWeight: 600 }}>No staged systems yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.55 }}>
              Staged systems are AI-drafted product system cards created during extraction. They will appear here once an extraction run produces system records from this document. Systems must pass human verification before they can be published to BuildQuote.
            </p>
          </div>
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
                <th style={TH}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {stagedSystems.map((sys) => {
                const fvTotal     = fvTotalByEntityId.get(sys.id) ?? 0
                const fvWithChunk = fvWithChunkByEntityId.get(sys.id) ?? 0
                return (
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
                  <td style={{ ...TD, fontSize: '0.78rem', color: fvTotal === 0 ? '#d1d5db' : fvWithChunk < fvTotal ? '#92400e' : '#166534' }}>
                    {fvTotal === 0 ? '—' : `${fvWithChunk}/${fvTotal} linked`}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* G — Staged components */}
      <h2 style={{ marginBottom: '0.4rem' }}>Staged components</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        AI-drafted component rows awaiting human verification. Read-only.
      </p>
      <SectionCard>
        {!stagedComponents || stagedComponents.length === 0 ? (
          <div style={{ padding: '1rem 1.25rem' }}>
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.88rem', color: '#1e293b', fontWeight: 600 }}>No staged components yet</p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.55 }}>
              Staged components are AI-drafted component rows — the individual parts that make up a system. They appear here once an extraction run produces component records. Components are linked to systems and must be verified before publishing.
            </p>
          </div>
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
                <th style={TH}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {stagedComponents.map((comp) => {
                const fvTotal     = fvTotalByEntityId.get(comp.id) ?? 0
                const fvWithChunk = fvWithChunkByEntityId.get(comp.id) ?? 0
                return (
                <tr key={comp.id}>
                  <td style={{ ...TD, fontWeight: 500 }}>
                    {comp.name}
                    {comp.description && (
                      <div style={{ fontWeight: 400, fontSize: '0.77rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                        {comp.description}
                      </div>
                    )}
                    {(() => {
                      const c = comp as StagedComponent
                      const dimLine = fmtDimLine(c)
                      const chips: { label: string; value: string }[] = []
                      if (c.depth_mm      != null) chips.push({ label: 'Depth',       value: `${c.depth_mm} mm` })
                      if (c.thickness_mm  != null) chips.push({ label: 'Thickness',   value: `${c.thickness_mm} mm` })
                      if (c.gauge_mm      != null) chips.push({ label: 'Gauge',       value: `${c.gauge_mm} mm` })
                      if (c.diameter_mm   != null) chips.push({ label: 'Diameter',    value: `${c.diameter_mm} mm` })
                      if (c.roll_m        != null) chips.push({ label: 'Roll length', value: `${c.roll_m} m` })
                      if (c.weight_kg     != null) chips.push({ label: 'Weight',      value: `${c.weight_kg} kg` })
                      if (c.weight_g      != null) chips.push({ label: 'Weight',      value: `${c.weight_g} g` })
                      if (c.pieces        != null) chips.push({ label: 'Pieces',      value: String(c.pieces) })
                      if (c.volume_ml     != null) chips.push({ label: 'Volume',      value: `${c.volume_ml} ml` })
                      const packParts: string[] = []
                      if (c.supplier_pack_qty != null) packParts.push(String(c.supplier_pack_qty))
                      if (c.supplier_pack_uom) packParts.push(c.supplier_pack_uom)
                      const supplierPack = packParts.length > 0
                        ? packParts.join(' ') + (c.supplier_pack_note ? ` (${c.supplier_pack_note})` : '')
                        : null
                      const hasAny = dimLine || chips.length > 0 || c.pack_format || supplierPack
                      if (!hasAny) return null
                      return (
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.2rem 0.55rem', marginTop: '0.3rem', fontSize: '0.75rem', fontWeight: 400 }}>
                          {dimLine && <span style={{ color: '#185D7A', fontWeight: 500 }}>{dimLine}</span>}
                          {chips.map((f, i) => (
                            <span key={i} style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>{f.label}:</span> {f.value}</span>
                          ))}
                          {c.pack_format && (
                            <span style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>Pack:</span> {c.pack_format}</span>
                          )}
                          {supplierPack && (
                            <span style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>Supplier pack:</span> {supplierPack}</span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.sku ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.category ?? '—'}</td>
                  <td style={{ ...TD, color: '#6b7280' }}>{comp.uom ?? '—'}</td>
                  <td style={TD}><StatusBadge status={comp.verification_status} /></td>
                  <td style={{ ...TD, color: '#6b7280' }}>{fmtConfidence(comp.extraction_confidence)}</td>
                  <td style={{ ...TD, fontSize: '0.78rem', color: fvTotal === 0 ? '#d1d5db' : fvWithChunk < fvTotal ? '#92400e' : '#166534' }}>
                    {fvTotal === 0 ? '—' : `${fvWithChunk}/${fvTotal} linked`}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* H — System composition */}
      {systemIds.length > 0 && (
        <>
          <h2 style={{ marginBottom: '0.4rem' }}>System composition</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
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
                border: '1px solid #d1d5db',
                borderRadius: 10,
                marginBottom: '1rem',
                overflow: 'hidden',
                background: '#ffffff',
              }}>
                {/* System header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                  padding: '0.65rem 1rem',
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{sys.name}</span>
                  {sys.product_code && (
                    <code style={{ fontSize: '0.78rem', color: '#185D7A', background: '#cce7f0', padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600, letterSpacing: '0.02em' }}>
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
                              <td style={{ ...TD, fontWeight: 500 }}>
                                {comp?.name ?? '—'}
                                {comp && (() => {
                                  const c = comp as StagedComponent
                                  const dimLine = fmtDimLine(c)
                                  const chips: { label: string; value: string }[] = []
                                  if (c.depth_mm      != null) chips.push({ label: 'Depth',       value: `${c.depth_mm} mm` })
                                  if (c.thickness_mm  != null) chips.push({ label: 'Thickness',   value: `${c.thickness_mm} mm` })
                                  if (c.gauge_mm      != null) chips.push({ label: 'Gauge',       value: `${c.gauge_mm} mm` })
                                  if (c.diameter_mm   != null) chips.push({ label: 'Diameter',    value: `${c.diameter_mm} mm` })
                                  if (c.roll_m        != null) chips.push({ label: 'Roll length', value: `${c.roll_m} m` })
                                  if (c.weight_kg     != null) chips.push({ label: 'Weight',      value: `${c.weight_kg} kg` })
                                  if (c.weight_g      != null) chips.push({ label: 'Weight',      value: `${c.weight_g} g` })
                                  if (c.pieces        != null) chips.push({ label: 'Pieces',      value: String(c.pieces) })
                                  if (c.volume_ml     != null) chips.push({ label: 'Volume',      value: `${c.volume_ml} ml` })
                                  const packParts: string[] = []
                                  if (c.supplier_pack_qty != null) packParts.push(String(c.supplier_pack_qty))
                                  if (c.supplier_pack_uom) packParts.push(c.supplier_pack_uom)
                                  const supplierPack = packParts.length > 0
                                    ? packParts.join(' ') + (c.supplier_pack_note ? ` (${c.supplier_pack_note})` : '')
                                    : null
                                  const hasAny = dimLine || chips.length > 0 || c.pack_format || supplierPack
                                  if (!hasAny) return null
                                  return (
                                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.2rem 0.55rem', marginTop: '0.25rem', fontSize: '0.73rem', fontWeight: 400 }}>
                                      {dimLine && <span style={{ color: '#185D7A', fontWeight: 500 }}>{dimLine}</span>}
                                      {chips.map((f, i) => (
                                        <span key={i} style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>{f.label}:</span> {f.value}</span>
                                      ))}
                                      {c.pack_format && (
                                        <span style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>Pack:</span> {c.pack_format}</span>
                                      )}
                                      {supplierPack && (
                                        <span style={{ color: '#475569' }}><span style={{ color: '#9ca3af' }}>Supplier pack:</span> {supplierPack}</span>
                                      )}
                                    </div>
                                  )
                                })()}
                              </td>
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
                    borderTop: '1px solid #f1f5f9',
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
                            border: col.is_stocked ? '1px solid #e2e8f0' : '1px dashed #d1d5db',
                          }}>
                            {col.colour_name}{!col.is_stocked && ' (not stocked)'}
                          </span>
                        ))}
                      </div>
                    )}
                    {sysProfs.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.4rem' }}>Profiles</div>
                        {sysProfs.map((p, i) => {
                          const dimLine = fmtDimLine(p)
                          const dimParts: { label: string; value: string }[] = []
                          if (p.depth_mm      != null) dimParts.push({ label: 'Depth',       value: `${p.depth_mm} mm` })
                          if (p.thickness_mm  != null) dimParts.push({ label: 'Thickness',   value: `${p.thickness_mm} mm` })
                          if (p.gauge_mm      != null) dimParts.push({ label: 'Gauge',       value: `${p.gauge_mm} mm` })
                          if (p.diameter_mm   != null) dimParts.push({ label: 'Diameter',    value: `${p.diameter_mm} mm` })
                          if (p.roll_m        != null) dimParts.push({ label: 'Roll length', value: `${p.roll_m} m` })
                          if (p.weight_kg     != null) dimParts.push({ label: 'Weight',      value: `${p.weight_kg} kg` })
                          if (p.weight_g      != null) dimParts.push({ label: 'Weight',      value: `${p.weight_g} g` })
                          if (p.pieces        != null) dimParts.push({ label: 'Pieces',      value: String(p.pieces) })
                          if (p.volume_ml     != null) dimParts.push({ label: 'Volume',      value: `${p.volume_ml} ml` })
                          const packParts: string[] = []
                          if (p.supplier_pack_qty != null) packParts.push(String(p.supplier_pack_qty))
                          if (p.supplier_pack_uom) packParts.push(p.supplier_pack_uom)
                          const supplierPack = packParts.length > 0
                            ? packParts.join(' ') + (p.supplier_pack_note ? ` (${p.supplier_pack_note})` : '')
                            : null
                          const hasMeta = dimLine || dimParts.length > 0 || p.pack_format || supplierPack || p.bal_rating
                          return (
                            <div key={i} style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 6,
                              padding: '0.45rem 0.7rem',
                              marginBottom: i < sysProfs.length - 1 ? '0.4rem' : 0,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' as const, marginBottom: hasMeta ? '0.3rem' : 0 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.83rem', color: '#1e293b' }}>{p.profile_name ?? '—'}</span>
                                {p.product_code && (
                                  <code style={{ fontSize: '0.73rem', color: '#185D7A', background: '#cce7f0', padding: '0.1rem 0.35rem', borderRadius: 3, fontWeight: 600 }}>
                                    {p.product_code}
                                  </code>
                                )}
                              </div>
                              {hasMeta && (
                                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.2rem 0.65rem', fontSize: '0.77rem' }}>
                                  {dimLine && (
                                    <span style={{ color: '#185D7A', fontWeight: 500 }}>{dimLine}</span>
                                  )}
                                  {dimParts.map((f, fi) => (
                                    <span key={fi} style={{ color: '#475569' }}>
                                      <span style={{ color: '#9ca3af' }}>{f.label}:</span> {f.value}
                                    </span>
                                  ))}
                                  {p.pack_format && (
                                    <span style={{ color: '#475569' }}>
                                      <span style={{ color: '#9ca3af' }}>Pack:</span> {p.pack_format}
                                    </span>
                                  )}
                                  {supplierPack && (
                                    <span style={{ color: '#475569' }}>
                                      <span style={{ color: '#9ca3af' }}>Supplier pack:</span> {supplierPack}
                                    </span>
                                  )}
                                  {p.bal_rating && (
                                    <span style={{ color: '#475569' }}>
                                      <span style={{ color: '#9ca3af' }}>BAL:</span> {p.bal_rating}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
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
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
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

      {/* I_review — Review priorities */}
      {(() => {
        const systems    = stagedSystems    ?? []
        const components = stagedComponents ?? []
        const fvAll      = fieldVerifications ?? []
        if (systems.length === 0 && components.length === 0) return null

        const sysRejN    = systems.filter((s) => s.verification_status === 'rejected').length
        const compRejN   = components.filter((c) => c.verification_status === 'rejected').length
        const linkRejN   = sscLinks.filter((l) => l.verification_status === 'rejected').length
        const fvNeedsSrc = fvAll.filter((r) => r.status === 'needs_source_check').length
        const fvNoChunkN = fvAll.filter((r) => !r.source_chunk_id).length

        const sysMissingCode  = systems.filter((s) => !s.product_code && s.verification_status !== 'rejected').length
        const compMissingSku  = components.filter((c) => !c.sku && c.verification_status !== 'rejected').length
        const sysNoLinksN     = sysNoLinksCount

        const sysPendingMap   = systems.filter((s) => !s.production_system_id).length
        const compPendingMap  = components.filter((c) => !c.production_component_id).length

        const sysApprovedN    = systems.filter((s) => s.verification_status === 'approved').length
        const compApprovedN   = components.filter((c) => c.verification_status === 'approved').length
        const fvApprovedN     = fvAll.filter((r) => r.status === 'approved').length

        const groups: {
          title: string; color: string; bg: string; borderColor: string; dot: string
          items: string[]; empty: string
        }[] = [
          {
            title: 'Needs attention',
            color: '#991b1b', bg: '#fef2f2', borderColor: '#fca5a5', dot: '#ef4444',
            items: [
              ...(sysRejN  > 0 ? [`${sysRejN} system${sysRejN > 1 ? 's' : ''} marked rejected`]                                                    : []),
              ...(compRejN > 0 ? [`${compRejN} component${compRejN > 1 ? 's' : ''} marked rejected`]                                               : []),
              ...(linkRejN > 0 ? [`${linkRejN} system–component link${linkRejN > 1 ? 's' : ''} marked rejected`]                                   : []),
              ...(fvNeedsSrc > 0 ? [`${fvNeedsSrc} field verification${fvNeedsSrc > 1 ? 's' : ''} need source check`]                              : []),
            ],
            empty: 'No flagged items',
          },
          {
            title: 'Catalogue check needed',
            color: '#92400e', bg: '#fffbeb', borderColor: '#fcd34d', dot: '#f59e0b',
            items: [
              ...(sysMissingCode > 0 ? [`${sysMissingCode} system${sysMissingCode > 1 ? 's' : ''} missing product code`]                           : []),
              ...(compMissingSku > 0 ? [`${compMissingSku} component${compMissingSku > 1 ? 's' : ''} missing SKU`]                                 : []),
              ...(sysNoLinksN > 0    ? [`${sysNoLinksN} system${sysNoLinksN > 1 ? 's' : ''} with no linked components`]                            : []),
              ...(fvNoChunkN > 0     ? [`${fvNoChunkN} field row${fvNoChunkN > 1 ? 's' : ''} not linked to a source chunk`]                        : []),
            ],
            empty: 'No catalogue issues',
          },
          {
            title: 'Pending export mapping',
            color: '#374151', bg: '#f9fafb', borderColor: '#e5e7eb', dot: '#9ca3af',
            items: [
              ...(sysPendingMap  > 0 ? [`${sysPendingMap} system${sysPendingMap > 1 ? 's' : ''} awaiting production ID — normal until exported`]    : []),
              ...(compPendingMap > 0 ? [`${compPendingMap} component${compPendingMap > 1 ? 's' : ''} awaiting production ID — normal until exported`]: []),
            ],
            empty: 'All items have production IDs',
          },
          {
            title: 'Ready items',
            color: '#166534', bg: '#f0fdf4', borderColor: '#86efac', dot: '#22c55e',
            items: [
              ...(sysApprovedN  > 0 ? [`${sysApprovedN} system${sysApprovedN > 1 ? 's' : ''} approved`]                                            : []),
              ...(compApprovedN > 0 ? [`${compApprovedN} component${compApprovedN > 1 ? 's' : ''} approved`]                                        : []),
              ...(fvApprovedN   > 0 ? [`${fvApprovedN} field verification${fvApprovedN > 1 ? 's' : ''} approved`]                                   : []),
            ],
            empty: 'No approved items yet — review pending',
          },
        ]

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Review priorities</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Where to focus human review first. Pending mapping is a normal staging state — it means an item has not been exported to production yet.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {groups.map((g) => (
                <div key={g.title} style={{ border: `1px solid ${g.borderColor}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: g.bg, borderBottom: `1px solid ${g.borderColor}` }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: g.color }}>{g.title}</span>
                  </div>
                  <div style={{ padding: '0.35rem 0' }}>
                    {g.items.length === 0 ? (
                      <div style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic' }}>
                        {g.empty}
                      </div>
                    ) : (
                      g.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.3rem 0.75rem', borderBottom: i < g.items.length - 1 ? '1px solid #f9fafb' : 'none', fontSize: '0.82rem', color: '#374151' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: g.dot, flexShrink: 0, marginTop: '0.35rem' }} />
                          {item}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {/* I_post — Field verification state */}
      {(() => {
        const fvRows = fieldVerifications ?? []
        if (fvRows.length === 0) return null

        // Build lookup maps from already-loaded arrays
        const sysNameById  = new Map((stagedSystems ?? []).map((s) => [s.id, s.name]))
        const compNameById = new Map((stagedComponents ?? []).map((c) => [c.id, c.name]))
        const sysCodeById  = new Map((stagedSystems ?? []).map((s) => [s.id, s.product_code ?? null]))
        const compSkuById  = new Map((stagedComponents ?? []).map((c) => [c.id, c.sku ?? null]))

        // Group rows by entity_type then entity_id, preserving insertion order
        const sysRows  = fvRows.filter((r) => r.entity_type === 'staged_system')
        const compRows = fvRows.filter((r) => r.entity_type === 'staged_component')

        // Distinct ordered entity IDs (avoid Set spread — tsconfig target)
        const sysEntityIds  = sysRows.reduce<string[]>((acc, r) => acc.includes(r.entity_id)  ? acc : [...acc, r.entity_id],  [])
        const compEntityIds = compRows.reduce<string[]>((acc, r) => acc.includes(r.entity_id) ? acc : [...acc, r.entity_id], [])

        const hasSys  = sysEntityIds.length > 0
        const hasComp = compEntityIds.length > 0

        const FV_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
          approved:          { bg: '#dcfce7', color: '#166534' },
          pending:           { bg: '#f3f4f6', color: '#374151' },
          rejected:          { bg: '#fee2e2', color: '#991b1b' },
          edited:            { bg: '#ede9fe', color: '#5b21b6' },
          needs_source_check:{ bg: '#fef3c7', color: '#92400e' },
        }

        function FVStatusBadge({ status }: { status: string }) {
          const s = FV_STATUS_STYLE[status] ?? { bg: '#f3f4f6', color: '#6b7280' }
          return (
            <span style={{
              display: 'inline-block',
              padding: '0.1rem 0.45rem',
              borderRadius: 4,
              fontSize: '0.75rem',
              fontWeight: 600,
              background: s.bg,
              color: s.color,
              whiteSpace: 'nowrap',
            }}>
              {status}
            </span>
          )
        }

        function EntityTable({ entityId, rows, entityName, entityCode }: {
          entityId: string
          rows: typeof fvRows
          entityName: string
          entityCode?: string | null
        }) {
          return (
            <div style={{ marginBottom: '0.1rem' }}>
              <div style={{
                padding: '0.45rem 0.75rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}>
                {entityName || entityId}
                {entityCode && (
                  <code style={{ fontSize: '0.75rem', fontWeight: 600, color: '#185D7A', background: '#cce7f0', padding: '0.15rem 0.45rem', borderRadius: 4, letterSpacing: '0.02em' }}>
                    {entityCode}
                  </code>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Field</th>
                      <th style={TH}>Extracted value</th>
                      <th style={TH}>Verified value</th>
                      <th style={TH}>Status</th>
                      <th style={TH}>Confidence</th>
                      <th style={TH}>Chunk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.8rem', color: '#374151' }}>
                          {row.field_name}
                        </td>
                        <td style={{ ...TD, color: row.extracted_value ? '#374151' : '#9ca3af' }}>
                          {row.extracted_value ?? '—'}
                        </td>
                        <td style={{ ...TD, color: row.verified_value ? '#374151' : '#9ca3af' }}>
                          {row.verified_value ?? '—'}
                        </td>
                        <td style={TD}><FVStatusBadge status={row.status} /></td>
                        <td style={{ ...TD, color: '#6b7280' }}>{fmtConfidence(row.confidence)}</td>
                        <td style={{ ...TD, color: '#9ca3af', fontSize: '0.78rem' }}>
                          {row.source_chunk_id
                            ? (row.source_page_number ? `p.${row.source_page_number}` : 'linked')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Field verification state</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Per-field extraction state for staged records in this document. Read-only — no edits are possible here.
            </p>
            <SectionCard>
              <div style={{ padding: '0.5rem 0.75rem 0.25rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem', color: '#6b7280' }}>
                <span>Fields tracked: <strong style={{ color: '#374151' }}>{fvRows.length}</strong></span>
                <span>Approved: <strong style={{ color: '#166534' }}>{fvRows.filter((r) => r.status === 'approved').length}</strong></span>
                <span>Pending: <strong style={{ color: '#374151' }}>{fvRows.filter((r) => r.status === 'pending').length}</strong></span>
                <span>Needs source check: <strong style={{ color: '#92400e' }}>{fvRows.filter((r) => r.status === 'needs_source_check').length}</strong></span>
                {fvRows.some((r) => r.status === 'rejected') && (
                  <span>Rejected: <strong style={{ color: '#991b1b' }}>{fvRows.filter((r) => r.status === 'rejected').length}</strong></span>
                )}
              </div>

              {hasSys && (
                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Systems ({sysEntityIds.length})
                  </div>
                  {sysEntityIds.map((eid) => (
                    <EntityTable
                      key={eid}
                      entityId={eid}
                      rows={sysRows.filter((r) => r.entity_id === eid)}
                      entityName={sysNameById.get(eid) ?? eid}
                      entityCode={sysCodeById.get(eid)}
                    />
                  ))}
                </div>
              )}

              {hasComp && (
                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: hasSys ? '0.75rem' : '0.5rem' }}>
                  <div style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Components ({compEntityIds.length})
                  </div>
                  {compEntityIds.map((eid) => (
                    <EntityTable
                      key={eid}
                      entityId={eid}
                      rows={compRows.filter((r) => r.entity_id === eid)}
                      entityName={compNameById.get(eid) ?? eid}
                      entityCode={compSkuById.get(eid)}
                    />
                  ))}
                </div>
              )}

              <p style={{ margin: '0.5rem 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Field verification records are staged trust-layer data. No edits or approvals are available on this page.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* I_evidence — Extraction evidence trail */}
      {(() => {
        const fvRows    = fieldVerifications ?? []
        const chunks    = chunkRows ?? []
        const chunkById = new Map(chunks.map((c) => [c.id, c]))

        const chunksWithPage      = chunks.filter((c) => c.page_number != null).length
        const fvWithChunk         = fvRows.filter((r) => r.source_chunk_id != null).length
        const fvWithoutChunk      = fvRows.length - fvWithChunk
        const fvChunkResolvable   = fvRows.filter((r) => r.source_chunk_id != null && chunkById.has(r.source_chunk_id)).length

        const sysNameById  = new Map((stagedSystems  ?? []).map((s) => [s.id, s.name]))
        const compNameById = new Map((stagedComponents ?? []).map((c) => [c.id, c.name]))

        type DiagStatus = 'available' | 'missing' | 'partial' | 'not_linked_yet' | 'ready_for_review' | 'needs_source_link'
        type DiagRow = { label: string; status: DiagStatus; detail?: string }

        const DIAG_STYLE: Record<DiagStatus, { label: string; bg: string; color: string }> = {
          available:         { label: 'Available',         bg: '#dcfce7', color: '#166534' },
          missing:           { label: 'Missing',           bg: '#fee2e2', color: '#991b1b' },
          partial:           { label: 'Partial',           bg: '#fef3c7', color: '#92400e' },
          not_linked_yet:    { label: 'Not linked yet',    bg: '#f3f4f6', color: '#6b7280' },
          ready_for_review:  { label: 'Ready for review',  bg: '#dbeafe', color: '#1d4ed8' },
          needs_source_link: { label: 'Needs source link', bg: '#ffedd5', color: '#9a3412' },
        }

        const diags: DiagRow[] = [
          {
            label: 'Document chunks',
            status: chunkCount === 0 ? 'missing' : 'available',
            detail: chunkCount > 0 ? `${chunkCount} chunk${chunkCount > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'Chunks with page number',
            status: chunkCount === 0 ? 'missing'
              : chunksWithPage === chunkCount ? 'available'
              : chunksWithPage > 0 ? 'partial'
              : 'not_linked_yet',
            detail: chunkCount > 0 ? `${chunksWithPage} of ${chunkCount}` : undefined,
          },
          {
            label: 'Field verification rows',
            status: fvRows.length === 0 ? 'missing' : 'available',
            detail: fvRows.length > 0 ? `${fvRows.length} field${fvRows.length > 1 ? 's' : ''}` : undefined,
          },
          {
            label: 'Field verifications linked to source chunks',
            status: fvRows.length === 0 ? 'missing'
              : fvWithChunk === fvRows.length ? 'available'
              : fvWithChunk > 0 ? 'partial'
              : 'needs_source_link',
            detail: fvRows.length > 0 ? `${fvWithChunk} of ${fvRows.length} linked` : undefined,
          },
          {
            label: 'Field rows without source chunk',
            status: fvWithoutChunk === 0 ? 'available'
              : fvWithoutChunk === fvRows.length ? 'not_linked_yet'
              : 'partial',
            detail: fvWithoutChunk > 0
              ? `${fvWithoutChunk} field${fvWithoutChunk > 1 ? 's' : ''} without source chunk`
              : 'None — all fields linked',
          },
          {
            label: 'Source chunk text resolvable',
            status: fvWithChunk === 0 ? 'not_linked_yet'
              : fvChunkResolvable === fvWithChunk ? 'ready_for_review'
              : fvChunkResolvable > 0 ? 'partial'
              : 'needs_source_link',
            detail: fvWithChunk > 0 ? `${fvChunkResolvable} of ${fvWithChunk} chunk texts loaded` : undefined,
          },
        ]

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Extraction evidence trail</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Traceability is read-only. Extraction evidence must be checked before any future publish/migration step.
            </p>

            {/* A — Source coverage summary */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Source coverage
                </span>
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.88rem', margin: '0.25rem 1rem 0.25rem' }}>
                <tbody>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Total chunks</td>
                    <td style={{ ...VAL, fontWeight: 600 }}>{chunkCount}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Chunks with page number</td>
                    <td style={{ ...VAL, fontWeight: 600 }}>{chunksWithPage}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Field verification rows</td>
                    <td style={{ ...VAL, fontWeight: 600 }}>{fvRows.length}</td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Field rows linked to source chunk</td>
                    <td style={{ ...VAL, fontWeight: 600, color: fvWithChunk === fvRows.length && fvRows.length > 0 ? '#166534' : '#374151' }}>
                      {fvWithChunk}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...CELL, fontSize: '0.85rem' }}>Field rows without source chunk</td>
                    <td style={{ ...VAL, fontWeight: 600, color: fvWithoutChunk > 0 ? '#92400e' : '#374151' }}>
                      {fvWithoutChunk}
                    </td>
                  </tr>
                </tbody>
              </table>
              {fvWithoutChunk > 0 && (
                <p style={{ margin: '0 1rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                  Some fields are not linked to source chunks yet. That is acceptable for seeded staging data but should be required before production publishing.
                </p>
              )}
            </SectionCard>

            {/* B — Traceability diagnostics */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Traceability diagnostics
                </span>
              </div>
              {diags.map((d, i) => {
                const s = DIAG_STYLE[d.status]
                return (
                  <div key={d.label} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                    padding: '0.4rem 0.75rem',
                    borderBottom: i < diags.length - 1 ? '1px solid #f1f5f9' : 'none',
                    fontSize: '0.88rem',
                  }}>
                    <div style={{ flex: 1, color: '#374151' }}>{d.label}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600,
                        color: s.color, background: s.bg,
                        padding: '0.1rem 0.45rem', borderRadius: 4, whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </span>
                      {d.detail && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{d.detail}</span>}
                    </div>
                  </div>
                )
              })}
            </SectionCard>

            {/* C — Field-to-evidence map */}
            {fvRows.length > 0 && (
              <SectionCard>
                <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Field-to-evidence map
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
                    <thead>
                      <tr>
                        <th style={TH}>Entity</th>
                        <th style={TH}>Field</th>
                        <th style={TH}>Extracted value</th>
                        <th style={TH}>Status</th>
                        <th style={TH}>Source ref.</th>
                        <th style={TH}>Evidence preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fvRows.map((row) => {
                        const entityName = row.entity_type === 'staged_system'
                          ? (sysNameById.get(row.entity_id) ?? row.entity_id.slice(0, 8))
                          : (compNameById.get(row.entity_id) ?? row.entity_id.slice(0, 8))
                        const chunk = row.source_chunk_id ? chunkById.get(row.source_chunk_id) : undefined
                        const sourceRef = row.source_chunk_id
                          ? (row.source_page_number != null
                              ? `p.${row.source_page_number}`
                              : `chunk ${chunk?.chunk_index ?? '?'}`)
                          : null
                        const evidenceText = chunk?.raw_text
                          ? chunk.raw_text.slice(0, 90) + (chunk.raw_text.length > 90 ? '…' : '')
                          : null
                        return (
                          <tr key={row.id}>
                            <td style={{ ...TD, fontSize: '0.8rem' }}>
                              <div style={{ fontWeight: 500 }}>{entityName}</div>
                              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                {row.entity_type === 'staged_system' ? 'system' : 'component'}
                              </div>
                            </td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.78rem', color: '#374151' }}>
                              {row.field_name}
                            </td>
                            <td style={{ ...TD, color: row.extracted_value ? '#374151' : '#9ca3af', fontSize: '0.82rem' }}>
                              {row.extracted_value ?? '—'}
                            </td>
                            <td style={TD}>
                              <StatusBadge status={row.status} />
                            </td>
                            <td style={{ ...TD, fontSize: '0.78rem', color: '#6b7280' }}>
                              {sourceRef ?? <span style={{ color: '#d1d5db' }}>—</span>}
                            </td>
                            <td style={{ ...TD, fontSize: '0.75rem', color: '#6b7280' }}>
                              {evidenceText
                                ? <span style={{ fontStyle: 'italic' }}>{evidenceText}</span>
                                : row.source_chunk_id
                                  ? <span style={{ color: '#d1d5db' }}>Chunk text not loaded</span>
                                  : <span style={{ color: '#d1d5db' }}>No source chunk linked</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            <p style={{
              fontSize: '0.82rem', color: '#6b7280',
              padding: '0.6rem 0.85rem', marginBottom: '1.5rem',
              border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc',
            }}>
              Traceability is read-only. Extraction evidence must be checked before any future publish/migration step.
              {fvWithoutChunk > 0 && (
                <> Some fields are not linked to source chunks yet. That is acceptable for seeded staging data but should be required before production publishing.</>
              )}
            </p>
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

        const readinessGroups: { title: string; checks: ReadinessCheck[] }[] = [
          {
            title: 'Extraction completeness',
            checks: [
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
            ],
          },
          {
            title: 'Relationships & composition',
            checks: [
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
            ],
          },
          {
            title: 'Catalogue & codes',
            checks: [
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
            ],
          },
          {
            title: 'Staged verification status',
            checks: [
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
            ],
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
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Read-only guide to staging completeness for this document.
            </p>
            <SectionCard>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.4rem',
                padding: '0.7rem 0.85rem',
                background: overallBg,
                borderBottom: '1px solid #e2e8f0',
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#185D7A' }}>Overall readiness</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: overallColor }}>{overallState}</span>
              </div>
              <div>
                {readinessGroups.map((group) => (
                  <div key={group.title}>
                    <div style={{
                      padding: '0.35rem 0.75rem 0.35rem 1rem',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#185D7A',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      borderBottom: '1px solid #e2e8f0',
                      borderLeft: '3px solid #4FCBB0',
                      background: '#f8fafc',
                    }}>
                      {group.title}
                    </div>
                    {group.checks.map((check) => (
                      <ReadinessRow key={check.label} check={check} />
                    ))}
                  </div>
                ))}
                {/* Production mapping note — not required yet at staging */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '0.82rem',
                  color: '#9ca3af',
                }}>
                  <span style={{ marginTop: '0.1rem', flexShrink: 0, fontSize: '0.8rem' }}>ℹ</span>
                  <span>
                    <strong style={{ color: '#6b7280' }}>Production ID mapping</strong> — not required yet.
                    Production system and component IDs are populated after staged data is exported to production.
                    Missing IDs are normal while data remains in staging.
                  </span>
                </div>
              </div>
              <p style={{ margin: '0.5rem 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Readiness is a guide only. Publishing will require explicit verification and a separate controlled migration step.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* K — Verification checklist */}
      <h2 style={{ marginBottom: '0.4rem' }}>Verification checklist</h2>
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
        Future workflow steps — none of these are interactive yet.
      </p>
      <div style={{
        border: '1px solid #d1d5db',
        borderRadius: 10,
        padding: '0.25rem 1.25rem 0.5rem',
        marginBottom: '1.5rem',
        background: '#ffffff',
      }}>
        {[
          'Confirm document belongs to the selected manufacturer',
          'Confirm document type and date',
          'Review extracted systems',
          'Review extracted components',
          'Check required accessories and fixings',
          'Approve staged data for production (verify first — future step)',
        ].map((item) => (
          <div key={item} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.55rem 0',
            borderBottom: '1px solid #f1f5f9',
            color: '#475569',
            fontSize: '0.88rem',
          }}>
            <span style={{
              width: 15,
              height: 15,
              borderRadius: 3,
              border: '1.5px solid #cbd5e1',
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
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
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
                      borderBottom: i < steps.length - 1 ? '1px solid #f1f5f9' : 'none',
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

      {/* N — Publish planning preview */}
      {(() => {
        const systems    = stagedSystems    ?? []
        const components = stagedComponents ?? []
        const fvRows     = fieldVerifications ?? []
        const links      = sscLinks

        // Payload counts
        const totalSystems    = systems.length
        const totalComponents = components.length
        const totalLinks      = links.length
        const totalColours    = sysColourRows.length
        const totalProfiles   = sysProfileRows.length

        // Verification breakdowns
        const sysApproved  = systems.filter((s) => s.verification_status === 'approved').length
        const sysRejected  = systems.filter((s) => s.verification_status === 'rejected').length
        const sysPending   = totalSystems - sysApproved - sysRejected

        const compApproved = components.filter((c) => c.verification_status === 'approved').length
        const compRejected = components.filter((c) => c.verification_status === 'rejected').length
        const compPending  = totalComponents - compApproved - compRejected

        const linkApproved   = links.filter((l) => l.verification_status === 'approved').length
        const linkRejectedCt = links.filter((l) => l.verification_status === 'rejected').length
        const linkPendingCt  = links.filter((l) => ['pending_review', 'in_review'].includes(l.verification_status || '')).length

        const fvApproved         = fvRows.filter((r) => r.status === 'approved').length
        const fvPending          = fvRows.filter((r) => r.status === 'pending').length
        const fvRejected         = fvRows.filter((r) => r.status === 'rejected').length
        const fvNeedsSourceCheck = fvRows.filter((r) => r.status === 'needs_source_check').length

        // Eligibility: systems
        const sysCandidates        = systems.filter((s) => s.name?.trim() && s.verification_status !== 'rejected').length
        const sysNeedsCode         = systems.filter((s) => s.name?.trim() && s.verification_status !== 'rejected' && !s.product_code).length
        const sysNeedsRelationship = systems.filter((s) => s.name?.trim() && s.verification_status !== 'rejected' && !links.some((l) => l.staged_system_id === s.id)).length
        const sysBlockedCt         = sysRejected

        // Eligibility: components
        const compCandidates = components.filter((c) => c.name?.trim() && c.verification_status !== 'rejected').length
        const compNeedsSku   = components.filter((c) => c.name?.trim() && c.verification_status !== 'rejected' && !c.sku).length
        const compBlockedCt  = compRejected

        // Eligibility: relationships
        const linkCandidates    = links.filter((l) => l.verification_status !== 'rejected').length
        const linkNeedsReviewCt = linkPendingCt
        const linkBlockedCt     = linkRejectedCt

        // Publish batch status
        const batches      = publishBatchRows ?? []
        const batchCount   = batches.length
        const batchedIds   = new Set(publishBatchItemRows.map((i: { entity_id: string }) => i.entity_id))
        const itemsInBatch = allEntityIds.filter((id) => batchedIds.has(id)).length

        // Missing codes / evidence gaps
        const systemsMissingCode = systems.filter((s) => !s.product_code).length
        const compsMissingSku    = components.filter((c) => !c.sku).length

        // Production ID mapping counts (NULL = not yet exported, not an error)
        const sysMappedCount  = systems.filter((s) => s.production_system_id).length
        const compMappedCount = components.filter((c) => c.production_component_id).length
        const fvNoChunk          = fvRows.filter((r) => !r.source_chunk_id).length
        const runsCountN         = runs?.length ?? 0

        // Payload breakdown strings
        const sysBreak  = [
          sysApproved > 0 ? `${sysApproved} approved` : '',
          sysPending  > 0 ? `${sysPending} pending`   : '',
          sysRejected > 0 ? `${sysRejected} rejected` : '',
        ].filter(Boolean).join(' · ')
        const compBreak = [
          compApproved > 0 ? `${compApproved} approved` : '',
          compPending  > 0 ? `${compPending} pending`   : '',
          compRejected > 0 ? `${compRejected} rejected` : '',
        ].filter(Boolean).join(' · ')
        const linkBreak = [
          linkApproved   > 0 ? `${linkApproved} approved`  : '',
          linkPendingCt  > 0 ? `${linkPendingCt} pending`  : '',
          linkRejectedCt > 0 ? `${linkRejectedCt} rejected`: '',
        ].filter(Boolean).join(' · ')
        const fvBreak   = [
          fvApproved         > 0 ? `${fvApproved} approved`                 : '',
          fvPending          > 0 ? `${fvPending} pending`                   : '',
          fvRejected         > 0 ? `${fvRejected} rejected`                 : '',
          fvNeedsSourceCheck > 0 ? `${fvNeedsSourceCheck} needs source check` : '',
        ].filter(Boolean).join(' · ')

        // Blockers
        type BloSev = 'blocker' | 'warning' | 'future_step' | 'info'
        const BLO: Record<BloSev, { label: string; dot: string; lc: string; lb: string }> = {
          blocker:     { label: 'Blocker',     dot: '#ef4444', lc: '#991b1b', lb: '#fee2e2' },
          warning:     { label: 'Warning',     dot: '#f59e0b', lc: '#92400e', lb: '#fef3c7' },
          future_step: { label: 'Future step', dot: '#9ca3af', lc: '#6b7280', lb: '#f3f4f6' },
          info:        { label: 'Info',        dot: '#60a5fa', lc: '#1d4ed8', lb: '#dbeafe' },
        }
        const blockers: { sev: BloSev; text: string }[] = []

        if (runsCountN === 0)       blockers.push({ sev: 'blocker',     text: 'No extraction run recorded for this document' })
        if (chunkCount === 0)       blockers.push({ sev: 'blocker',     text: 'No document chunks extracted' })
        if (totalSystems === 0)     blockers.push({ sev: 'blocker',     text: 'No staged systems — extraction has not produced system records' })
        if (totalComponents === 0)  blockers.push({ sev: 'blocker',     text: 'No staged components — extraction has not produced component records' })
        if (sysRejected > 0)        blockers.push({ sev: 'blocker',     text: `${sysRejected} staged system${sysRejected > 1 ? 's' : ''} marked rejected` })
        if (compRejected > 0)       blockers.push({ sev: 'blocker',     text: `${compRejected} staged component${compRejected > 1 ? 's' : ''} marked rejected` })
        if (linkRejectedCt > 0)     blockers.push({ sev: 'blocker',     text: `${linkRejectedCt} system–component link${linkRejectedCt > 1 ? 's' : ''} marked rejected` })
        if (sysNoLinksCount > 0)    blockers.push({ sev: 'warning',     text: `${sysNoLinksCount} system${sysNoLinksCount > 1 ? 's' : ''} with no linked components` })
        if (fvPending > 0)          blockers.push({ sev: 'warning',     text: `${fvPending} field verification${fvPending > 1 ? 's' : ''} pending review` })
        if (fvNeedsSourceCheck > 0) blockers.push({ sev: 'warning',     text: `${fvNeedsSourceCheck} field verification${fvNeedsSourceCheck > 1 ? 's' : ''} need source check` })
        if (fvNoChunk > 0)          blockers.push({ sev: 'warning',     text: `${fvNoChunk} field row${fvNoChunk > 1 ? 's' : ''} not linked to a source chunk` })
        if (systemsMissingCode > 0 || compsMissingSku > 0) {
          blockers.push({ sev: 'warning', text: `Catalogue codes/SKUs incomplete: ${systemsMissingCode} system${systemsMissingCode !== 1 ? 's' : ''} without product code, ${compsMissingSku} component${compsMissingSku !== 1 ? 's' : ''} without SKU — needs human catalogue review` })
        }
        blockers.push({ sev: 'future_step', text: 'Publish batch workflow not enabled — publish_batches table exists in schema but no create/approve actions are built yet' })
        blockers.push({ sev: 'future_step', text: 'Production migration not enabled — no write path to RFQ/MFP production Supabase exists on this page' })

        return (
          <>
            <h2 style={{ marginBottom: '0.4rem' }}>Publish planning preview</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: 0, marginBottom: '0.75rem' }}>
              Read-only diagnostic preview of staged data and what must be resolved before a future controlled migration to RFQ/MFP production.
            </p>

            {/* Safety notice */}
            <div style={{ border: '1px solid #fca5a5', background: '#fff5f5', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#7f1d1d', lineHeight: 1.6 }}>
              <strong>Studio safety boundary</strong><br />
              Nothing on this page writes to RFQ/MFP production. Future publishing must be a separate controlled migration step after explicit human verification.
              Studio staged data is not production data. This section is a diagnostic preview only.
            </div>

            {/* Would-be publish payload */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Would-be publish payload
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Record type</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Count</th>
                      <th style={TH}>Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Staged systems',              count: totalSystems,    breakdown: sysBreak  },
                      { label: 'Staged components',           count: totalComponents, breakdown: compBreak },
                      { label: 'System–component links',      count: totalLinks,      breakdown: linkBreak },
                      { label: 'Colour variants',             count: totalColours,    breakdown: ''        },
                      { label: 'Profile variants',            count: totalProfiles,   breakdown: ''        },
                      { label: 'Field verifications tracked', count: fvRows.length,   breakdown: fvBreak   },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td style={TD}>{row.label}</td>
                        <td style={{ ...TD, fontWeight: 600, textAlign: 'right' }}>{row.count}</td>
                        <td style={{ ...TD, fontSize: '0.78rem', color: '#9ca3af' }}>{row.breakdown || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* Eligibility categories */}
            {(totalSystems > 0 || totalComponents > 0 || totalLinks > 0) && (
              <SectionCard>
                <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Eligibility categories
                  </span>
                </div>
                {totalSystems > 0 && (
                  <div style={{ borderBottom: totalComponents > 0 || totalLinks > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ padding: '0.4rem 0.75rem 0.2rem', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Systems</div>
                    {[
                      { label: 'Candidate (has name, not rejected)',                  count: sysCandidates,        bg: '#dcfce7', color: '#166534' },
                      { label: 'Needs catalogue code (missing product_code)',          count: sysNeedsCode,         bg: '#fef3c7', color: '#92400e' },
                      { label: 'Needs relationship review (no linked components)',     count: sysNeedsRelationship, bg: '#ffedd5', color: '#9a3412' },
                      { label: 'Blocked (rejected status)',                           count: sysBlockedCt,         bg: '#fee2e2', color: '#991b1b' },
                    ].map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.75rem', borderBottom: '1px solid #f9fafb', fontSize: '0.85rem' }}>
                        <span style={{ color: '#374151' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: row.color, background: row.bg, padding: '0.1rem 0.45rem', borderRadius: 4 }}>{row.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {totalComponents > 0 && (
                  <div style={{ borderBottom: totalLinks > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ padding: '0.4rem 0.75rem 0.2rem', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Components</div>
                    {[
                      { label: 'Candidate (has name, not rejected)', count: compCandidates, bg: '#dcfce7', color: '#166534' },
                      { label: 'Needs SKU check (missing sku)',      count: compNeedsSku,   bg: '#fef3c7', color: '#92400e' },
                      { label: 'Blocked (rejected status)',          count: compBlockedCt,  bg: '#fee2e2', color: '#991b1b' },
                    ].map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.75rem', borderBottom: '1px solid #f9fafb', fontSize: '0.85rem' }}>
                        <span style={{ color: '#374151' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: row.color, background: row.bg, padding: '0.1rem 0.45rem', borderRadius: 4 }}>{row.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {totalLinks > 0 && (
                  <div>
                    <div style={{ padding: '0.4rem 0.75rem 0.2rem', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Relationships</div>
                    {[
                      { label: 'Candidate (link exists, not rejected)',   count: linkCandidates,    bg: '#dcfce7', color: '#166534' },
                      { label: 'Needs review (pending/in_review status)', count: linkNeedsReviewCt, bg: '#f3f4f6', color: '#6b7280' },
                      { label: 'Blocked (rejected status)',               count: linkBlockedCt,     bg: '#fee2e2', color: '#991b1b' },
                    ].map((row) => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.75rem', borderBottom: '1px solid #f9fafb', fontSize: '0.85rem' }}>
                        <span style={{ color: '#374151' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: row.color, background: row.bg, padding: '0.1rem 0.45rem', borderRadius: 4 }}>{row.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {/* Production mapping diagnostics */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Production mapping diagnostics
                </span>
              </div>
              <div style={{ padding: '0.25rem 0.75rem 0.25rem' }}>
                {[
                  {
                    field: 'production_manufacturer_id',
                    note: manufacturer.production_manufacturer_id
                      ? `Set on this manufacturer (${String(manufacturer.production_manufacturer_id).slice(0, 8)}…)`
                      : 'Not set — manufacturer not yet mapped to a production ID',
                    available: !!manufacturer.production_manufacturer_id,
                  },
                  {
                    field: 'production_system_id (per system)',
                    note: totalSystems === 0
                      ? '—'
                      : sysMappedCount === totalSystems
                        ? `All ${totalSystems} system${totalSystems !== 1 ? 's' : ''} mapped to production`
                        : sysMappedCount === 0
                          ? `— not yet mapped (${totalSystems} system${totalSystems !== 1 ? 's' : ''} pending export)`
                          : `${sysMappedCount} of ${totalSystems} mapped; ${totalSystems - sysMappedCount} not yet mapped`,
                    available: totalSystems === 0 ? null as boolean | null : sysMappedCount === totalSystems ? true : null,
                  },
                  {
                    field: 'production_component_id (per component)',
                    note: totalComponents === 0
                      ? '—'
                      : compMappedCount === totalComponents
                        ? `All ${totalComponents} component${totalComponents !== 1 ? 's' : ''} mapped to production`
                        : compMappedCount === 0
                          ? `— not yet mapped (${totalComponents} component${totalComponents !== 1 ? 's' : ''} pending export)`
                          : `${compMappedCount} of ${totalComponents} mapped; ${totalComponents - compMappedCount} not yet mapped`,
                    available: totalComponents === 0 ? null as boolean | null : compMappedCount === totalComponents ? true : null,
                  },
                ].map((row) => (
                  <div key={row.field} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid #f9fafb' }}>
                    <code style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: 4, flexShrink: 0, color: '#475569', fontWeight: 500 }}>
                      {row.field}
                    </code>
                    <span style={{ fontSize: '0.78rem', color: row.available === null ? '#9ca3af' : row.available ? '#166534' : '#92400e', flex: 1 }}>
                      {row.note}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '0 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Production IDs are populated only after a successful controlled migration. Do not invent or hardcode production IDs from this page.
              </p>
            </SectionCard>

            {/* Publish batch status */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Publish batch status
                </span>
              </div>
              {batchCount === 0 ? (
                <p style={{ margin: '0.5rem 0.75rem 0.5rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                  No publish batches exist for this manufacturer yet. Batch creation is a future workflow step — not available on this page.
                </p>
              ) : (
                <>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.88rem', margin: '0.25rem 1rem 0.25rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ ...CELL, fontSize: '0.85rem' }}>Publish batches for this manufacturer</td>
                        <td style={{ ...VAL, fontWeight: 600 }}>{batchCount}</td>
                      </tr>
                      <tr>
                        <td style={{ ...CELL, fontSize: '0.85rem' }}>Staged items (this document) in any batch</td>
                        <td style={{ ...VAL, fontWeight: 600 }}>{itemsInBatch}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
                      <thead>
                        <tr>
                          <th style={TH}>Status</th>
                          <th style={TH}>Created</th>
                          <th style={TH}>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(batches as { id: string; status: string; created_at: string; notes: string | null }[]).map((b) => (
                          <tr key={b.id}>
                            <td style={TD}><StatusBadge status={b.status} /></td>
                            <td style={{ ...TD, color: '#6b7280' }}>{fmtDate(b.created_at)}</td>
                            <td style={{ ...TD, color: '#9ca3af', fontSize: '0.8rem' }}>{b.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p style={{ margin: '0 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Publish batches are scoped to the manufacturer. No batch creation, approval, or migration is possible from this page.
              </p>
            </SectionCard>

            {/* Publish blockers */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Publish blockers
                </span>
              </div>
              {blockers.map((b, i) => {
                const s = BLO[b.sev]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.4rem 0.75rem', borderBottom: i < blockers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: '0.4rem' }} />
                    <div style={{ flex: 1, fontSize: '0.85rem', color: '#374151' }}>{b.text}</div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.lc, background: s.lb, padding: '0.1rem 0.45rem', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </SectionCard>

            {/* Future publish sequence */}
            <SectionCard>
              <div style={{ padding: '0.45rem 0.85rem', borderBottom: '1px solid #e2e8f0', borderLeft: '3px solid #4FCBB0', background: '#f8fafc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Future publish sequence
                </span>
              </div>
              {([
                { label: 'Verify all fields (field_verifications → approved)',   built: true  },
                { label: 'Resolve catalogue codes and SKUs',                     built: true  },
                { label: 'Confirm all system–component relationships',           built: true  },
                { label: 'Build publish batch',                                  built: false },
                { label: 'Preview production diff',                              built: false },
                { label: 'Admin confirms migration',                             built: false },
                { label: 'Write to RFQ/MFP production Supabase',                built: false },
                { label: 'Record publish result',                                built: false },
              ] as { label: string; built: boolean }[]).map((step, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.75rem', borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', fontSize: '0.72rem', fontWeight: 700, background: step.built ? '#dcfce7' : '#f3f4f6', color: step.built ? '#166534' : '#d1d5db', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: step.built ? '#374151' : '#9ca3af' }}>{step.label}</span>
                  {!step.built && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', background: '#f3f4f6', padding: '0.1rem 0.45rem', borderRadius: 4, whiteSpace: 'nowrap' }}>
                      Not built yet
                    </span>
                  )}
                </div>
              ))}
              <p style={{ margin: '0.5rem 0.75rem 0.75rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                Steps 1–3 are visible in the sections above. Steps 4–8 are future milestones that must not be triggered from this page.
              </p>
            </SectionCard>
          </>
        )
      })()}

      {/* L — Safe metadata */}
      <h2 style={{ marginBottom: '0.4rem' }}>Safe metadata</h2>
      <SectionCard>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.88rem', margin: '0.5rem 0.75rem 0.75rem' }}>
          <tbody>
            <tr>
              <td style={CELL}>Document ID</td>
              <td style={{ ...VAL, fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>{doc.id}</td>
            </tr>
            <tr>
              <td style={CELL}>Manufacturer ID</td>
              <td style={{ ...VAL, fontFamily: 'monospace', fontSize: '0.78rem', color: '#475569' }}>{doc.manufacturer_id}</td>
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
      </SectionCard>

      {/* M — Not available yet */}
      <p style={{
        fontSize: '0.8rem',
        color: '#94a3b8',
        borderTop: '1px solid #e2e8f0',
        paddingTop: '1.25rem',
        marginTop: '0.5rem',
      }}>
        File preview, extraction, editing, approval, and upload controls are intentionally not enabled in this read-only workspace.
      </p>

    </main>
  )
}
