'use server'

// Admin-only: provision and manage a manufacturer's real Studio login.
//
// This is the "invite flow" that migration 034 / pending-contact-actions.ts
// referred to as "not yet built". A BuildQuote admin sets a temporary email +
// password per manufacturer user; the account is created already-confirmed so
// NO verification email is ever sent and the user can sign in immediately at
// /login.
//
// Everything here runs through the service-role client (bypasses RLS) and is
// gated behind buildquote_admin. Provisioning writes three things:
//   1. auth.users        — via supabase.auth.admin.createUser (email_confirm: true)
//   2. data_studio_user_profiles  — global_role 'manufacturer_user', status 'active'
//   3. manufacturer_users         — the workspace membership (auth_user_id +
//                                   user_profile_id + status 'active'), which is
//                                   what the RLS policies key off (see 024/045).
//
// The pending_contact_* columns on data_studio_manufacturers remain a pre-fill
// convenience — this action is what turns them into a working account.

import { revalidatePath } from 'next/cache'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getStudioSession } from '@/lib/studio-auth/session'

export type WorkspaceLoginRole =
  | 'manufacturer_admin'
  | 'manufacturer_reviewer'
  | 'manufacturer_viewer'

export type WorkspaceLoginMembershipStatus = 'invited' | 'active' | 'suspended'

export type WorkspaceLogin = {
  membershipId: string
  authUserId: string | null
  userProfileId: string | null
  email: string
  fullName: string | null
  role: WorkspaceLoginRole
  membershipStatus: WorkspaceLoginMembershipStatus
  profileStatus: 'active' | 'suspended' | null
  lastActiveAt: string | null
  createdAt: string
}

export type WorkspaceLoginsResult =
  | { ok: true; logins: WorkspaceLogin[] }
  | { ok: false; error: string }

export type WorkspaceLoginActionResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const VALID_ROLES: WorkspaceLoginRole[] = [
  'manufacturer_admin',
  'manufacturer_reviewer',
  'manufacturer_viewer',
]

type ServiceClient = ReturnType<typeof createStudioServiceClient>

async function assertAdmin(): Promise<
  { allowed: true; profileId: string | null } | { allowed: false; error: string }
> {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return { allowed: false, error: 'Access denied. This is only available to BuildQuote admin.' }
  }
  return { allowed: true, profileId: session.profile?.id ?? null }
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Finds a Supabase Auth user id by email by paging through the admin list.
 * Only used to recover from the rare "auth user exists but has no Studio
 * profile" orphan case. Fine for Data Studio's small user counts.
 */
async function findAuthUserIdByEmail(svc: ServiceClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) return null
    const match = data.users.find((u) => u.email?.toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < 1000) return null
  }
  return null
}

/**
 * Deletes an auth user created moments ago by a provisioning step that then
 * failed. Never throws — the caller is already returning an error — but a
 * failed rollback leaves an orphaned login nobody knows about.
 */
async function rollbackAuthUser(svc: ServiceClient, authUserId: string): Promise<void> {
  try {
    const { error } = await svc.auth.admin.deleteUser(authUserId)
    if (error) console.error(`[createManufacturerLogin] rollback left auth user ${authUserId} behind:`, error.message)
  } catch (err) {
    console.error(`[createManufacturerLogin] rollback left auth user ${authUserId} behind:`, err)
  }
}

// ============================================================
// listManufacturerLogins
// ============================================================

