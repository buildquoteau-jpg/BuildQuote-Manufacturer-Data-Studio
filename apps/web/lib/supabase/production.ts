import { createClient } from '@supabase/supabase-js'

/**
 * Read-only client pointing at the production BuildQuote database.
 * Used by the embed widget route only.
 * Env vars must be set in .env.local — never commit them.
 */
export function createProductionClient() {
  const url = process.env.NEXT_PUBLIC_PROD_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_PROD_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY')

  return createClient(url, key)
}
