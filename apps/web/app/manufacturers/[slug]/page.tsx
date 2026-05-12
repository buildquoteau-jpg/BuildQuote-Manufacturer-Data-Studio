import { supabase } from '../../../lib/supabase'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string }
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
      <h2 style={{ marginBottom: '1rem' }}>Source Documents</h2>

      {!docs || docs.length === 0 ? (
        <p style={{ color: '#888' }}>No source documents for this manufacturer.</p>
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
                <td style={{ padding: '0.5rem 0.75rem' }}>{doc.document_name}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{doc.document_type ?? '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{doc.document_date ?? '—'}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{doc.status}</td>
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