export async function listManufacturerLogins(
  manufacturerId: string,
): Promise<WorkspaceLoginsResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  let svc: ServiceClient
  try {
    svc = createStudioServiceClient()
  } catch {
    return { ok: false, error: 'Service role not configured — check SUPABASE_SERVICE_ROLE_KEY.' }
  }

  const { data: memberRows, error: memberErr } = await svc
    .from('manufacturer_users')
    .select('id, auth_user_id, user_profile_id, email, role, status, last_active_at, created_at')
    .eq('manufacturer_id', manufacturerId)
    .order('created_at', { ascending: true })

  if (memberErr) return { ok: false, error: memberErr.message }

  type MemberRow = {
    id: string
    auth_user_id: string | null
    user_profile_id: string | null
    email: string
    role: WorkspaceLoginRole
    status: WorkspaceLoginMembershipStatus
    last_active_at: string | null
    created_at: string
  }
  const rows = (memberRows ?? []) as MemberRow[]

  // Resolve profile full_name / status for the linked profiles in one query.
  const profileIds = Array.from(
    new Set(rows.map((r) => r.user_profile_id).filter((id): id is string => !!id)),
  )
  const profileMap = new Map<string, { fullName: string | null; status: 'active' | 'suspended' }>()
  if (profileIds.length > 0) {
    const { data: profileRows } = await svc
      .from('data_studio_user_profiles')
      .select('id, full_name, status')
      .in('id', profileIds)
    for (const p of (profileRows ?? []) as Array<{
      id: string
      full_name: string | null
      status: 'active' | 'suspended'
    }>) {
      profileMap.set(p.id, { fullName: p.full_name, status: p.status })
    }
  }

  const logins: WorkspaceLogin[] = rows.map((r) => {
    const profile = r.user_profile_id ? profileMap.get(r.user_profile_id) : undefined
    return {
      membershipId: r.id,
      authUserId: r.auth_user_id,
      userProfileId: r.user_profile_id,
      email: r.email,
      fullName: profile?.fullName ?? null,
      role: r.role,
      membershipStatus: r.status,
      profileStatus: profile?.status ?? null,
      lastActiveAt: r.last_active_at,
      createdAt: r.created_at,
    }
  })

  return { ok: true, logins }
}

// ============================================================
// createManufacturerLogin
// ============================================================

export async function createManufacturerLogin(
  manufacturerId: string,
  input: { email: string; password: string; fullName: string | null; role: WorkspaceLoginRole },
): Promise<WorkspaceLoginActionResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  const email = normaliseEmail(input.email ?? '')
  const password = (input.password ?? '').trim()
  const fullName = input.fullName?.trim() || null
  const role: WorkspaceLoginRole = VALID_ROLES.includes(input.role) ? input.role : 'manufacturer_admin'

  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  let svc: ServiceClient
  try {
    svc = createStudioServiceClient()
  } catch {
    return { ok: false, error: 'Service role not configured — check SUPABASE_SERVICE_ROLE_KEY.' }
  }

  // Does a Studio profile already exist for this email?
  const { data: existingProfile } = await svc
    .from('data_studio_user_profiles')
    .select('id, auth_user_id, global_role')
    .eq('email', email)
    .maybeSingle()

  let authUserId: string
  let userProfileId: string
  let createdAuthUser = false

  if (existingProfile) {
    const profile = existingProfile as {
      id: string
      auth_user_id: string
      global_role: string
    }
    if (profile.global_role !== 'manufacturer_user') {
      return {
        ok: false,
        error: 'That email belongs to a BuildQuote staff account and cannot be used as a manufacturer login.',
      }
    }

    // Already a member of THIS workspace?
    const { data: existingMembership } = await svc
      .from('manufacturer_users')
      .select('id')
      .eq('manufacturer_id', manufacturerId)
      .eq('user_profile_id', profile.id)
      .maybeSingle()
    if (existingMembership) {
      return {
        ok: false,
        error: 'This person already has a login for this workspace. Use “Set new password” instead.',
      }
    }

    authUserId = profile.auth_user_id
    userProfileId = profile.id

    // Reuse the account but honour the new temporary password.
    const { error: pwErr } = await svc.auth.admin.updateUserById(authUserId, { password })
    if (pwErr) return { ok: false, error: `Could not set password: ${pwErr.message}` }
  } else {
    // Fresh account. email_confirm: true → confirmed immediately, no email sent.
    const { data: created, error: authErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })

    if (authErr || !created?.user) {
      const message = authErr?.message ?? ''
      // Recover from an orphaned auth user (exists in auth.users, no profile row).
      if (/already|registered|exists/i.test(message)) {
        const orphanId = await findAuthUserIdByEmail(svc, email)
        if (!orphanId) {
          return {
            ok: false,
            error: 'An auth account already exists for this email but could not be reconciled. Contact a developer.',
          }
        }
        await svc.auth.admin.updateUserById(orphanId, { password })
        authUserId = orphanId
      } else {
        return { ok: false, error: `Could not create login: ${message || 'unknown error'}` }
      }
    } else {
      authUserId = created.user.id
      createdAuthUser = true
    }

    // Insert the Studio profile.
    const { data: profileRow, error: profileErr } = await svc
      .from('data_studio_user_profiles')
      .insert({
        auth_user_id: authUserId!,
        email,
        full_name: fullName,
        global_role: 'manufacturer_user',
        status: 'active',
        company_email_primary: email,
      })
      .select('id')
      .single()

    if (profileErr || !profileRow) {
      // Roll back the auth user we just created so we don't leave an orphan.
      if (createdAuthUser) {
        await rollbackAuthUser(svc, authUserId!)
      }
      return { ok: false, error: `Could not create profile: ${profileErr?.message ?? 'unknown error'}` }
    }
    userProfileId = (profileRow as { id: string }).id
  }

  // Insert the workspace membership. auth_user_id + status:'active' are what the
  // RLS policies (024/045/etc.) require for the user's own reads/writes to pass.
  const now = new Date().toISOString()
  const { error: membershipErr } = await svc.from('manufacturer_users').insert({
    manufacturer_id: manufacturerId,
    user_profile_id: userProfileId!,
    auth_user_id: authUserId!,
    email,
    role,
    status: 'active',
    invited_by: check.profileId,
    invited_at: now,
    accepted_at: now,
  })

  if (membershipErr) {
    // If we created a brand-new account for this, clean it up to avoid a
    // profile/auth row with no workspace.
    if (createdAuthUser) {
      const { error: profileDeleteErr } = await svc.from('data_studio_user_profiles').delete().eq('id', userProfileId!)
      if (profileDeleteErr) {
        console.error(`[createManufacturerLogin] rollback left profile ${userProfileId} behind:`, profileDeleteErr.message)
      }
      await rollbackAuthUser(svc, authUserId!)
    }
    return { ok: false, error: `Could not create membership: ${membershipErr.message}` }
  }

  revalidatePath('/manufacturer/account')
  return { ok: true }
}

