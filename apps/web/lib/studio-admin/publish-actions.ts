'use server'

import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { publishBatch, type PublishBatchResult } from './publish'

async function assertBuildquoteStaff(): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  if (session.globalRole !== 'buildquote_admin' && session.globalRole !== 'buildquote_reviewer') {
    return { allowed: false, error: 'Access denied.' }
  }
  return { allowed: true }
}

// ─── getPendingPublishBatches ───────────────────────────────────────────────
// Admin queue — every batch not yet fully published, newest first.

export type PendingBatch = {
  id: string
  manufacturer_id: string
  manufacturer_name: string
  status: string
  notes: string | null
  created_at: string
  new_count: number
  update_count: number
  failed_count: number
}

export async function getPendingPublishBatches(): Promise<
  { ok: true; batches: PendingBatch[] } | { ok: false; error: string }
> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServiceClient()

  const { data: batches, error: batchErr } = await supabase
    .from('publish_batches')
    .select('id, manufacturer_id, status, notes, created_at')
    .neq('status', 'published')
    .order('created_at', { ascending: false })
  if (batchErr) return { ok: false, error: batchErr.message }
  if (!batches || batches.length === 0) return { ok: true, batches: [] }

  const manufacturerIds = Array.from(new Set(batches.map((b) => b.manufacturer_id)))
  const { data: manufacturers, error: mfrErr } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name')
    .in('id', manufacturerIds)
  if (mfrErr) return { ok: false, error: mfrErr.message }
  const nameById = new Map((manufacturers ?? []).map((m) => [m.id as string, m.name as string]))

  const batchIds = batches.map((b) => b.id)
  const { data: items, error: itemsErr } = await supabase
    .from('publish_batch_items')
    .select('publish_batch_id, change_type, status')
    .in('publish_batch_id', batchIds)
  if (itemsErr) return { ok: false, error: itemsErr.message }

  const result: PendingBatch[] = batches.map((b) => {
    const ownItems = (items ?? []).filter((i) => i.publish_batch_id === b.id)
    return {
      id: b.id,
      manufacturer_id: b.manufacturer_id,
      manufacturer_name: nameById.get(b.manufacturer_id) ?? 'Unknown manufacturer',
      status: b.status,
      notes: b.notes,
      created_at: b.created_at,
      new_count: ownItems.filter((i) => i.change_type === 'new' && i.status !== 'migrated_to_production').length,
      update_count: ownItems.filter((i) => i.change_type === 'update' && i.status !== 'migrated_to_production').length,
      failed_count: ownItems.filter((i) => i.status === 'failed').length,
    }
  })

  return { ok: true, batches: result }
}

// ─── previewPublishBatch / runPublishBatch ──────────────────────────────────

export async function previewPublishBatch(batchId: string): Promise<PublishBatchResult> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }
  return publishBatch(batchId, { dryRun: true })
}

export async function runPublishBatch(batchId: string): Promise<PublishBatchResult> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }
  return publishBatch(batchId, { dryRun: false })
}
