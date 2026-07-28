'use server'

// Package generation + download server actions.
//
// generateCardPackage() is the whole pipeline: readiness gate → resolve card
// data (BuildQuote Approved staged rows via adaptStagedSystem) → download
// asset bytes from R2 (or best-effort from external URLs) → buildPackageZip()
// → upload the ZIP to R2 → record card_packages / card_package_items.
//
// The ZIP itself is assembled by lib/packages/generator.ts (pure, fixture-
// tested); this file owns everything that touches Supabase and R2.

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { getObjectFromR2, uploadObjectToR2, createPresignedDownloadUrl } from '@/lib/r2'
import { getManufacturerVerificationData } from './workspace'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import {
  evaluateCardReadiness,
  evaluateManufacturerReadiness,
  type CardAssetInfo,
} from '@/lib/packages/readiness'
import { buildPackageZip, type PackageCardInput, type PackageFile } from '@/lib/packages/generator'
import { getManufacturerStockists, stockistsForCard } from '@/lib/data/getCardStockists'
import { SYSTEM_CARD_BUNDLE_JS } from '@/lib/packages/generated/system-card-bundle'
import { assertManufacturerAccess } from './access'
import {
  isMissingSchemaError,
  makeStudioClient,
} from '@/lib/supabase/helpers'

// ─── Image resolution helpers ─────────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

type AssetRow = {
  id: string
  storage_key: string | null
  mime_type: string | null
  archived: boolean
  approved_for_publication: boolean
}

// Pull one image into the package: prefer the asset library (R2 bytes), fall
// back to fetching an external URL so the final package never depends on
// remote images. Returns null (with a log line) when neither works.
async function resolveImageFile(opts: {
  baseName: string           // "hero", "logo", "brand-hero"
  asset: AssetRow | null
  externalUrl: string | null
  log: string[]
  label: string
}): Promise<PackageFile | null> {
  const { asset, externalUrl, log, label } = opts

  if (asset?.storage_key) {
    const obj = await getObjectFromR2(asset.storage_key)
    if (obj.ok) {
      const ext = MIME_EXT[asset.mime_type ?? ''] ?? MIME_EXT[obj.contentType ?? ''] ?? 'img'
      return { fileName: `${opts.baseName}.${ext}`, bytes: obj.bytes }
    }
    log.push(`WARN: ${label} — could not read asset from storage (${obj.error}).`)
  }

  if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
    try {
      const res = await fetch(externalUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'BuildQuote-DataStudio/1.0 (package generator)' },
      })
      if (res.ok) {
        const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim()
        const ext = MIME_EXT[contentType]
        if (ext) {
          const bytes = new Uint8Array(await res.arrayBuffer())
          if (bytes.byteLength > 0) {
            log.push(`Note: ${label} — fetched from external URL (import it into Assets for a stable copy).`)
            return { fileName: `${opts.baseName}.${ext}`, bytes }
          }
        } else {
          log.push(`WARN: ${label} — external URL is not an image (${contentType || 'unknown type'}).`)
        }
      } else {
        log.push(`WARN: ${label} — external URL returned ${res.status}.`)
      }
    } catch (err) {
      log.push(`WARN: ${label} — external URL fetch failed (${err instanceof Error ? err.message : String(err)}).`)
    }
  }

  return null
}

// ─── generateCardPackage ──────────────────────────────────────────────────────

export type GeneratePackageResult =
  | { ok: true; packageId: string; packageVersion: number; cardCount: number; buildLog: string[] }
  | { ok: false; error: string }

