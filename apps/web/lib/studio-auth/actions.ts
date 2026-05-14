'use server'

import { redirect } from 'next/navigation'
import { createStudioServerClient } from '../supabase/server'

// ============================================================
// Types
// ============================================================

export interface LoginState {
  error: string | null
}

// ============================================================
// loginWithPassword
// ============================================================

/**
 * Server action — sign in with email + password.
 *
 * Safe error messages only — never exposes raw Supabase error text,
 * env var values, or password content to the client.
 *
 * On success: redirects to /dashboard (role-based sub-redirect handled there).
 * On failure: returns a LoginState with a user-facing error string.
 *
 * redirectTo is not supported — all post-login destinations are internal
 * and determined server-side. External redirect URLs are not permitted.
 */
export async function loginWithPassword(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get('email')
  const rawPassword = formData.get('password')

  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { error: 'Email is required.' }
  }
  if (typeof rawPassword !== 'string' || !rawPassword) {
    return { error: 'Password is required.' }
  }

  const email = rawEmail.trim().toLowerCase()
  const password = rawPassword // never logged, never returned

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    // Missing env vars — do not expose config detail to client
    return { error: 'Studio is not configured. Contact BuildQuote.' }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Map Supabase errors to safe user-facing messages.
    // Never return error.message directly — it may contain internal detail.
    const msg = error.message.toLowerCase()
    if (
      msg.includes('invalid login') ||
      msg.includes('invalid credentials') ||
      msg.includes('email not found') ||
      msg.includes('wrong password') ||
      msg.includes('invalid email or password')
    ) {
      return { error: 'Incorrect email or password.' }
    }
    if (msg.includes('email not confirmed')) {
      return { error: 'Email not confirmed. Contact BuildQuote to activate your account.' }
    }
    if (msg.includes('too many requests') || msg.includes('rate limit')) {
      return { error: 'Too many sign-in attempts. Please wait a moment and try again.' }
    }
    // Generic fallback — safe, no internal detail leaked
    return { error: 'Sign in failed. Please try again or contact BuildQuote.' }
  }

  // Sign-in succeeded — redirect server-side to dashboard.
  // The dashboard will handle role-based sub-routing once getStudioSession() resolves the profile.
  redirect('/dashboard')
}

// ============================================================
// logout
// ============================================================

/**
 * Server action — sign out the current user and redirect to /login.
 *
 * Safe to call from any page via a form action:
 *   <form action={logout}><button type="submit">Sign out</button></form>
 */
export async function logout(): Promise<void> {
  try {
    const supabase = createStudioServerClient()
    await supabase.auth.signOut()
  } catch {
    // If sign-out fails (e.g. already signed out, env missing), still redirect to login
  }
  redirect('/login')
}
