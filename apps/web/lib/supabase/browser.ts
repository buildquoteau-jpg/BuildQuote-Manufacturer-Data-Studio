import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Lazy singleton. Safe to import in any client component.
// Returns null if env vars are not configured so callers can degrade gracefully
// rather than throwing at module evaluation time.
let _client: SupabaseClient | null = null

export function getBrowserSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null
  if (!_client) {
    _client = createClient(url, anonKey)
  }
  return _client
}

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}
