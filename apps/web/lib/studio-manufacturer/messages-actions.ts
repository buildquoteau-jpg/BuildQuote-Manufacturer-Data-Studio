'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { assertManufacturerAccess } from './verification-actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ManufacturerMessage = {
  id: string
  manufacturer_id: string
  sender_type: 'manufacturer' | 'buildquote'
  sender_label: string | null
  body: string
  message_type: 'general' | 'help' | 'submission'
  related_publish_batch_id: string | null
  acknowledged_at: string | null
  created_at: string
}

export type ActionResult = { ok: true } | { ok: false; error: string }

async function assertBuildquoteStaff(): Promise<{ allowed: true; userId: string; label: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  if (session.globalRole !== 'buildquote_admin' && session.globalRole !== 'buildquote_reviewer') {
    return { allowed: false, error: 'Access denied.' }
  }
  return { allowed: true, userId: session.user!.id, label: session.profile.email }
}

// ─── postSubmissionMessage ──────────────────────────────────────────────────────
// Internal helper — called by submitForPublication() right after a publish batch
// is created, using the caller's already-open Supabase client. Not auth-gated
// itself; the caller has already verified manufacturer access.

export async function postSubmissionMessage(
  manufacturerId: string,
  senderUserId: string,
  senderLabel: string,
  body: string,
  publishBatchId: string,
): Promise<void> {
  const supabase = createStudioServerClient()
  const { error } = await supabase.from('manufacturer_messages').insert({
    manufacturer_id: manufacturerId,
    sender_type: 'manufacturer',
    sender_user_id: senderUserId,
    sender_label: senderLabel,
    body,
    message_type: 'submission',
    related_publish_batch_id: publishBatchId,
  })
  // Best-effort by design (the batch is already created), but a lost
  // submission note means staff never see the request at all.
  if (error) {
    console.error(`[postSubmissionMessage] batch ${publishBatchId} note not posted:`, error.message)
  }
}

// ─── getManufacturerMessages ────────────────────────────────────────────────────
// Fetches the full thread for one manufacturer. Accessible to that
// manufacturer's active members and to BuildQuote staff.

export async function getManufacturerMessages(
  manufacturerId: string,
): Promise<{ ok: true; messages: ManufacturerMessage[] } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { data, error } = await supabase
    .from('manufacturer_messages')
    .select('*')
    .eq('manufacturer_id', manufacturerId)
    .order('created_at', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, messages: (data ?? []) as ManufacturerMessage[] }
}

// ─── sendManufacturerMessage ─────────────────────────────────────────────────────
// A manufacturer asks for help or sends a general note.

export async function sendManufacturerMessage(
  manufacturerId: string,
  body: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }
  if (!body.trim()) return { ok: false, error: 'Message cannot be empty.' }

  const session = await getStudioSession()
  const supabase = createStudioServerClient()
  const { error } = await supabase.from('manufacturer_messages').insert({
    manufacturer_id: manufacturerId,
    sender_type: 'manufacturer',
    sender_user_id: auth.userId,
    sender_label: session.profile?.email ?? 'Manufacturer',
    body: body.trim(),
    message_type: 'help',
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── sendAdminReply ───────────────────────────────────────────────────────────
// BuildQuote staff reply into a manufacturer's thread.

export async function sendAdminReply(
  manufacturerId: string,
  body: string,
): Promise<ActionResult> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }
  if (!body.trim()) return { ok: false, error: 'Message cannot be empty.' }

  const supabase = createStudioServerClient()
  const { error } = await supabase.from('manufacturer_messages').insert({
    manufacturer_id: manufacturerId,
    sender_type: 'buildquote',
    sender_user_id: auth.userId,
    sender_label: auth.label,
    body: body.trim(),
    message_type: 'general',
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── getAllMessageThreads ───────────────────────────────────────────────────────
// Admin message board — every manufacturer that has at least one message,
// newest activity first.

export type MessageThreadSummary = {
  manufacturer_id: string
  manufacturer_name: string
  last_message: ManufacturerMessage
  message_count: number
}

// ─── acknowledgeAdminMessage ─────────────────────────────────────────────────
// Manufacturer marks a BuildQuote message as acknowledged from their Inbox.

export async function acknowledgeAdminMessage(
  messageId: string,
  manufacturerId: string,
): Promise<ActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const { error } = await supabase
    .from('manufacturer_messages')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('manufacturer_id', manufacturerId)
    .eq('sender_type', 'buildquote')
    .is('acknowledged_at', null)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ─── getAllMessageThreads ───────────────────────────────────────────────────────
export async function getAllMessageThreads(): Promise<
  { ok: true; threads: MessageThreadSummary[] } | { ok: false; error: string }
> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()

  const { data: manufacturers, error: mErr } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name')

  if (mErr) return { ok: false, error: mErr.message }

  const { data: messages, error: msgErr } = await supabase
    .from('manufacturer_messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (msgErr) return { ok: false, error: msgErr.message }

  const nameById = new Map((manufacturers ?? []).map((m) => [m.id as string, m.name as string]))
  const byMfr = new Map<string, ManufacturerMessage[]>()
  for (const msg of (messages ?? []) as ManufacturerMessage[]) {
    const list = byMfr.get(msg.manufacturer_id) ?? []
    list.push(msg)
    byMfr.set(msg.manufacturer_id, list)
  }

  const threads: MessageThreadSummary[] = []
  Array.from(byMfr.entries()).forEach(([manufacturerId, msgs]) => {
    if (msgs.length === 0) return
    threads.push({
      manufacturer_id: manufacturerId,
      manufacturer_name: nameById.get(manufacturerId) ?? 'Unknown manufacturer',
      last_message: msgs[0],
      message_count: msgs.length,
    })
  })

  threads.sort((a, b) => b.last_message.created_at.localeCompare(a.last_message.created_at))

  return { ok: true, threads }
}