export async function generateCardPackage(
  manufacturerId: string,
): Promise<GeneratePackageResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  // ── Load card + brand data ──
  const verification = await getManufacturerVerificationData(manufacturerId)
  if (!verification.ok) return { ok: false, error: verification.error }

  const [brandResult, heroLinksResult] = await Promise.all([
    supabase
      .from('data_studio_manufacturers')
      .select('description, website_url, logo_url, hero_image_url, hero_wide_image_url, hero_image_position_y, logo_asset_id, hero_image_asset_id, hero_wide_image_asset_id')
      .eq('id', manufacturerId)
      .single(),
    supabase
      .from('staged_systems')
      .select('id, hero_image_asset_id')
      .eq('manufacturer_id', manufacturerId),
  ])

  type BrandRow = {
    description: string | null; website_url: string | null
    logo_url: string | null; hero_image_url: string | null
    hero_wide_image_url: string | null; hero_image_position_y: number | null
    logo_asset_id: string | null; hero_image_asset_id: string | null
    hero_wide_image_asset_id: string | null
  }
  let brand: BrandRow
  if (!brandResult.error && brandResult.data) {
    brand = brandResult.data as unknown as BrandRow
  } else if (isMissingSchemaError(brandResult.error)) {
    // Migration 046 not applied — retry without asset-id columns.
    const { data: fallback, error: fbErr } = await supabase
      .from('data_studio_manufacturers')
      .select('description, website_url, logo_url, hero_image_url, hero_wide_image_url, hero_image_position_y')
      .eq('id', manufacturerId)
      .single()
    if (fbErr || !fallback) return { ok: false, error: 'Could not load brand profile.' }
    brand = {
      ...(fallback as unknown as Omit<BrandRow, 'logo_asset_id' | 'hero_image_asset_id' | 'hero_wide_image_asset_id'>),
      logo_asset_id: null, hero_image_asset_id: null, hero_wide_image_asset_id: null,
    }
  } else {
    return { ok: false, error: `Could not load brand profile: ${brandResult.error?.message}` }
  }

  const cardHeroAssetIds = new Map<string, string | null>()
  if (!heroLinksResult.error && heroLinksResult.data) {
    for (const row of heroLinksResult.data as Array<{ id: string; hero_image_asset_id: string | null }>) {
      cardHeroAssetIds.set(row.id, row.hero_image_asset_id)
    }
  }

  // ── Fetch referenced asset rows in one go ──
  const wantedAssetIds = Array.from(new Set([
    brand.logo_asset_id,
    brand.hero_wide_image_asset_id,
    brand.hero_image_asset_id,
    ...Array.from(cardHeroAssetIds.values()),
  ].filter((id): id is string => !!id)))

  const assetRows = new Map<string, AssetRow>()
  let logoTypeAsset: AssetRow | null = null
  if (wantedAssetIds.length || true) {
    const { data, error } = await supabase
      .from('manufacturer_assets')
      .select('id, asset_type, storage_key, mime_type, archived, approved_for_publication')
      .eq('manufacturer_id', manufacturerId)
      .eq('archived', false)
    if (!error && data) {
      for (const row of data as Array<AssetRow & { asset_type: string }>) {
        assetRows.set(row.id, row)
        // Fallback logo: any approved logo-type asset when no slot is linked.
        if (!logoTypeAsset && row.asset_type === 'logo' && row.approved_for_publication) {
          logoTypeAsset = row
        }
      }
    }
  }

  // ── Readiness gate (same rules the Packages page shows) ──
  const readiness = verification.systems.map((s) => {
    const heroAssetId = cardHeroAssetIds.get(s.id) ?? null
    const heroAsset = heroAssetId ? assetRows.get(heroAssetId) ?? null : null
    const info: CardAssetInfo = {
      heroImageAssetId: heroAssetId,
      heroAssetReady: !!heroAsset && !heroAsset.archived && heroAsset.approved_for_publication,
    }
    return { system: s, readiness: evaluateCardReadiness(s, info) }
  })

  const manufacturerReadiness = evaluateManufacturerReadiness(verification.manufacturer, {
    hasLogoAsset: !!(brand.logo_asset_id ? assetRows.get(brand.logo_asset_id) : logoTypeAsset),
  })
  if (manufacturerReadiness.blockers.length > 0) {
    return { ok: false, error: `Brand profile blockers: ${manufacturerReadiness.blockers.join(' ')}` }
  }

  const readyCards = readiness.filter((r) => r.readiness.status === 'ready')
  if (readyCards.length === 0) {
    return { ok: false, error: 'No cards are Ready to Package yet — fix the blockers listed on this page first.' }
  }

  // ── Create the package record (also proves migration 047 is applied) ──
  const { data: versionRows } = await supabase
    .from('card_packages')
    .select('package_version')
    .eq('manufacturer_id', manufacturerId)
    .order('package_version', { ascending: false })
    .limit(1)
  const nextVersion = (((versionRows ?? [])[0] as { package_version: number } | undefined)?.package_version ?? 0) + 1

  const { data: pkgRow, error: pkgInsertError } = await supabase
    .from('card_packages')
    .insert({
      manufacturer_id: manufacturerId,
      package_version: nextVersion,
      status: 'generating',
      intended_install_path: '/system-cards/',
      generated_by: auth.userId,
    })
    .select('id')
    .single()

  if (pkgInsertError || !pkgRow) {
    if (isMissingSchemaError(pkgInsertError)) {
      return { ok: false, error: 'Package tables are not set up yet — apply migration 047 to this Supabase project first.' }
    }
    return { ok: false, error: `Could not create package record: ${pkgInsertError?.message}` }
  }
  const packageId = (pkgRow as { id: string }).id

  const failPackage = async (message: string): Promise<GeneratePackageResult> => {
    await supabase
      .from('card_packages')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', packageId)
    revalidatePath('/manufacturer/packages')
    return { ok: false, error: message }
  }

  try {
    const log: string[] = []

    // ── Resolve brand images ──
    const logoAsset = await resolveImageFile({
      baseName: 'logo',
      asset: (brand.logo_asset_id ? assetRows.get(brand.logo_asset_id) : logoTypeAsset) ?? null,
      externalUrl: brand.logo_url,
      log,
      label: 'Brand logo',
    })
    const brandHeroAsset = await resolveImageFile({
      baseName: 'brand-hero',
      asset:
        (brand.hero_wide_image_asset_id ? assetRows.get(brand.hero_wide_image_asset_id) : null) ??
        (brand.hero_image_asset_id ? assetRows.get(brand.hero_image_asset_id) : null) ??
        null,
      externalUrl: brand.hero_wide_image_url ?? brand.hero_image_url,
      log,
      label: 'Brand hero',
    })

    // ── Local stockists (048) — embedded at build time; degrades to none ──
    let stockistData: Awaited<ReturnType<typeof getManufacturerStockists>> = { rows: [], linkedCardIds: new Map() }
    try {
      stockistData = await getManufacturerStockists(supabase, manufacturerId)
    } catch (err) {
      log.push(`Note: stockists unavailable (${err instanceof Error ? err.message : 'error'}) — cards ship without embedded stockists.`)
    }

    // ── Resolve cards ──
    const cards: PackageCardInput[] = []
    for (const { system, readiness: cardReadiness } of readyCards) {
      const heroAssetId = cardHeroAssetIds.get(system.id) ?? null
      const heroAsset = await resolveImageFile({
        baseName: 'hero',
        asset: heroAssetId ? assetRows.get(heroAssetId) ?? null : null,
        externalUrl: system.hero_image_url,
        log,
        label: `${system.name} hero`,
      })
      cards.push({
        slug: cardReadiness.slug,
        system: adaptStagedSystem(system, verification.manufacturer),
        heroAsset,
        stockists: stockistsForCard(stockistData.rows, stockistData.linkedCardIds, system.id),
        // Footer: the manufacturer stands behind the data, dated to their
        // verification, versioned to this package.
        validation: {
          validated_by: verification.manufacturer.name,
          validated_at: system.verified_at,
          version: nextVersion,
        },
      })
    }

    // Guard against duplicate slugs (two cards with the same name and no stored slug).
    const seen = new Set<string>()
    for (const card of cards) {
      let slug = card.slug
      let n = 2
      while (seen.has(slug)) slug = `${card.slug}-${n++}`
      if (slug !== card.slug) log.push(`Note: duplicate slug "${card.slug}" — using "${slug}".`)
      card.slug = slug
      seen.add(slug)
    }

    // Stockist refresh endpoint — built from the FINAL slug (post-dedupe) so
    // the travelling card fetches the list for the right card.
    const studioOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'
    for (const card of cards) {
      card.stockistsUrl = `${studioOrigin}/api/cards/${encodeURIComponent(card.slug)}/stockists.json?m=${encodeURIComponent(verification.manufacturer.slug)}`
      // Share links + view beacon + doc-click tracking (050). All fail soft
      // in the wild, so wiring is safe even before the migration is applied.
      card.tracking = {
        apiBase: studioOrigin,
        manufacturerSlug: verification.manufacturer.slug,
        cardSlug: card.slug,
        version: nextVersion,
      }
    }

    // URL PERMANENCE: lock the resolved slug into staged_systems for any card
    // that doesn't have one stored yet. Without this, a card's URL derives
    // from its NAME, and a later rename would silently move every QR code,
    // share link and backlink. First publish makes the slug permanent.
    for (let i = 0; i < cards.length; i++) {
      const { system } = readyCards[i]
      if (!system.slug?.trim()) {
        const { error: slugError } = await supabase
          .from('staged_systems')
          .update({ slug: cards[i].slug, updated_at: new Date().toISOString() })
          .eq('id', system.id)
          .or('slug.is.null,slug.eq.')
        if (slugError) log.push(`Note: could not persist slug "${cards[i].slug}" for ${system.name}: ${slugError.message}`)
        else log.push(`Locked permanent slug "${cards[i].slug}" for ${system.name}.`)
      }
    }

    // Sourced-card containers (Step 5/6): freeze per-card full-text = structured
    // fields + linked-source text. Built BEFORE the ZIP so content.md ships
    // inside the package, and reused for the card_versions snapshot below. Fails
    // soft to an empty map so publishing is never blocked.
    let containers = new Map<string, import('@/lib/packages/card-container').CardContainer>()
    try {
      const { buildCardContainers } = await import('@/lib/packages/card-container')
      containers = await buildCardContainers(
        supabase,
        cards.map((c, i) => ({ cardId: readyCards[i].system.id, system: c.system })),
      )
      for (let i = 0; i < cards.length; i++) {
        cards[i].containerMd = containers.get(readyCards[i].system.id)?.content_md ?? null
      }
    } catch {
      containers = new Map()
    }

    // ── Build the ZIP ──
    const generatedAtIso = new Date().toISOString()
    const result = await buildPackageZip({
      manufacturer: {
        name: verification.manufacturer.name,
        slug: verification.manufacturer.slug,
        description: brand.description ?? verification.manufacturer.description,
        website_url: brand.website_url ?? verification.manufacturer.websiteUrl,
        logo_url: null,       // generator swaps in local paths
        hero_image_url: null,
        hero_image_position_y: brand.hero_image_position_y,
      },
      cards,
      logoAsset,
      brandHeroAsset,
      bundleJs: SYSTEM_CARD_BUNDLE_JS,
      websiteBaseUrl: brand.website_url ?? verification.manufacturer.websiteUrl,
      installPath: '/system-cards/',
      packageVersion: nextVersion,
      generatedAtIso,
    })

    const fullLog = [...log, ...result.buildLog]

    // ── Upload the ZIP to R2 ──
    const zipStorageKey = `card-packages/${manufacturerId}/v${nextVersion}-${randomUUID()}.zip`
    const upload = await uploadObjectToR2({
      storageKey: zipStorageKey,
      body: result.zip,
      contentType: 'application/zip',
    })
    if (!upload.ok) return await failPackage(`ZIP upload failed: ${upload.error}`)

    const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL
    const zipUrl = publicUrlBase
      ? `${publicUrlBase.replace(/\/$/, '')}/${zipStorageKey}`
      : null

    // ── Finalise records ──
    const { error: updateError } = await supabase
      .from('card_packages')
      .update({
        status: 'generated',
        generated_at: generatedAtIso,
        zip_storage_key: zipStorageKey,
        zip_url: zipUrl,
        checksum: result.checksum,
        file_size_bytes: result.zip.length,
        card_count: cards.length,
        build_log: fullLog.join('\n'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', packageId)
    if (updateError) return await failPackage(`Could not finalise package record: ${updateError.message}`)

    // result.items preserves the order of `cards`, which was built from readyCards.
    const itemRows = result.items.map((item, i) => ({
      package_id: packageId,
      card_id: readyCards[i].system.id,
      package_slug: item.slug,
      generated_card_path: item.cardPath,
      generated_json_path: item.jsonPath,
      qr_code_path: item.qrPath,
      status: 'included',
    }))
    const { error: itemsError } = await supabase.from('card_package_items').insert(itemRows)
    if (itemsError) {
      // Items are bookkeeping — the package itself is fine. Log, don't fail.
      await supabase
        .from('card_packages')
        .update({ build_log: `${fullLog.join('\n')}\nWARN: card_package_items insert failed: ${itemsError.message}` })
        .eq('id', packageId)
    }

    // Immutable version history (049): one snapshot per card per package
    // version — the record behind versioned card URLs, the validation footer
    // and the audit/certificate exports. Insert-only; degrades to a log note
    // when the migration isn't applied.
    const versionRows = result.items.map((item, i) => {
      const { system } = readyCards[i]
      const card = cards[i]
      const container = containers.get(system.id)
      return {
        manufacturer_id: manufacturerId,
        card_id: system.id,
        package_id: packageId,
        version: nextVersion,
        slug: item.slug,
        name: system.name,
        card_json: card.system,          // original asset URLs, not localised
        stockists_json: card.stockists ?? [],
        validated_by: system.reviewer_notes,
        validated_at: system.verified_at,
        content_md: container?.content_md ?? null,
        content_hash: container?.content_hash ?? null,
        sources_json: container?.sources_json ?? null,
      }
    })
    const { error: versionsError } = await supabase.from('card_versions').insert(versionRows)
    if (versionsError) {
      // Pre-051 environments lack the container columns — retry without them so
      // the version snapshot itself still lands.
      if (isMissingSchemaError(versionsError)) {
        const legacyRows = versionRows.map(({ content_md, content_hash, sources_json, ...rest }) => rest)
        const { error: legacyErr } = await supabase.from('card_versions').insert(legacyRows)
        if (legacyErr) {
          await supabase
            .from('card_packages')
            .update({ build_log: `${fullLog.join('\n')}\nNote: card_versions snapshot skipped (${legacyErr.message})` })
            .eq('id', packageId)
        }
      } else {
        await supabase
          .from('card_packages')
          .update({ build_log: `${fullLog.join('\n')}\nNote: card_versions snapshot skipped (${versionsError.message})` })
          .eq('id', packageId)
      }
    }

    // Enqueue embedding jobs (Step 7) for cards that produced container content.
    // The worker no-ops when VOYAGE_API_KEY is unset and is idempotent by
    // content_hash, so enqueuing on every publish is safe. Best-effort.
    try {
      const embedJobs = readyCards
        .filter((rc) => containers.get(rc.system.id)?.content_md)
        .map((rc) => ({
          manufacturer_id: manufacturerId,
          job_type: 'embed',
          status: 'pending',
          payload: { card_id: rc.system.id, version: nextVersion, manufacturer_id: manufacturerId },
        }))
      if (embedJobs.length) await supabase.from('pipeline_jobs').insert(embedJobs)
    } catch {
      /* embeddings are best-effort — never block publish */
    }

    // Supersede older generated-but-never-downloaded packages.
    await supabase
      .from('card_packages')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('manufacturer_id', manufacturerId)
      .eq('status', 'generated')
      .neq('id', packageId)

    revalidatePath('/manufacturer/packages')
    return { ok: true, packageId, packageVersion: nextVersion, cardCount: cards.length, buildLog: fullLog }
  } catch (err) {
    return await failPackage(`Package generation failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─── downloadPackageZip ───────────────────────────────────────────────────────

export type DownloadPackageResult =
  | { ok: true; downloadUrl: string }
  | { ok: false; error: string }

export async function downloadPackageZip(
  packageId: string,
  manufacturerId: string,
): Promise<DownloadPackageResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  const { data, error } = await supabase
    .from('card_packages')
    .select('zip_storage_key, status')
    .eq('id', packageId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (error || !data) return { ok: false, error: 'Package not found.' }
  const row = data as { zip_storage_key: string | null; status: string }
  if (!row.zip_storage_key) return { ok: false, error: 'This package has no stored ZIP (generation may have failed).' }

  const presigned = await createPresignedDownloadUrl({
    storageKey: row.zip_storage_key,
    expiresInSeconds: 900,
  })
  if (!presigned.ok) return { ok: false, error: presigned.error }

  // "Exported / Delivered" — record the handover.
  if (row.status === 'generated') {
    await supabase
      .from('card_packages')
      .update({ status: 'downloaded', downloaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', packageId)
    revalidatePath('/manufacturer/packages')
  }

  return { ok: true, downloadUrl: presigned.downloadUrl }
}
