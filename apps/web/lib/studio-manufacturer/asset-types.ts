// Asset type vocabulary for the manufacturer asset library.
// Shared by server code (assets.ts, asset-actions.ts) and client components —
// keep this file free of server-only imports.

export const ASSET_TYPE_LABELS: Record<string, string> = {
  logo: 'Logo',
  brand_hero: 'Brand hero',
  banner: 'Full-width banner',
  card_hero: 'Card hero',
  profile: 'Profile image',
  product: 'Product image',
  thumbnail: 'Thumbnail',
  icon: 'Icon / other',
}

export const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS)

export function assetTypeLabel(type: string): string {
  return ASSET_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}

// asset_role (migration 065) — a second, independent axis from asset_type
// above: which slot in a *system's* workflow this image fills, once it's
// scoped to one via staged_system_id. NULL role = a brand-level asset
// (logo, brand hero, banner), same as a NULL staged_system_id.
export const ASSET_ROLE_LABELS: Record<string, string> = {
  hero: 'Hero',
  gallery: 'Gallery photo',
  colour_swatch: 'Colour swatch',
  profile: 'Profile image',
  detail: 'Detail shot',
  diagram: 'Diagram',
  brand: 'Brand asset',
}

export const ASSET_ROLES = Object.keys(ASSET_ROLE_LABELS)
