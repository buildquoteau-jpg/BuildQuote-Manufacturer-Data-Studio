// BuildQuote Data Studio — Access control skeleton.
//
// THIS IS A SKELETON ONLY. No real authentication or authorisation is wired yet.
// Every function in this file is a stub that returns a clearly-typed "not wired" result.
//
// Purpose:
//   Centralise the future auth/access-control shape in one place so that when
//   Supabase Auth is wired later, all pages and guards update in one module
//   rather than having auth logic scattered across individual pages.
//
// What this file will become when auth is wired:
//   - getCurrentStudioAccessContext()  →  reads Supabase session via server-side client
//   - requireStudioUser()              →  redirects to /login if no session
//   - requireBuildQuoteAdmin()         →  403 / redirect if not admin role
//   - requireManufacturerAccess()      →  403 / redirect if no membership for manufacturer
//
// The pure functions (canAccessManufacturer, canPublishToProduction, etc.) are fully
// implemented now and can be unit-tested without a database. They reflect the
// access rules documented in docs/studio-auth-dashboard-schema-plan.md.
//
// Do not add real Supabase session reads or cookie access to this file until
// auth implementation is confirmed ready.

// ============================================================
// Role and status literals
// These mirror the CHECK constraints in migration 013.
// ============================================================

/** System-level role on data_studio_user_profiles.global_role. */
export type StudioGlobalRole =
  | 'buildquote_admin'
  | 'buildquote_reviewer'
  | 'manufacturer_user'

/**
 * Workspace-level role on manufacturer_users.role.
 * Only applies to users whose global_role is 'manufacturer_user'.
 * buildquote_admin and buildquote_reviewer do not have workspace roles —
 * their global role grants cross-manufacturer access directly.
 */
export type ManufacturerMembershipRole =
  | 'manufacturer_admin'
  | 'manufacturer_reviewer'
  | 'manufacturer_viewer'

export type StudioUserStatus = 'active' | 'suspended'

export type ManufacturerMembershipStatus = 'invited' | 'active' | 'suspended'

// ============================================================
// Core types
// ============================================================

/** A signed-in Data Studio user. Maps to data_studio_user_profiles. */
export interface StudioUser {
  id: string
  email: string
  displayName: string | null
  globalRole: StudioGlobalRole
  status: StudioUserStatus
}

/**
 * One workspace membership row for a manufacturer_user.
 * Maps to manufacturer_users(user_profile_id, manufacturer_id, role, status).
 */
export interface ManufacturerMembership {
  manufacturerId: string
  role: ManufacturerMembershipRole
  status: ManufacturerMembershipStatus
}

/**
 * The full access context resolved at request time.
 *
 * isAuthWired: false until Supabase Auth is connected.
 * When false, user and memberships are stubs — do not trust them for real access decisions.
 *
 * buildquote_admin and buildquote_reviewer users will have an empty memberships array;
 * their access is governed by globalRole alone.
 */
export interface StudioAccessContext {
  readonly isAuthWired: false
  user: StudioUser | null
  memberships: ManufacturerMembership[]
}

/**
 * Return type for require* guards.
 * Callers should check ok before using context.
 *
 * When auth is wired, the 'AUTH_NOT_WIRED' reason will be removed and guards
 * will redirect rather than return ok:false, following Next.js redirect() convention.
 */
export type StudioAuthResult =
  | { ok: true; context: StudioAccessContext }
  | { ok: false; reason: 'AUTH_NOT_WIRED' | 'UNAUTHENTICATED' | 'FORBIDDEN' }

// ============================================================
// Stub context
// Used by all stub functions below.
// Replace with real session resolution when auth is wired.
// ============================================================

const STUB_CONTEXT: StudioAccessContext = {
  isAuthWired: false,
  user: null,
  memberships: [],
}

// ============================================================
// Context resolver
//
// Will become: read Supabase session from cookies, look up
// data_studio_user_profiles + manufacturer_users rows.
// ============================================================

/**
 * Returns the current Studio access context for the active request.
 *
 * SERVER-SIDE ONLY. Do not call from client components.
 *
 * Currently returns a stub context (user: null, isAuthWired: false).
 * When auth is wired, this will read the Supabase session from cookies
 * and hydrate the full StudioAccessContext.
 */
export async function getCurrentStudioAccessContext(): Promise<StudioAccessContext> {
  // TODO: replace with real session resolution
  //   const supabase = createServerClient(...)
  //   const { data: { user } } = await supabase.auth.getUser()
  //   const profile = await supabase.from('data_studio_user_profiles')...
  //   const memberships = await supabase.from('manufacturer_users')...
  return STUB_CONTEXT
}

