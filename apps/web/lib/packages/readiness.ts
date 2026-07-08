// Package readiness checks — pure logic, no Supabase reads.
//
// A card can only ship in a static website package when it is Manufacturer
// Verified AND BuildQuote Approved (production_system_id set), its data is
// complete, its images come from the asset library (so the generator can copy
// them into the package as local files), and its guide links are public
// manufacturer URLs (never Studio-only / draft storage links).
//
// Blocker strings are shown verbatim in the Packages UI — keep them
// action-oriented ("Import the hero image…") rather than diagnostic.

import type { VerificationSystem, ManufacturerInfo } from '@/lib/studio-manufacturer/workspace'

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'card'
}

/** Prefer the stored slug; fall back to a slugified name. */
export function resolveCardSlug(card: { slug?: string | null; name: string }): string {
  return (card.slug && card.slug.trim()) || slugifyName(card.name)
}

// Studio-internal / draft storage hosts that must never appear as public
// guide links in a generated package.
const DRAFT_URL_PATTERN = /supabase\.co|r2\.cloudflarestorage\.com|r2\.dev|localhost|127\.0\.0\.1|vercel\.app/i

export function isPublicGuideUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  return !DRAFT_URL_PATTERN.test(url)
}

export type CardReadinessStatus =
  | 'ready'                 // Ready to package
  | 'needs_approval'        // Needs manufacturer verification / BuildQuote approval
  | 'needs_asset_import'    // Image relies on an external URL, not a library asset
  | 'needs_guide_url'       // Guide link is missing/draft/not a public URL
  | 'missing_data'          // Required card data absent

export const CARD_READINESS_LABELS: Record<CardReadinessStatus, string> = {
  ready: 'Ready to package',
  needs_approval: 'Needs BuildQuote approval',
  needs_asset_import: 'Needs asset import',
  needs_guide_url: 'Needs guide URL',
  missing_data: 'Missing required data',
}

export type CardReadiness = {
  cardId: string
  name: string
  slug: string
  status: CardReadinessStatus
  blockers: string[]
  warnings: string[]
}

export type ManufacturerReadiness = {
  blockers: string[]
  warnings: string[]
}

export type PackageReadiness = {
  manufacturer: ManufacturerReadiness
  cards: CardReadiness[]
  readyCount: number
  blockedCount: number
  /** True when at least one card is ready and no manufacturer-level blocker exists. */
  canGenerate: boolean
}

export type CardAssetInfo = {
  /** staged_systems.hero_image_asset_id (null when unset or column missing). */
  heroImageAssetId: string | null
  /** Whether that asset exists, is not archived, and is approved for publication. */
  heroAssetReady: boolean
}

export function evaluateCardReadiness(
  card: VerificationSystem & { slug?: string | null },
  assetInfo: CardAssetInfo | undefined,
): CardReadiness {
  const blockers: string[] = []
  const warnings: string[] = []
  // Severity order (worst wins): missing_data > needs_approval > needs_asset_import > needs_guide_url
  let status: CardReadinessStatus = 'ready'
  const setStatus = (s: CardReadinessStatus) => {
    const rank: Record<CardReadinessStatus, number> = {
      ready: 0, needs_guide_url: 1, needs_asset_import: 2, needs_approval: 3, missing_data: 4,
    }
    if (rank[s] > rank[status]) status = s
  }

  // ── Required data ──
  if (!card.name?.trim()) {
    blockers.push('Card has no title.')
    setStatus('missing_data')
  }
  if (!card.category?.trim()) {
    blockers.push('Card has no category / application.')
    setStatus('missing_data')
  }
  if (card.profiles.length === 0 && card.components.length === 0) {
    blockers.push('Card has no selectable line items (no profiles or components).')
    setStatus('missing_data')
  }

  // ── Approval flow ──
  if (card.verification_status !== 'manufacturer_verified') {
    blockers.push('Card is not Manufacturer Verified yet — verify it in Verify Systems.')
    setStatus('needs_approval')
  }
  if (!card.production_system_id) {
    blockers.push('Card is not BuildQuote Approved yet — submit it for approval.')
    setStatus('needs_approval')
  }

  // ── Images ──
  // A URL-only hero blocks packaging (not just a warning): the package
  // generator's only recourse for a URL with no linked asset is a
  // best-effort live fetch at generation time (see resolveImageFile in
  // package-actions.ts) — no guarantee it succeeds, it's re-fetched fresh
  // (and unoptimized) on every single build, and a failure ships the card
  // with no hero image at all with nothing but a build-log line to show for
  // it. Requiring an Asset Library link makes the result deterministic.
  if (assetInfo?.heroImageAssetId) {
    if (!assetInfo.heroAssetReady) {
      blockers.push('The linked hero image asset is archived or not approved for publication.')
      setStatus('needs_asset_import')
    }
  } else if (card.hero_image_url) {
    blockers.push('Hero image is a URL only — import it into Assets (or upload it directly) so the package can bundle a reliable, optimized local copy.')
    setStatus('needs_asset_import')
  } else {
    warnings.push('No hero image set (card will render without one).')
  }

  // ── Guide links ──
  const guides: { label: string; url: string }[] = [
    ...(card.install_guide_urls ?? []),
    ...(card.design_guide_url ? [{ label: 'Design guide', url: card.design_guide_url }] : []),
    ...(card.tech_data_url ? [{ label: 'Technical data', url: card.tech_data_url }] : []),
  ]
  for (const guide of guides) {
    if (!isPublicGuideUrl(guide.url)) {
      blockers.push(
        `Guide link "${guide.label || 'guide'}" is not a public manufacturer URL — packages never publish Studio/draft links.`,
      )
      setStatus('needs_guide_url')
    }
  }
  if (guides.length === 0) {
    warnings.push('No install/design guide links — cards link back to your official documents when provided.')
  }

  return {
    cardId: card.id,
    name: card.name,
    slug: resolveCardSlug(card),
    status,
    blockers,
    warnings,
  }
}

export function evaluateManufacturerReadiness(
  manufacturer: ManufacturerInfo,
  opts: { hasLogoAsset: boolean },
): ManufacturerReadiness {
  const blockers: string[] = []
  const warnings: string[] = []

  if (!manufacturer.name?.trim()) blockers.push('Manufacturer name is missing.')
  if (!manufacturer.slug?.trim()) blockers.push('Manufacturer slug is missing.')
  if (!manufacturer.description?.trim()) {
    warnings.push('No brand description — the collection page will have no intro text.')
  }
  if (!manufacturer.websiteUrl?.trim()) {
    blockers.push('No website URL set — QR codes and card links need your public website address.')
  }
  if (!opts.hasLogoAsset) {
    warnings.push('No logo in the asset library — the package will fall back to your brand name as text.')
  }

  return { blockers, warnings }
}

export function summarisePackageReadiness(
  manufacturer: ManufacturerReadiness,
  cards: CardReadiness[],
): PackageReadiness {
  const readyCount = cards.filter((c) => c.status === 'ready').length
  return {
    manufacturer,
    cards,
    readyCount,
    blockedCount: cards.length - readyCount,
    canGenerate: readyCount > 0 && manufacturer.blockers.length === 0,
  }
}
