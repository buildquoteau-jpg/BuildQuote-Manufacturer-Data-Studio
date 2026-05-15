import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a browser-side Supabase client using @supabase/ssr.
 *
 * Uses the public anon key only. Never passes a service role key.
 *
 * Call from Client Components only. Do not use in Server Components,
 * Server Actions, or Route Handlers — use createStudioServerClient() there.
 */
export function createStudioBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createBrowserClient(url, anonKey)
}
