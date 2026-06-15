'use server'

import { headers } from 'next/headers'
import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoginEmailPreference = 'primary' | 'secondary'

export type AccountProfileFields = {
  full_name: string | null
  company_email_primary: string | null
  company_email_secondary: string | null
  login_email_preference: LoginEmailPreference
}

export type AccountActionResult = { ok: true } | { ok: false; error: string }

// ─── Helpers ────────────────────────────────────────────────────────────────--

// Light email shape check — server-side guard, not a full RFC validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normaliseEmail(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

// ─── saveAccountProfile ─────────────────────────────────────────────────────--
// Updates the signed-in user's own data_studio_user_profiles row.
// Column-level grants (migration 032) ensure only safe fields are writable.

export async function saveAccountProfile(
  fields: AccountProfileFields,
): Promise<AccountActionResult> {
  const session = await getStudioSession()
  if (!session.profile || !session.user) return { ok: false, error: 'Not authenticated.' }

  const primary = normaliseEmail(fields.company_email_primary)
  const secondary = normaliseEmail(fields.company_email_secondary)

  if (fields.company_email_primary?.trim() && !primary) {
    return { ok: false, error: 'Primary company email is not valid.' }
  }
  if (primary && !EMAIL_RE.test(primary)) {
    return { ok: false, error: 'Primary company email is not valid.' }
  }
  if (secondary && !EMAIL_RE.test(secondary)) {
    return { ok: false, error: 'Second company email is not valid.' }
  }

  const preference: LoginEmailPreference =
    fields.login_email_preference === 'secondary' ? 'secondary' : 'primary'

  if (preference === 'secondary' && !secondary) {
    return { ok: false, error: 'Select a second company email before choosing it for login.' }
  }
  if (preference === 'primary' && !primary) {
    return { ok: false, error: 'Add a primary company email before choosing it for login.' }
  }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('data_studio_user_profiles')
    .update({
      full_name:               fields.full_name?.trim() || null,
      company_email_primary:   primary,
      company_email_secondary: secondary,
      login_email_preference:  preference,
      updated_at:              new Date().toISOString(),
    })
    .eq('auth_user_id', session.user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── changePassword ─────────────────────────────────────────────────────────--
// Inline password change for a signed-in user (no email round-trip).

export async function changePassword(newPassword: string): Promise<AccountActionResult> {
  const session = await getStudioSession()
  if (!session.profile || !session.user) return { ok: false, error: 'Not authenticated.' }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }

  const supabase = createStudioServerClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('different from the old') || msg.includes('should be different')) {
      return { ok: false, error: 'New password must be different from your current one.' }
    }
    if (msg.includes('weak') || msg.includes('at least')) {
      return { ok: false, error: 'Password is too weak. Use at least 8 characters.' }
    }
    return { ok: false, error: 'Could not update password. Please try again.' }
  }
  return { ok: true }
}

// ─── sendPasswordReset ──────────────────────────────────────────────────────--
// Emails a branded recovery link to the user's actual sign-in email.

export async function sendPasswordReset(): Promise<AccountActionResult> {
  const session = await getStudioSession()
  if (!session.profile || !session.user?.email) return { ok: false, error: 'Not authenticated.' }

  // Build an absolute redirect back to the reset page from the request origin.
  const h = headers()
  const origin =
    h.get('origin') ??
    (h.get('host') ? `https://${h.get('host')}` : process.env.NEXT_PUBLIC_SITE_URL ?? '')
  const redirectTo = origin ? `${origin}/reset-password` : undefined

  const supabase = createStudioServerClient()
  const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, { redirectTo })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('rate') || msg.includes('too many') || msg.includes('seconds')) {
      return { ok: false, error: 'A reset email was just sent. Please wait a moment before trying again.' }
    }
    return { ok: false, error: 'Could not send the reset email. Please try again.' }
  }
  return { ok: true }
}
