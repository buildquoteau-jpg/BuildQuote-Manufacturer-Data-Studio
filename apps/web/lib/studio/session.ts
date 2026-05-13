import { getServerSupabaseClient } from '../supabase/server'

/**
 * Result returned by getStudioSession() while auth is not fully wired.
 *
 * authWired is a literal false — this type will be widened when real session
 * reads are implemented so the type system enforces the distinction.
 */
export interface StudioSessionShell {
  authWired: false
  user: null
  reason: 'ENV_MISSING' | 'NOT_IMPLEMENTED'
  message: string
}

/**
 * Returns the current Studio session context for the active server request.
 *
 * SERVER-SIDE ONLY. Do not import from client components.
 *
 * Shell status: always returns { authWired: false, user: null }.
 * Route protection is not active — see access.ts for the guard stubs.
 *
 * Steps to wire real auth when the time comes:
 *   1. Install @supabase/ssr
 *   2. Replace getServerSupabaseClient() with createServerClient from @supabase/ssr
 *      (passing Next.js cookies() so the session cookie is read from the request)
 *   3. const { data: { user } } = await supabase.auth.getUser()
 *   4. If user is null: return null (caller redirects to /login)
 *   5. SELECT * FROM data_studio_user_profiles WHERE auth_user_id = user.id
 *   6. Return real StudioUser — update access.ts getCurrentStudioAccessContext() too
 */
export async function getStudioSession(): Promise<StudioSessionShell> {
  const client = getServerSupabaseClient()

  if (!client) {
    return {
      authWired: false,
      user: null,
      reason: 'ENV_MISSING',
      message:
        'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. ' +
        'Add them to apps/web/.env.local — see docs/supabase-local-setup.md.',
    }
  }

  // Client is initialised but session reads are not wired yet.
  // The base @supabase/supabase-js client cannot read Next.js request cookies;
  // install @supabase/ssr and use createServerClient before calling getUser() here.
  return {
    authWired: false,
    user: null,
    reason: 'NOT_IMPLEMENTED',
    message:
      'Supabase client initialised with anon key. ' +
      'Session reads require @supabase/ssr — not yet installed.',
  }
}