// ============================================================
// resetManufacturerLoginPassword
// ============================================================

export async function resetManufacturerLoginPassword(
  manufacturerId: string,
  authUserId: string,
  newPassword: string,
): Promise<WorkspaceLoginActionResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  const password = (newPassword ?? '').trim()
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }

  let svc: ServiceClient
  try {
    svc = createStudioServiceClient()
  } catch {
    return { ok: false, error: 'Service role not configured — check SUPABASE_SERVICE_ROLE_KEY.' }
  }

  // Guard: only reset a user who is actually a member of this workspace.
  const { data: membership } = await svc
    .from('manufacturer_users')
    .select('id')
    .eq('manufacturer_id', manufacturerId)
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (!membership) {
    return { ok: false, error: 'No login found for this workspace.' }
  }

  const { error } = await svc.auth.admin.updateUserById(authUserId, { password })
  if (error) return { ok: false, error: `Could not set password: ${error.message}` }

  revalidatePath('/manufacturer/account')
  return { ok: true }
}

// ============================================================
// setManufacturerLoginStatus
// Workspace-scoped enable/disable: flips only the membership row so a
// multi-workspace user is unaffected elsewhere. A suspended membership is
// excluded by session.ts (status='active' filter) and blocks RLS writes.
// ============================================================

export async function setManufacturerLoginStatus(
  manufacturerId: string,
  authUserId: string,
  status: 'active' | 'suspended',
): Promise<WorkspaceLoginActionResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  if (status !== 'active' && status !== 'suspended') {
    return { ok: false, error: 'Invalid status.' }
  }

  let svc: ServiceClient
  try {
    svc = createStudioServiceClient()
  } catch {
    return { ok: false, error: 'Service role not configured — check SUPABASE_SERVICE_ROLE_KEY.' }
  }

  const { error } = await svc
    .from('manufacturer_users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('manufacturer_id', manufacturerId)
    .eq('auth_user_id', authUserId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/manufacturer/account')
  return { ok: true }
}
