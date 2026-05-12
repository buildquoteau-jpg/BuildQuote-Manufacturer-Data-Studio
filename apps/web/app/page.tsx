import { supabase } from '../lib/supabase'

export const dynamic = 'force-dynamic'

type Manufacturer = {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
}

async function getSupabaseStatus(): Promise<{ ok: boolean; message: string }> {
  const { count, error } = await supabase
    .from('data_studio_manufacturers')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return { ok: false, message: `Error: ${error.message}` }
  }

  return { ok: true, message: `Connected — ${count ?? 0} manufacturer(s) in local db` }
}

async function getManufacturers(): Promise<{ data: Manufacturer[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug, status, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

export default async function Home() {
  const [status, manufacturers] = await Promise.all([
    getSupabaseStatus(),
    getManufacturers(),
  ])

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>BuildQuote Data Studio</h1>
      <p style={{ color: '#555', marginTop: 0 }}>Manufacturer data ingestion, verification and publishing.</p>

      <p style={{ fontSize: '0.9rem' }}>
        <strong>Local Supabase:</strong>{' '}
        <span style={{ color: status.ok ? 'green' : 'red' }}>
          {status.ok ? `✓ ${status.message}` : `✗ ${status.message}`}
        </span>
      </p>

      <hr style={{ margin: '1.5rem 0' }} />

      <h2 style={{ marginBottom: '1rem' }}>Manufacturers</h2>

      {manufacturers.error ? (
        <p style={{ color: 'red' }}>Failed to load manufacturers: {manufacturers.error}</p>
      ) : !manufacturers.data || manufacturers.data.length === 0 ? (
        <p style={{ color: '#888' }}>No manufacturers in local database yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f3f3f3', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Name</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Slug</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #ddd' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {manufacturers.data.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>{m.name}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#555' }}>{m.slug}</td>
                <td style={{ padding: '0.5rem 0.75rem' }}>{m.status}</td>
                <td style={{ padding: '0.5rem 0.75rem', color: '#888' }}>
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
