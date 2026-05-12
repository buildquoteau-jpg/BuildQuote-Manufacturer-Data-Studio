import { supabase } from '../../../../../lib/supabase'

export const dynamic = 'force-dynamic'

type Props = {
  params: { slug: string; documentId: string }
}

export default async function DocumentDetail({ params }: Props) {
  const { data: manufacturer, error: mfrError } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (mfrError || !manufacturer) {
    return (
      <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href="/">← Back</a></p>
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
      <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
        <p><a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a></p>
        <p style={{ color: '#888' }}>Document not found.</p>
      </main>
    )
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <p><a href={`/manufacturers/${manufacturer.slug}`}>← Back to {manufacturer.name}</a></p>
      <h1 style={{ marginBottom: '0.25rem' }}>{doc.document_name}</h1>

      <table style={{ borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '1rem' }}>
        <tbody>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Manufacturer</td>
            <td style={{ padding: '0.4rem 0' }}>{manufacturer.name}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Type</td>
            <td style={{ padding: '0.4rem 0' }}>{doc.document_type ?? '—'}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Date</td>
            <td style={{ padding: '0.4rem 0' }}>{doc.document_date ?? '—'}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Status</td>
            <td style={{ padding: '0.4rem 0' }}>{doc.status}</td>
          </tr>
          <tr>
            <td style={{ padding: '0.4rem 1rem 0.4rem 0', color: '#555', fontWeight: 600 }}>Uploaded</td>
            <td style={{ padding: '0.4rem 0' }}>{new Date(doc.uploaded_at).toLocaleDateString()}</td>
          </tr>
        </tbody>
      </table>

      <hr style={{ margin: '1.5rem 0' }} />
      <h2 style={{ marginBottom: '0.5rem' }}>Extraction preview</h2>
      <p style={{ color: '#888' }}>Extraction and verification will be added later.</p>
    </main>
  )
}
