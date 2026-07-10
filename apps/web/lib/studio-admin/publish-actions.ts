'use server'

import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { createPresignedDownloadUrl } from '@/lib/r2'
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
    .select('id, name, category, hero_image_url, hero_image_asset_id')
    .in('id', systemIds)
  type StagedSystemRow = { id: string; name: string; category: string | null; hero_image_url: string | null; hero_image_asset_id: string | null }
  const stagedRows = (stagedSystems ?? []) as StagedSystemRow[]
  const sysById = new Map(stagedRows.map((s) => [s.id, s]))

  // Same as workspace.ts's getManufacturerVerificationData — hero_image_url
  // can be null/stale when the hero is actually linked to an Asset Library
  // upload, so resolve the asset's live URL for the thumbnail here too.
  const heroAssetIds = Array.from(new Set(
    stagedRows.map((s) => s.hero_image_asset_id).filter((id): id is string => !!id),
  ))
  const heroImageUrlByAssetId = new Map<string, string>()
  if (heroAssetIds.length > 0) {
    const { data: heroAssets } = await supabase
      .from('manufacturer_assets')
      .select('id, storage_key, public_url')
      .in('id', heroAssetIds)
    const assetRows = (heroAssets ?? []) as { id: string; storage_key: string | null; public_url: string | null }[]
    await Promise.all(assetRows.map(async (a) => {
      if (a.public_url) { heroImageUrlByAssetId.set(a.id, a.public_url); return }
      if (!a.storage_key) return
      const presigned = await createPresignedDownloadUrl({ storageKey: a.storage_key, expiresInSeconds: 3600 })
      if (presigned.ok) heroImageUrlByAssetId.set(a.id, presigned.downloadUrl)
    }))
  }

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
        const resolvedHeroUrl = sys?.hero_image_asset_id
          ? heroImageUrlByAssetId.get(sys.hero_image_asset_id)
          : undefined
        return {
          id: i.entity_id,
          name: sys?.name ?? 'Unknown system',
          category: sys?.category ?? null,
          hero_image_url: resolvedHeroUrl ?? sys?.hero_image_url ?? null,
          change_type: i.change_type,
          item_status: i.status,
        }
      }),
    }
  })

  return { ok: true, batches: result }
}

// ─── dismissPublishBatch ────────────────────────────────────────────────────
// Removes a batch from the queue by hard-deleting it (items first, then batch).
// Only applies to batches that have not been fully published.

export async function dismissPublishBatch(
  batchId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertBuildquoteStaff()
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServiceClient()

  const { error: itemsErr } = await supabase
    .from('publish_batch_items')
    .delete()
    .eq('publish_batch_id', batchId)
  if (itemsErr) return { ok: false, error: itemsErr.message }

  const { error: batchErr } = await supabase
    .from('publish_batches')
    .delete()
    .eq('id', batchId)
  if (batchErr) return { ok: false, error: batchErr.message }

  return { ok: true }
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
