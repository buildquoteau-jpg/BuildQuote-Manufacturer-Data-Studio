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

const CELL: React.CSSProperties = { padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }
const VAL: React.CSSProperties  = { padding: '0.4rem 0' }

export default async function DocumentDetail({ params }: Props) {
  const { data: manufacturer, error: mfrError } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (mfrError || !manufacturer) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href="/">← Home</a></p>
        <p style={{ color: '#888' }}>Manufacturer not found.</p>
      </main>
    )
  }

  const { data: doc, error: docError } = await supabase
    .from('source_documents')
    .select('id, manufacturer_id, document_name, document_type, document_date, status, uploaded_at')
    .eq('id', params.documentId)
    .eq('manufacturer_id', manufacturer.id)
    .single()

  if (docError || !doc) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a></p>
        <p style={{ color: '#888' }}>Document not found.</p>
      </main>
    )
  }

  const activeStep = LIFECYCLE_STEPS.findIndex((s) => s.key === doc.status)

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem' }}>

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
              <td style={VAL}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  background: '#dbeafe',
                  color: '#1d4ed8',
                }}>
                  {doc.status}
                </span>
              </td>
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

      {/* D — Extraction preview */}
      <h2 style={{ marginBottom: '0.4rem' }}>Extraction preview</h2>
      <div style={{
        border: '1px dashed #d1d5db',
        borderRadius: 8,
        padding: '1.25rem 1.5rem',
        background: '#f9fafb',
        marginBottom: '1.5rem',
      }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.9rem' }}>
          Extraction and verification will be added later. This area will eventually show extracted
          systems, components, dimensions, roles, and confidence flags.
        </p>
      </div>

      {/* E — Verification checklist */}
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

      {/* F — Safe metadata */}
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

      {/* G — Not available yet */}
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
