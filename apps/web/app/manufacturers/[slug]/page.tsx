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
    </main>
  )
}
