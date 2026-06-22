import { supabase } from '../../../lib/supabase'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
}

function statusBadge(status: string) {
  const colours: Record<string, { bg: string; color: string }> = {
    uploaded:  { bg: '#dbeafe', color: '#1d4ed8' },
    queued:    { bg: '#fef9c3', color: '#854d0e' },
    extracting:{ bg: '#ffedd5', color: '#9a3412' },
    review:    { bg: '#ede9fe', color: '#5b21b6' },
    approved:  { bg: '#dcfce7', color: '#166534' },
  }
  const c = colours[status] ?? { bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: 4,
      fontSize: '0.8rem',
      fontWeight: 600,
      background: c.bg,
      color: c.color,
    }}>
      {status}
    </span>
  )
}

export default async function ManufacturerDetail({ params }: Props) {
  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, status, created_at')
    .eq('slug', params.slug)
    .single()

  if (error || !data) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href="/">← Back</a></p>
        <p style={{ color: '#888' }}>Manufacturer not found.</p>
      </main>
    )
  }

  const { data: docs } = await supabase
    .from('source_documents')
    .select('id, document_name, document_type, document_date, status, uploaded_at')
    .eq('manufacturer_id', data.id)
    .order('uploaded_at', { ascending: false })

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <p><a href="/">← Back</a></p>
      <h1 style={{ marginBottom: '0.25rem' }}>{data.name}</h1>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '1rem' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Slug</td>
            <td style={{ padding: '0.4rem 0' }}>{data.slug}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Status</td>
            <td style={{ padding: '0.4rem 0' }}>{data.status}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Created</td>
            <td style={{ padding: '0.4rem 0' }}>{new Date(data.created_at).toLocaleDateString()}</td>
          </tr>
        </tbody>
      </table>

      <hr style={{ margin: '1.5rem 0' }} />
      <h2 style={{ marginBottom: '0.5rem' }}>Source Documents</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem', marginTop: 0 }}>
        Uploaded source documents will appear here before extraction and verification.
      </p>

      {!docs || docs.length === 0 ? (
        <p style={{ color: '#888' }}>No source documents have been added for this manufacturer yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f3f3f3', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Name</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Type</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Date</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <a href={`/manufacturers/${data.slug}/documents/${doc.id}`}>{doc.document_name}</a>
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{doc.document_type ?? '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{doc.document_date ?? '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{statusBadge(doc.status)}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#888' }}>
                  {new Date(doc.uploaded_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
