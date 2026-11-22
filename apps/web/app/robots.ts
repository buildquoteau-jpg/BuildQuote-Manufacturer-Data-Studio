import type { MetadataRoute } from 'next'

// Block all search-engine crawling while Data Studio is in private draft.
// Flip ALLOW_INDEXING=true in Vercel env when ready for public indexing.
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING === 'true') {
    return {
      rules: { userAgent: '*', allow: '/' },
    }
  }
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
