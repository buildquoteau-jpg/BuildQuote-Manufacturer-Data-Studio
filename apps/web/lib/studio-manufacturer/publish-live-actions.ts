'use server'

// Hybrid publishing (Library V7): manufacturer-triggered instant publish.
//
// publishCardLive() takes one staged card and makes it live on
// buildquote.com.au/library in a single action: build the snapshot
// (lib/publishing/buildCardSnapshot) → record staging history
// (card_versions) → write the production published_cards row via the
// publish_card RPC → ping v6's revalidate endpoint so the ISR pages
// re-render immediately.
//
// This deliberately bypasses the admin approval queue (publish_batches) —
// gated by LIVE_PUBLISH_BYPASS_APPROVAL so the approval channel can be
// re-imposed later by flipping the env var. The ZIP packager and the admin
// publish job are untouched and still callable.
//
// Source Traceability Rule: the admin channel blocks cards without a linked
// source document; here we warn-but-allow and log the event (product call,
// 2026-07-10). Publish events go to card_publish_events — card_events is the
// separate share/view analytics table from migration 050.

import { revalidatePath } from 'next/cache'
import { createStudioServerClient } from '@/lib/supabase/server'
import { createProductionServiceClient } from '@/lib/supabase/production'
import { getStudioSession } from '@/lib/studio-auth/session'
import { buildCardSnapshot } from '@/lib/publishing/buildCardSnapshot'

const V6_ORIGIN = process.env.BUILDQUOTE_PUBLIC_ORIGIN || 'https://buildquote.com.au'

export type PublishCardLiveResult =
  | { ok: true; liveUrl: string; version: string; warnings: string[] }
  | { ok: false; error: string }

async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string; label: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }
  const label = session.profile.fullName || session.profile.email || 'unknown'
  if (session.globalRole === 'buildquote_admin') return { allowed: true, userId: session.user!.id, label }
  if (session.globalRole !== 'manufacturer_user') return { allowed: false, error: 'Access denied.' }
  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) return { allowed: false, error: 'Not a member of this workspace.' }
  return { allowed: true, userId: session.user!.id, label }
}

// '1.0' → '1.1'; anything unparseable restarts at '1.0'.
function bumpMinor(version: string | null): string {
  const m = /^(\d+)\.(\d+)$/.exec(version ?? '')
  if (!m) return '1.0'
  return `${m[1]}.${Number(m[2]) + 1}`
}

