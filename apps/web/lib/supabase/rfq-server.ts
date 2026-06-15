import { createClient } from '@supabase/supabase-js'

// Server-side only — never import this in client components or pages.
// Keys are not prefixed with NEXT_PUBLIC_ and are never sent to the browser.
export function getRfqServerClient() {
  const url = process.env.SUPABASE_RFQ_URL
  const key = process.env.SUPABASE_RFQ_ANON_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_RFQ_URL / SUPABASE_RFQ_ANON_KEY env vars')
  return createClient(url, key, { auth: { persistSession: false } })
}
