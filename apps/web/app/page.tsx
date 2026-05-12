import { supabase } from '../lib/supabase'

async function getSupabaseStatus(): Promise<{ ok: boolean; message: string }> {
  const { count, error } = await supabase
    .from('data_studio_manufacturers')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return { ok: false, message: `Error: ${error.message}` }
  }

  return { ok: true, message: `Connected — ${count ?? 0} manufacturer(s) in local db` }
}

export default async function Home() {
  const status = await getSupabaseStatus()

  return (
    <main>
      <h1>BuildQuote Data Studio</h1>
      <p>Manufacturer data ingestion, verification and publishing.</p>
      <p>
        <strong>Local Supabase:</strong>{' '}
        {status.ok ? `✓ ${status.message}` : `✗ ${status.message}`}
      </p>
    </main>
  )
}