export async function publishCardLive(stagedSystemId: string): Promise<PublishCardLiveResult> {
  if (process.env.LIVE_PUBLISH_BYPASS_APPROVAL !== 'true') {
    return { ok: false, error: 'Live publishing is not enabled — submit for publication instead.' }
  }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  // ── Build the snapshot ──
  const built = await buildCardSnapshot(supabase, stagedSystemId)
  if (!built.ok) return built
  const snap = built.snapshot
  const warnings = [...snap.warnings]

  const auth = await assertManufacturerAccess(snap.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  if (!snap.title || snap.title === 'New system') {
    return { ok: false, error: 'Give the card a real name before publishing.' }
  }

  // ── Source Traceability Rule: warn but allow ──
  if (!snap.stagedSystem.source_document_id) {
    warnings.push('No source document is linked — the published card has no traceability record.')
  }

  // ── URL permanence: lock the slug on first publish ──
  if (!snap.stagedSystem.slug?.trim()) {
    const { error: slugErr } = await supabase
      .from('staged_systems')
      .update({ slug: snap.slug, updated_at: new Date().toISOString() })
      .eq('id', stagedSystemId)
      .or('slug.is.null,slug.eq.')
    // Publishing under a slug the staged row doesn't record breaks URL
    // permanence: the next publish would generate a different one.
    if (slugErr) {
      return { ok: false, error: `Could not lock the card URL (${slugErr.message}) — nothing was published.` }
    }
  }

  // ── Auto-approve referenced gallery/hero assets (they are now public) ──
  const referencedAssetIds = [
    snap.stagedSystem.hero_image_asset_id,
    ...(snap.stagedSystem.gallery_images ?? []).map((g) => g.asset_id),
  ].filter((id): id is string => !!id)
  if (referencedAssetIds.length) {
    const { error: approveErr } = await supabase
      .from('manufacturer_assets')
      .update({ approved_for_publication: true, updated_at: new Date().toISOString() })
      .in('id', referencedAssetIds)
      .eq('manufacturer_id', snap.manufacturerId)
    if (approveErr) warnings.push(`Gallery images were not marked approved (${approveErr.message}).`)
  }

  let production: ReturnType<typeof createProductionServiceClient>
  try {
    production = createProductionServiceClient()
  } catch (err) {
    return { ok: false, error: `Production database not configured: ${err instanceof Error ? err.message : String(err)}` }
  }

  // ── Version numbers: text 'major.minor' on production, integer history in
  // staging card_versions ──
  const { data: latestRows, error: latestErr } = await production
    .from('published_cards')
    .select('version, slug, card_id')
    .eq('is_latest', true)
    .or(`card_id.eq.${stagedSystemId},and(mfr_slug.eq.${snap.mfrSlug},slug.eq.${snap.slug})`)
  if (latestErr) {
    return { ok: false, error: `Could not read published versions: ${latestErr.message}` }
  }
  const conflicting = (latestRows ?? []).find((r) => (r as { card_id: string }).card_id !== stagedSystemId)
  if (conflicting) {
    return { ok: false, error: `The URL /library/${snap.mfrSlug}/${snap.slug} is already used by another published card.` }
  }
  const previous = (latestRows ?? [])[0] as { version: string } | undefined
  const nextVersion = previous ? bumpMinor(previous.version) : '1.0'

  const { data: cvRows, error: cvReadErr } = await supabase
    .from('card_versions')
    .select('version')
    .eq('card_id', stagedSystemId)
    .order('version', { ascending: false })
    .limit(1)
  // Numbering a snapshot off an unread history would silently collide with an
  // existing version, so stop before writing anything to production.
  if (cvReadErr) {
    return { ok: false, error: `Could not read the card's version history: ${cvReadErr.message}` }
  }
  const nextCvVersion = (((cvRows ?? [])[0] as { version: number } | undefined)?.version ?? 0) + 1

  // ── Staging history (card_versions) — insert-only, fails soft ──
  const { error: cvErr } = await supabase.from('card_versions').insert({
    manufacturer_id: snap.manufacturerId,
    card_id: stagedSystemId,
    package_id: null,
    version: nextCvVersion,
    slug: snap.slug,
    name: snap.title,
    card_json: snap.system,
    stockists_json: snap.stockists,
    validated_by: snap.manufacturer.name,
    validated_at: snap.stagedSystem.verified_at,
    content_md: snap.container?.content_md ?? null,
    content_hash: snap.container?.content_hash ?? null,
    sources_json: snap.container?.sources_json ?? null,
  })
  if (cvErr) warnings.push(`Version history not recorded (${cvErr.message}).`)

  // ── Production snapshot via the atomic publish_card RPC ──
  const { error: rpcErr } = await production.rpc('publish_card', {
    payload: {
      card_id: stagedSystemId,
      version: nextVersion,
      mfr_slug: snap.mfrSlug,
      slug: snap.slug,
      title: snap.title,
      mfr_name: snap.manufacturer.name,
      cover_url: snap.coverUrl,
      og_image_url: snap.ogImageUrl,
      summary_json: snap.summary,
      card_json: snap.system,
      stockists_json: snap.stockists,
      production_system_id: snap.stagedSystem.production_system_id,
      content_md: snap.container?.content_md ?? null,
      content_hash: snap.container?.content_hash ?? `v${nextCvVersion}-${stagedSystemId}`,
      sources_json: snap.container?.sources_json ?? null,
      published_by: auth.label,
    },
  })
  if (rpcErr) {
    return { ok: false, error: `Publish failed: ${rpcErr.message}` }
  }

  // ── Tell v6 to re-render the ISR pages now (non-fatal; ISR TTL backstop) ──
  try {
    const res = await fetch(`${V6_ORIGIN}/api/revalidate-card`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': process.env.REVALIDATE_SECRET ?? '',
      },
      body: JSON.stringify({ mfrSlug: snap.mfrSlug, slug: snap.slug }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) warnings.push(`Live page refresh returned ${res.status} — the card may take up to an hour to update.`)
  } catch (err) {
    warnings.push(`Live page refresh failed (${err instanceof Error ? err.message : 'network error'}) — the card may take up to an hour to update.`)
  }

  // ── Bookkeeping: publish state + analytics event (both fail soft) ──
  const nowIso = new Date().toISOString()
  const { error: stateErr } = await supabase
    .from('staged_systems')
    .update({
      publish_status: 'published',
      published_version: nextVersion,
      last_published_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', stagedSystemId)
  if (stateErr) warnings.push(`Publish state not saved (${stateErr.message}).`)

  const { error: eventErr } = await supabase.from('card_publish_events').insert({
    card_id: stagedSystemId,
    event_type: 'publish',
    meta: {
      version: nextVersion,
      published_by: auth.label,
      missing_source_document: !snap.stagedSystem.source_document_id,
      warnings,
    },
  })
  if (eventErr) warnings.push(`Publish event not logged (${eventErr.message}).`)

  revalidatePath('/manufacturer/review')
  revalidatePath('/manufacturer/cms')

  return {
    ok: true,
    liveUrl: `${V6_ORIGIN}/library/${snap.mfrSlug}/${snap.slug}`,
    version: nextVersion,
    warnings,
  }
}
