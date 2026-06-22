'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'

export type VerificationStatus = 'pending_review' | 'in_review' | 'manufacturer_verified'

export type UpdateVerificationResult = { ok: true } | { ok: false; error: string }

export type SystemAttributes = {
  bal_rating: string | null
  fire_rating: string | null
  acoustic_rating: string | null
  moisture_resistant: boolean
  structural_grade: string | null
  australian_made: boolean
}

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

export async function updateSystemAttributes(
  systemId: string,
  attrs: SystemAttributes,
): Promise<UpdateVerificationResult> {
  const auth = await assertCanWrite()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('staged_systems')
    .update({
      bal_rating:         attrs.bal_rating || null,
      fire_rating:        attrs.fire_rating?.trim() || null,
      acoustic_rating:    attrs.acoustic_rating?.trim() || null,
      moisture_resistant: attrs.moisture_resistant,
      structural_grade:   attrs.structural_grade?.trim() || null,
      australian_made:    attrs.australian_made,
    })
    .eq('id', systemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