// ============================================================
// Route guards (stubs)
//
// These will be called at the top of page.tsx server components
// to protect routes. For now they return typed not-wired results
// rather than redirecting, so shell pages remain navigable.
// ============================================================

/**
 * Requires any authenticated Studio user.
 *
 * When auth is wired: redirect('/login') if no session.
 * Now: returns { ok: false, reason: 'AUTH_NOT_WIRED' }.
 */
export async function requireStudioUser(): Promise<StudioAuthResult> {
  const context = await getCurrentStudioAccessContext()
  if (!context.isAuthWired) {
    return { ok: false, reason: 'AUTH_NOT_WIRED' }
  }
  if (!context.user) {
    return { ok: false, reason: 'UNAUTHENTICATED' }
  }
  return { ok: true, context }
}

/**
 * Requires the current user to be a buildquote_admin.
 *
 * When auth is wired: redirect or 403 if not admin.
 * Now: returns { ok: false, reason: 'AUTH_NOT_WIRED' }.
 */
export async function requireBuildQuoteAdmin(): Promise<StudioAuthResult> {
  const context = await getCurrentStudioAccessContext()
  if (!context.isAuthWired) {
    return { ok: false, reason: 'AUTH_NOT_WIRED' }
  }
  if (!context.user) {
    return { ok: false, reason: 'UNAUTHENTICATED' }
  }
  if (context.user.globalRole !== 'buildquote_admin') {
    return { ok: false, reason: 'FORBIDDEN' }
  }
  return { ok: true, context }
}

/**
 * Requires the current user to have active membership for the given manufacturer.
 * buildquote_admin and buildquote_reviewer pass without a membership check.
 *
 * When auth is wired: redirect or 403 if no access.
 * Now: returns { ok: false, reason: 'AUTH_NOT_WIRED' }.
 */
export async function requireManufacturerAccess(
  manufacturerId: string,
): Promise<StudioAuthResult> {
  const context = await getCurrentStudioAccessContext()
  if (!context.isAuthWired) {
    return { ok: false, reason: 'AUTH_NOT_WIRED' }
  }
  if (!context.user) {
    return { ok: false, reason: 'UNAUTHENTICATED' }
  }
  if (!canAccessManufacturer(context, manufacturerId)) {
    return { ok: false, reason: 'FORBIDDEN' }
  }
  return { ok: true, context }
}

// ============================================================
// Pure access-check functions
//
// These are fully implemented now. They contain no stubs —
// the logic is correct regardless of whether auth is wired.
// They can be unit-tested by constructing mock contexts directly.
// ============================================================

/**
 * Returns true if the user in context may access the given manufacturer workspace.
 *
 * Rules:
 *   buildquote_admin     → always true (universal access)
 *   buildquote_reviewer  → always true (review access across all manufacturers)
 *   manufacturer_user    → true only if active membership exists for manufacturerId
 */
export function canAccessManufacturer(
  context: StudioAccessContext,
  manufacturerId: string,
): boolean {
  if (!context.user) return false
  const { globalRole } = context.user
  if (globalRole === 'buildquote_admin' || globalRole === 'buildquote_reviewer') {
    return true
  }
  return context.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
}

/**
 * Returns true if the user may trigger a production publish.
 *
 * Only buildquote_admin may publish. This gate exists even when
 * all manufacturer data is verified and approved.
 *
 * buildquote_reviewer and all manufacturer_user roles: false.
 */
export function canPublishToProduction(context: StudioAccessContext): boolean {
  if (!context.user) return false
  return context.user.globalRole === 'buildquote_admin'
}

/**
 * Returns true if the user may review and verify manufacturer data
 * (approve/reject fields, add reviewer notes, flag items for correction).
 *
 * Rules:
 *   buildquote_admin                                   → true
 *   buildquote_reviewer                                → true
 *   manufacturer_admin for this manufacturer           → true
 *   manufacturer_reviewer for this manufacturer        → true
 *   manufacturer_viewer for this manufacturer          → false (read-only, no verify actions)
 *   manufacturer_user with no membership               → false
 */
export function canReviewManufacturerData(
  context: StudioAccessContext,
  manufacturerId: string,
): boolean {
  if (!context.user) return false
  const { globalRole } = context.user
  if (globalRole === 'buildquote_admin' || globalRole === 'buildquote_reviewer') {
    return true
  }
  const membership = context.memberships.find(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!membership) return false
  return (
    membership.role === 'manufacturer_admin' ||
    membership.role === 'manufacturer_reviewer'
  )
}
