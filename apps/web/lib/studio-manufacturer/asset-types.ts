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
