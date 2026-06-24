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

export type BatchSystem = {
  id: string
  name: string
  category: string | null
  hero_image_url: string | null
  change_type: string
  item_status: string
}

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
  systems: BatchSystem[]
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
    .select('publish_batch_id, entity_id, change_type, status')
    .in('publish_batch_id', batchIds)
  if (itemsErr) return { ok: false, error: itemsErr.message }

  // Fetch staged system details for rich display
  const systemIds = Array.from(new Set((items ?? []).map((i) => i.entity_id).filter(Boolean)))
  const { data: stagedSystems } = await supabase
    .from('staged_systems')
    .select('id, name, category, hero_image_url')
    .in('id', systemIds)
  const sysById = new Map((stagedSystems ?? []).map((s) => [s.id as string, s as { id: string; name: string; category: string | null; hero_image_url: string | null }]))

  const result: PendingBatch[] = batches.map((b) => {
    const ownItems = (items ?? []).filter((i) => i.publish_batch_id === b.id)
    const pendingItems = ownItems.filter((i) => i.status !== 'migrated_to_production')
    return {
      id: b.id,
      manufacturer_id: b.manufacturer_id,
      manufacturer_name: nameById.get(b.manufacturer_id) ?? 'Unknown manufacturer',
      status: b.status,
      notes: b.notes,
      created_at: b.created_at,
      new_count: pendingItems.filter((i) => i.change_type === 'new').length,
      update_count: pendingItems.filter((i) => i.change_type === 'update').length,
      failed_count: ownItems.filter((i) => i.status === 'failed').length,
      systems: pendingItems.map((i) => {
        const sys = sysById.get(i.entity_id)
        return {
          id: i.entity_id,
          name: sys?.name ?? 'Unknown system',
          category: sys?.category ?? null,
          hero_image_url: sys?.hero_image_url ?? null,
          change_type: i.change_type,
          item_status: i.status,
        }
      }),
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
