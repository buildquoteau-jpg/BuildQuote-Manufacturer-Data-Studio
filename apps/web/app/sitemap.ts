// Sitemap of all canonical hosted card URLs (/cards/<mfr>/<slug>).
// Versioned URLs are deliberately excluded — old versions are noindex.
// Degrades to an empty sitemap when card_versions (049) isn't applied or
// env is missing.

import type { MetadataRoute } from 'next'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createStudioServiceClient()

    const { data: versions, error } = await supabase
      .from('card_versions')
      .select('manufacturer_id, slug, created_at')
      .order('created_at', { ascending: false })
    if (error || !versions || versions.length === 0) return []

    const { data: manufacturers } = await supabase
      .from('data_studio_manufacturers')
      .select('id, slug')
    const mfrSlugById = new Map(
      ((manufacturers ?? []) as { id: string; slug: string }[]).map((m) => [m.id, m.slug]),
    )

    // One entry per canonical card URL, dated to its newest version.
    const seen = new Set<string>()
    const entries: MetadataRoute.Sitemap = []
    for (const v of versions as { manufacturer_id: string; slug: string; created_at: string }[]) {
      const mfrSlug = mfrSlugById.get(v.manufacturer_id)
      if (!mfrSlug) continue
      const url = `${ORIGIN}/cards/${mfrSlug}/${v.slug}`
      if (seen.has(url)) continue
      seen.add(url)
      entries.push({ url, lastModified: new Date(v.created_at) })
    }
    return entries
  } catch {
    return []
  }
}
