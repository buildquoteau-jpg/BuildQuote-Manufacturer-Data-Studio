import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Server-side Supabase client factory using the public anon key only.
 *
 * SHELL NOTE: Uses the base @supabase/supabase-js createClient, which does not
 * read or write Next.js request cookies. This means session tokens set by
 * Supabase Auth are not accessible in server components with this client.
 *
 * When real auth is wired:
 *   1. Install @supabase/ssr  (pnpm add @supabase/ssr)
 *   2. Replace this factory with createServerClient from @supabase/ssr, passing
 *      the Next.js cookies() store so session cookies are read correctly.
 *   3. Update session.ts to call supabase.auth.getUser() from the ssr client.
 *
 * Never add the service role key to this module.
 */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null
  return createClient(url, anonKey)
}

export function isServerSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}
