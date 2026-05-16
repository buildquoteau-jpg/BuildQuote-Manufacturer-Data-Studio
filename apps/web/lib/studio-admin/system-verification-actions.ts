'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

export type VerificationStatus = 'pending_review' | 'in_review' | 'manufacturer_verified'

export type UpdateVerificationResult = { ok: true } | { ok: false; error: string }

async function assertCanWrite(): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (
    session.globalRole !== 'buildquote_admin' &&
    session.globalRole !== 'buildquote_reviewer'
  ) {
    return { allowed: false, error: 'Access denied.' }
  }
  return { allowed: true }
}

export async function updateSystemVerification(
  systemId: string,
  status: VerificationStatus,
  reviewerNotes: string | null,
): Promise<UpdateVerificationResult> {
  const auth = await assertCanWrite()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({
      verification_status: status,
      reviewer_notes: reviewerNotes?.trim() || null,
    })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
