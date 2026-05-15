import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a server-side Supabase client that reads/writes session cookies
 * via the Next.js request/response cookie store.
 *
 * Uses the public anon key only. Never passes a service role key.
 *
 * Call from Server Components, Server Actions, and Route Handlers.
 * Do not import from client components.
 *
 * The setAll handler catches errors silently because Server Components
 * operate in a read-only cookie context. Session refresh in read-only
 * contexts requires either middleware or the auth callback route.
 */
export function createStudioServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!anonKey) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')

  const cookieStore = cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Server Component context — cookies are read-only here.
          // Token refresh is handled by the auth callback route.
          // Add middleware later if continuous token refresh is needed.
        }
      },
    },
  })
}
