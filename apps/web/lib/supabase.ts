import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_URL\n' +
      'Add it to .env.local — see docs/supabase-local-setup.md'
  )
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
      'Add it to .env.local — see docs/supabase-local-setup.md'
  )
}

/**
 * Browser-safe Supabase client.
 *
 * Uses the public anon key only — safe to import in any client component,
 * server component, or API route that does not require elevated privileges.
 *
 * For server-side admin operations (service role), use a separate
 * server-only client — do not add the service role key here.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
