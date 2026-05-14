import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import type { ReactNode } from 'react'

/**
 * Protected route group layout — V1 auth gate.
 *
 * Redirects to /login if no valid Studio session with a profile exists.
 *
 * What this DOES enforce:
 *   - User must be authenticated (valid Supabase Auth JWT via getUser())
 *   - User must have an active data_studio_user_profiles row
 *
 * What this does NOT enforce yet (next chunk):
 *   - Role-based authorization (admin vs manufacturer vs reviewer)
 *   - RLS policies — database-level scoping comes after this gate
 *   - Manufacturer-specific workspace access
 *
 * Existing Studio pages (dashboard, admin/*, manufacturer/*) are NOT yet
 * moved under this group. They remain accessible without auth while the
 * protected group is tested. Migration of those routes is the next step.
 */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getStudioSession()

  if (!session.profile) {
    // No valid session or no Studio profile:
    // - env vars missing → session.user is null
    // - not signed in → session.user is null
    // - signed in but no data_studio_user_profiles row → session.user non-null, profile null
    // - account suspended → profile null (session helper normalises this)
    redirect('/login')
  }

  return <>{children}</>
}
