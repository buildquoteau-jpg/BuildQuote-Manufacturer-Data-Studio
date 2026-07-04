// Server-only read helpers for the manufacturer Packages page.
// Tables: card_packages / card_package_items (migration 047), plus readiness
// inputs from staged_systems and manufacturer_assets (046).
//
// Both migrations may not be applied to the live project yet — every reader
// here degrades gracefully (migrationMissing flags / empty asset info) so the
// page renders instead of crashing.

import { createStudioServerClient } from '@/lib/supabase/server'
import {
  getManufacturerVerificationData,
  type ManufacturerInfo,
  type VerificationSystem,
} from './workspace'
import {
  evaluateCardReadiness,
  evaluateManufacturerReadiness,
  summarisePackageReadiness,
  type CardAssetInfo,
  type PackageReadiness,
} from '@/lib/packages/readiness'

export type CardPackageRecord = {
  id: string
  packageVersion: number
  status: string
  intendedInstallPath: string
  cardCount: number
  fileSizeBytes: number | null
  checksum: string | null
  errorMessage: string | null
  generatedAt: string | null
  generatedByName: string | null
  downloadedAt: string | null
  createdAt: string
  hasZip: boolean
}

export type PackagesPageData = {
  manufacturer: ManufacturerInfo
  systems: VerificationSystem[]
  readiness: PackageReadiness
  packages: CardPackageRecord[]
  /** True when card_packages doesn't exist yet (047 not applied). */
  packagesMigrationMissing: boolean
  /** True when manufacturer_assets doesn't exist yet (046 not applied). */
  assetsMigrationMissing: boolean
}

export type PackagesPageResult =
  | { ok: true; data: PackagesPageData }
  | { ok: false; error: string }

function isMissingSchemaError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01' || err.code === '42703') return true
  return /does not exist/i.test(err.message ?? '')
}

export async function getPackagesPageData(
  manufacturerId: string,
): Promise<PackagesPageResult> {
  const verification = await getManufacturerVerificationData(manufacturerId)
  if (!verification.ok) return { ok: false, error: verification.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured — check env vars.' }
  }

  const systemIds = verification.systems.map((s) => s.id)

  const [assetInfoResult, logoResult, packagesResult] = await Promise.all([
    // Per-card hero asset link + its publication state (columns from 046).
    systemIds.length
      ? supabase
          .from('staged_systems')
          .select('id, hero_image_asset_id, manufacturer_assets(id, archived, approved_for_publication)')
          .in('id', systemIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('manufacturer_assets')
      .select('id', { count: 'exact', head: true })
      .eq('manufacturer_id', manufacturerId)
      .eq('asset_type', 'logo')
      .eq('archived', false),
    supabase
      .from('card_packages')
      .select('id, package_version, status, intended_install_path, card_count, file_size_bytes, checksum, error_message, generated_at, generated_by, downloaded_at, created_at, zip_storage_key')
      .eq('manufacturer_id', manufacturerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const assetsMigrationMissing =
    isMissingSchemaError(assetInfoResult.error) || isMissingSchemaError(logoResult.error)
  const packagesMigrationMissing = isMissingSchemaError(packagesResult.error)

  // ── Card asset info map ──
  const cardAssetInfo = new Map<string, CardAssetInfo>()
  if (!assetInfoResult.error && assetInfoResult.data) {
    type Row = {
      id: string
      hero_image_asset_id: string | null
      manufacturer_assets:
        | { id: string; archived: boolean; approved_for_publication: boolean }
        | { id: string; archived: boolean; approved_for_publication: boolean }[]
        | null
    }
    for (const row of assetInfoResult.data as unknown as Row[]) {
      const asset = Array.isArray(row.manufacturer_assets)
        ? row.manufacturer_assets[0] ?? null
        : row.manufacturer_assets
      cardAssetInfo.set(row.id, {
        heroImageAssetId: row.hero_image_asset_id,
        heroAssetReady: !!asset && !asset.archived && asset.approved_for_publication,
      })
    }
  }

  const hasLogoAsset = !logoResult.error && (logoResult.count ?? 0) > 0

  // ── Readiness ──
  const cardReadiness = verification.systems.map((s) =>
    evaluateCardReadiness(s, cardAssetInfo.get(s.id)),
  )
  const manufacturerReadiness = evaluateManufacturerReadiness(verification.manufacturer, {
    hasLogoAsset,
  })
  const readiness = summarisePackageReadiness(manufacturerReadiness, cardReadiness)

  // ── Package records ──
  let packages: CardPackageRecord[] = []
  if (!packagesResult.error && packagesResult.data) {
    type PkgRow = {
      id: string; package_version: number; status: string
      intended_install_path: string; card_count: number
      file_size_bytes: number | null; checksum: string | null
      error_message: string | null; generated_at: string | null
      generated_by: string | null; downloaded_at: string | null
      created_at: string; zip_storage_key: string | null
    }
    const rows = (packagesResult.data ?? []) as PkgRow[]

    const generatorIds = Array.from(
      new Set(rows.map((r) => r.generated_by).filter((id): id is string => !!id)),
    )
    const names = new Map<string, string>()
    if (generatorIds.length) {
      const { data: profileRows } = await supabase
        .from('data_studio_user_profiles')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', generatorIds)
      for (const p of (profileRows ?? []) as Array<{ auth_user_id: string; full_name: string | null; email: string }>) {
        names.set(p.auth_user_id, p.full_name ?? p.email)
      }
    }

    packages = rows.map((r) => ({
      id: r.id,
      packageVersion: r.package_version,
      status: r.status,
      intendedInstallPath: r.intended_install_path,
      cardCount: r.card_count,
      fileSizeBytes: r.file_size_bytes,
      checksum: r.checksum,
      errorMessage: r.error_message,
      generatedAt: r.generated_at,
      generatedByName: r.generated_by ? (names.get(r.generated_by) ?? null) : null,
      downloadedAt: r.downloaded_at,
      createdAt: r.created_at,
      hasZip: !!r.zip_storage_key,
    }))
  }

  return {
    ok: true,
    data: {
      manufacturer: verification.manufacturer,
      systems: verification.systems,
      readiness,
      packages,
      packagesMigrationMissing,
      assetsMigrationMissing,
    },
  }
}
