'use server'

// Admin-only: pre-fill a manufacturer's "authorised verifier" contact details
// before that manufacturer has a real login of their own.
//
// These live on data_studio_manufacturers (pending_contact_*), NOT on
// data_studio_user_profiles. That separation is the fix for the workspace
// crossover bug: admin "view as" impersonation shares one real admin login
// across every manufacturer, so anything keyed by auth_user_id (the old
// behaviour) was really just the admin's own profile, bleeding between
// workspaces. Writing to the manufacturer row instead scopes the data
// correctly and never touches auth.users — no account is created, no email
// is sent.

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

export type LoginPreference = 'primary' | 'secondary'

export type PendingContactFields = {
  full_name: string | null
  email_primary: string | null
  email_secondary: string | null
  login_preference: LoginPreference
}

export type PendingContactActionResult = { ok: true } | { ok: false; error: string }
export type PendingContactGetResult =
  | { ok: true; fields: PendingContactFields }
  | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normaliseEmail(value: string | null): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

async function assertAdmin(): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return { allowed: false, error: 'Access denied. This is only available to BuildQuote admin.' }
  }
  return { allowed: true }
}

export async function getPendingContact(manufacturerId: string): Promise<PendingContactGetResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .select('pending_contact_full_name, pending_contact_email_primary, pending_contact_email_secondary, pending_contact_login_preference')
    .eq('id', manufacturerId)
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Manufacturer not found.' }

  return {
    ok: true,
    fields: {
      full_name:        data.pending_contact_full_name ?? '',
      email_primary:    data.pending_contact_email_primary ?? '',
      email_secondary:  data.pending_contact_email_secondary ?? '',
      login_preference: (data.pending_contact_login_preference ?? 'primary') as LoginPreference,
    },
  }
}

export async function savePendingContact(
  manufacturerId: string,
  fields: PendingContactFields,
): Promise<PendingContactActionResult> {
  const check = await assertAdmin()
  if (!check.allowed) return { ok: false, error: check.error }

  const primary = normaliseEmail(fields.email_primary)
  const secondary = normaliseEmail(fields.email_secondary)

  if (fields.email_primary?.trim() && !primary) {
    return { ok: false, error: 'Primary email is not valid.' }
  }
  if (primary && !EMAIL_RE.test(primary)) {
    return { ok: false, error: 'Primary email is not valid.' }
  }
  if (secondary && !EMAIL_RE.test(secondary)) {
    return { ok: false, error: 'Second email is not valid.' }
  }

  const preference: LoginPreference = fields.login_preference === 'secondary' ? 'secondary' : 'primary'
  if (preference === 'secondary' && !secondary) {
    return { ok: false, error: 'Add a second email before selecting it as preferred.' }
  }
  if (preference === 'primary' && !primary) {
    return { ok: false, error: 'Add a primary email before selecting it as preferred.' }
  }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('data_studio_manufacturers')
    .update({
      pending_contact_full_name:       fields.full_name?.trim() || null,
      pending_contact_email_primary:   primary,
      pending_contact_email_secondary: secondary,
      pending_contact_login_preference: preference,
      updated_at: new Date().toISOString(),
    })
    .eq('id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
