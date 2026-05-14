import { createStudioServerClient } from '../supabase/server'

// ============================================================
// Types
// Mirror the CHECK constraints from migrations 003 / 013.
// ============================================================

export type StudioGlobalRole =
  | 'buildquote_admin'
  | 'buildquote_reviewer'
  | 'manufacturer_user'

export type ManufacturerMembershipRole =
  | 'manufacturer_admin'
  | 'manufacturer_reviewer'
  | 'manufacturer_viewer'

export interface StudioUserProfile {
  id: string
  authUserId: string
  email: string
  fullName: string | null
  globalRole: StudioGlobalRole
  status: 'active' | 'suspended'
}

export interface StudioManufacturerMembership {
  id: string
  manufacturerId: string
  role: ManufacturerMembershipRole
  status: 'invited' | 'active' | 'suspended'
}

/**
 * Resolved Studio session for the current request.
 *
 * user        — the Supabase Auth user (JWT-verified via getUser())
 * profile     — the data_studio_user_profiles row; null if not set up or suspended
 * globalRole  — shortcut from profile.globalRole; null when profile is null
 * memberships — manufacturer_users rows; populated only for manufacturer_user role
 *
 * When profile is null the user is authenticated at the Supabase level but has
 * no Studio account. Callers should treat this as "account not set up".
 */
export interface StudioSession {
  user: { id: string; email: string | undefined } | null
  profile: StudioUserProfile | null
  globalRole: StudioGlobalRole | null
  memberships: StudioManufacturerMembership[]
}

const NULL_SESSION: StudioSession = {
  user: null,
  profile: null,
  globalRole: null,
  memberships: [],
}

// ============================================================
// Session resolver
// SERVER-SIDE ONLY. Do not import from client components.
// ============================================================

/**
 * Resolves the Studio session for the current server request.
 *
 * Uses supabase.auth.getUser() — this re-validates the JWT with the
 * Supabase server on every call. Do NOT use getSession() for authorization;
 * it reads from the cookie without server-side token verification.
 *
 * Returns NULL_SESSION if:
 *   - env vars are missing
 *   - no Supabase auth user found
 *   - no data_studio_user_profiles row exists for the auth user
 *   - the profile status is not 'active'
 */
export async function getStudioSession(): Promise<StudioSession> {
  // Gracefully handle missing env vars — don't throw in page rendering
  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return NULL_SESSION
  }

  // JWT-verified user lookup — safe for authorization decisions
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) return NULL_SESSION

  // Look up Studio profile by auth_user_id
  // Table: data_studio_user_profiles (migration 003)
  const { data: profileRow, error: profileError } = await supabase
    .from('data_studio_user_profiles')
    .select('id, auth_user_id, email, full_name, global_role, status')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError || !profileRow) {
    // Auth user exists but no Studio profile row yet.
    // Happens when a Supabase Auth user is created before the profile row is inserted.
    // TODO (post-auth-wiring): add a server action that creates the profile row on first sign-in,
    //   or add a Supabase Auth trigger (migration) that inserts the row automatically.
    return {
      user: { id: user.id, email: user.email },
      profile: null,
      globalRole: null,
      memberships: [],
    }
  }

  if (profileRow.status !== 'active') {
    // Suspended account — treat as unauthenticated for access purposes
    return {
      user: { id: user.id, email: user.email },
      profile: null,
      globalRole: null,
      memberships: [],
    }
  }

  const profile: StudioUserProfile = {
    id: profileRow.id,
    authUserId: profileRow.auth_user_id,
    email: profileRow.email,
    fullName: profileRow.full_name ?? null,
    globalRole: profileRow.global_role as StudioGlobalRole,
    status: profileRow.status as 'active' | 'suspended',
  }

  // For manufacturer_user: fetch active workspace memberships.
  // buildquote_admin and buildquote_reviewer have global access — no membership rows needed.
  // Table: manufacturer_users (migration 001 + 003)
  // Columns used: id, manufacturer_id, role, status, user_profile_id
  let memberships: StudioManufacturerMembership[] = []

  if (profile.globalRole === 'manufacturer_user') {
    const { data: memberRows } = await supabase
      .from('manufacturer_users')
      .select('id, manufacturer_id, role, status')
      .eq('user_profile_id', profile.id)
      .eq('status', 'active')

    memberships = (memberRows ?? []).map((row) => ({
      id: row.id as string,
      manufacturerId: row.manufacturer_id as string,
      role: row.role as ManufacturerMembershipRole,
      status: row.status as StudioManufacturerMembership['status'],
    }))
  }

  return {
    user: { id: user.id, email: user.email },
    profile,
    globalRole: profile.globalRole,
    memberships,
  }
}
