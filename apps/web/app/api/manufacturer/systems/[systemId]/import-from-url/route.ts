// 1-Click "Import from Product Page URL" for manufacturer self-serve setup.
//
// Given an official product page URL (e.g.
// https://www.jameshardie.com.au/products/timbertech-vintage-collection), this route:
//   1. Fetches the HTML (inspecting __NEXT_DATA__ product subtrees FIRST while
//      excluding global header/nav/footer/menu chrome, then falling back to
//      cleaned main-content HTML)
//   2. Non-destructively adds the product page link to custom_document_links
//      (and sets website_url if blank)
//   3. Extracts product-specific gallery/hero photos (up to 10 total), filtering
//      out nav/promo banners, GIFs, SVGs, and icons
//   4. Extracts product colour/finish swatches (name + swatch image URL) and
//      inserts/updates them in staged_system_colours
//   5. Discovers linked PDF guides (install, design/care, technical data,
//      warranty/brochure), deduplicates against existing docs, and enqueues
//      fetch_url -> docling -> auto_chain on the cloud worker.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_GALLERY = 10
const MAX_PDFS = 8
const MAX_SWATCHES = 24

type SystemSourceRole = 'install_guide' | 'design_guide' | 'tech_data' | 'source_catalogue'
type ImportMode = 'full' | 'swatches_only' | 'photos_only' | 'item_images'

type ExtractedItemImage = {
  sku?: string
  label: string
  imageUrl: string
}

type GalleryPhoto = {
  asset_id?: string | null
  url: string
  alt: string
  position_x?: number | null
  position_y?: number | null
  zoom?: number | null
}

type CustomDocumentLink = {
  label: string
  url: string
  type?: 'product_page' | 'web_guide'
}

type ExtractedSwatch = {
  name: string
  imageUrl: string
}

const SKIP_JSON_KEYS = new Set([
  'menu',
  'menus',
  'header',
  'headers',
  'footer',
  'footers',
  'nav',
  'navbar',
  'navigation',
  'megamenu',
  'global',
  'globaldata',
  'globalconfig',
  'siteconfig',
  'cookiebanner',
  'relatedproducts',
  'otherproducts',
  'productitems',
  'recommendedproducts',
  'alsolike',
  'crosssell',
  'upsell',
  'timbertechdeckingsamplestaticdata',
  'timbertechdeckingsampleproductitems',
  'samplestaticdata',
  'sampleproductitems',
  'metadata',
])

const NON_COLOUR_PHRASE_RE =
  /^(?:low maintenance|easy to maintain|durability|exceptional durability|moisture|resistant|fire resistant|design versatility|cools quickly|realistic timber|warranty|\d+[- ]?year|download|install|installation|brochure|guide|faq|frequently asked|contact|order|sample|specification|specifications|accessories|resources|comparison|overview|features|benefits|why |how to|view |learn more|read more|see more|shop now|buy now|square|grooved|fascia|trim|clip|screw|fastener|subframe|joist|bearer)/i

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return false
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
}

function stripTagsAndClean(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/\u202f|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveUrl(raw: string, base: URL): string | null {
  try {
    let cleaned = decodeHtmlEntities(raw.trim())
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:') || cleaned.startsWith('mailto:')) {
      return null
    }
    // Unwrap Next.js /_next/image?url=... proxy URLs to the underlying durable asset URL
    if (cleaned.startsWith('/_next/image')) {
      const parsedNext = new URL(cleaned, base)
      const inner = parsedNext.searchParams.get('url')
      if (inner) cleaned = inner
    }
    const u = new URL(cleaned, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (isBlockedHost(u.hostname)) return null
    // Prefer https on well-known CDNs that emit both http and https copies
    if (u.protocol === 'http:' && /(?:ctfassets\.net|cloudinary\.com|imgix\.net)$/i.test(u.hostname)) {
      u.protocol = 'https:'
    }
    return u.toString()
  } catch {
    return null
  }
}

function guessPdfRole(nameOrUrl: string): SystemSourceRole {
  const s = nameOrUrl.toLowerCase()
  if (/install|fixing|fasten|subframe|framing/.test(s)) return 'install_guide'
  if (/seal|coat|paint|oil|care|maint|design|best.?practice|finish|colour|color/.test(s)) return 'design_guide'
  if (/tds|tech|spec|data.?sheet|span|bal|slip|fire|acoustic|engineering/.test(s)) return 'tech_data'
  return 'source_catalogue'
}

function normDocKey(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = raw
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      s = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || raw)
    }
  } catch { /* fallback to raw */ }
  return s
    .replace(/\.pdf$/i, '')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function deriveLabel(urlStr: string, fallback: string): string {
  try {
    const u = new URL(urlStr)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (!last) return fallback
    const clean = decodeURIComponent(last)
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return clean.slice(0, 140) || fallback
  } catch {
    return fallback
  }
}

function isImageUrl(urlStr: string): boolean {
  const lower = urlStr.toLowerCase()
  if (/\.svg(\?|$|#)|\.gif(\?|$|#)/i.test(lower)) return false
  return (
    /\.(jpg|jpeg|png|webp|avif)(\?|$|#)/i.test(lower) ||
    /images\.ctfassets\.net|res\.cloudinary\.com\/[^/]+\/image\/|imgix\.net/i.test(lower)
  )
}

function looksLikeUsefulProductPhoto(urlStr: string, alt = '', width?: number, height?: number): boolean {
  if (!isImageUrl(urlStr)) return false
  if (typeof width === 'number' && width > 0 && width < 360) return false
  if (typeof height === 'number' && height > 0 && height < 220) return false
  const lower = `${urlStr} ${alt}`.toLowerCase()
  if (
    /favicon|logo|icon|icons?[_ -]|sprite|avatar|badge|social|facebook|instagram|linkedin|youtube|pinterest|pixel|tracking|analytics|spacer|placeholder|arrow|chevron|close|menu|search|congrat|promo|campaign|award|winner|newsletter|zero-harm|zero_harm|app-store|google-play|qr-code|banner-ad|safety-worker|mask[_ ]group|square[_ ]98/i.test(
      lower,
    )
  ) {
    return false
  }
  return true
}

function looksLikeSwatchImage(urlStr: string, width?: number, height?: number): boolean {
  if (!isImageUrl(urlStr)) return false
  if (typeof width === 'number' && width > 0 && width < 48) return false
  if (typeof height === 'number' && height > 0 && height < 48) return false
  const lower = urlStr.toLowerCase()
  if (/favicon|logo|sprite|social|facebook|instagram|linkedin|youtube|pixel|tracking|arrow|chevron|winner|zero-harm|icons?_-_/.test(lower)) {
    return false
  }
  return true
}

function cleanColourName(raw: string): string | null {
  let name = stripTagsAndClean(raw)
    .replace(/^(?:colour|color|finish|swatch|shade)\s*[:–—-]\s*/i, '')
    .replace(/\s*(?:swatch|thumbnail|sample|tile|icon|board|decking)\s*$/i, '')
    .trim()
  if (!name || name.length < 2 || name.length > 42) return null
  // Reject numeric SKUs, dimensions, URLs, or long sentences
  if (/^\d[\d\s.,x×mm-]*$/i.test(name)) return null
  if (/^https?:\/\//i.test(name) || /[{}[\]<>]/.test(name)) return null
  const words = name.split(/\s+/)
  if (words.length > 5) return null
  if (NON_COLOUR_PHRASE_RE.test(name)) return null
  if (/^[0-9a-f]{16,}$/i.test(name.replace(/[^0-9a-f]/gi, '')) && name.length >= 16) return null
  return name
}

function extractAssetUrlFromObj(obj: unknown): { url: string; title?: string; width?: number; height?: number } | null {
  if (!obj) return null
  if (typeof obj === 'string') return { url: obj }
  if (typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>

  // Contentful Asset shape: { fields: { title, file: { url, details: { image: { width, height } } } } }
  const fields = (rec.fields && typeof rec.fields === 'object' ? rec.fields : rec) as Record<string, unknown>
  const file = fields.file as Record<string, unknown> | undefined
  if (file && typeof file.url === 'string') {
    const imgDetails = (file.details as Record<string, unknown> | undefined)?.image as
      | { width?: number; height?: number }
      | undefined
    return {
      url: file.url,
      title: typeof fields.title === 'string' ? fields.title : undefined,
      width: imgDetails?.width,
      height: imgDetails?.height,
    }
  }
  // Generic CMS / Shopify / Sanity / Cloudinary shape
  for (const k of ['secure_url', 'url', 'src', 'imageUrl', 'image_url', 'swatchUrl', 'swatch_url']) {
    if (typeof fields[k] === 'string') {
      return {
        url: fields[k] as string,
        title: typeof fields.alt === 'string' ? fields.alt : typeof fields.title === 'string' ? fields.title : undefined,
        width: typeof fields.width === 'number' ? fields.width : undefined,
        height: typeof fields.height === 'number' ? fields.height : undefined,
      }
    }
  }
  return null
}

function extractFromNextData(
  html: string,
  baseUrl: URL,
  systemName: string,
): {
  galleryPhotos: { url: string; alt: string; priority: number }[]
  swatches: ExtractedSwatch[]
  itemImages: ExtractedItemImage[]
  pdfs: { url: string; label: string }[]
} {
  const galleryPhotos: { url: string; alt: string; priority: number }[] = []
  const swatches: ExtractedSwatch[] = []
  const itemImages: ExtractedItemImage[] = []
  const pdfs: { url: string; label: string }[] = []

  const nextMatch = html.match(/<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!nextMatch) return { galleryPhotos, swatches, itemImages, pdfs }

  let parsed: unknown
  try {
    parsed = JSON.parse(nextMatch[1])
  } catch {
    return { galleryPhotos, swatches, itemImages, pdfs }
  }

  const pageProps = (parsed as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps
  if (!pageProps || typeof pageProps !== 'object') return { galleryPhotos, swatches, itemImages, pdfs }

  const seenSwatchNames = new Set<string>()
  const seenItemKeys = new Set<string>()
  const pushItemImage = (sku: string | undefined, label: string, rawUrl: string) => {
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved || !isImageUrl(resolved)) return
    const key = `${(sku || '').toLowerCase()}|${label.toLowerCase()}|${resolved.split(/[?#]/)[0].toLowerCase()}`
    if (seenItemKeys.has(key)) return
    seenItemKeys.add(key)
    itemImages.push({ sku: sku?.trim() || undefined, label: stripTagsAndClean(label), imageUrl: resolved })
  }
  const pushSwatch = (rawName: string, rawUrl: string, width?: number, height?: number) => {
    const name = cleanColourName(rawName)
    if (!name) return
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved || !looksLikeSwatchImage(resolved, width, height)) return
    const key = name.toLowerCase()
    if (seenSwatchNames.has(key)) return
    seenSwatchNames.add(key)
    swatches.push({ name, imageUrl: resolved })
  }

  const visited = new Set<unknown>()

  const walk = (node: unknown, pathKeys: string[], inGallery: boolean, inSwatchContext: boolean, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 14 || visited.has(node)) return
    visited.add(node)

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, pathKeys, inGallery, inSwatchContext, depth + 1)
      }
      return
    }

    const rec = node as Record<string, unknown>
    const fields = rec.fields && typeof rec.fields === 'object' && !Array.isArray(rec.fields)
      ? (rec.fields as Record<string, unknown>)
      : rec

    // Check if this container represents a colour/swatch/spec section
    const compKey = typeof fields.frontEndComponentKey === 'string' ? fields.frontEndComponentKey : ''
    const sectionTitle = typeof fields.title === 'string' ? stripTagsAndClean(fields.title) : ''
    const isFeatureSection = /comparison|whyChoose|faq|disclaimer|benefit|feature/i.test(`${compKey} ${sectionTitle}`)
    const nextSwatchCtx =
      !isFeatureSection &&
      (inSwatchContext ||
        /colour|color|swatch|finish|shade|specification|variant/i.test(`${compKey} ${sectionTitle}`))

    // 1) Detect PDFs in Contentful/Cloudinary resource entries
    if (typeof fields.linkUrl === 'string' && /\.pdf(\?|$|#)/i.test(fields.linkUrl)) {
      const resolved = resolveUrl(fields.linkUrl, baseUrl)
      if (resolved) {
        const label = typeof fields.linkText === 'string' ? stripTagsAndClean(fields.linkText) : deriveLabel(resolved, `${systemName} document`)
        pdfs.push({ url: resolved, label })
      }
    }
    if (Array.isArray(fields.pdf)) {
      const label = typeof fields.linkText === 'string' ? stripTagsAndClean(fields.linkText) : ''
      for (const p of fields.pdf) {
        const pr = p as Record<string, unknown> | null
        const rawPdfUrl = (typeof pr?.secure_url === 'string' && pr.secure_url) || (typeof pr?.url === 'string' && pr.url) || ''
        if (rawPdfUrl && /\.pdf(\?|$|#)/i.test(rawPdfUrl)) {
          const resolved = resolveUrl(rawPdfUrl, baseUrl)
          if (resolved) pdfs.push({ url: resolved, label: label || deriveLabel(resolved, `${systemName} document`) })
        }
      }
    }

    // 2) Detect colour/swatch items inside swatch/spec sections
    //    e.g. James Hardie TimberTech: { linkText: "Weathered Teak", icon: { fields: { file: { url } } }, links: [SKU...] }
    //    or generic CMS: { colour_name / colorName / swatchName / name, swatch / image / icon }
    if (!isFeatureSection) {
      const rawColourLabel =
        (typeof fields.colour_name === 'string' && fields.colour_name) ||
        (typeof fields.color_name === 'string' && fields.color_name) ||
        (typeof fields.colourName === 'string' && fields.colourName) ||
        (typeof fields.colorName === 'string' && fields.colorName) ||
        (typeof fields.swatchName === 'string' && fields.swatchName) ||
        (nextSwatchCtx && typeof fields.linkText === 'string' && fields.linkText) ||
        (nextSwatchCtx && typeof fields.name === 'string' && fields.name) ||
        (nextSwatchCtx && typeof fields.title === 'string' && fields.title) ||
        null

      if (rawColourLabel) {
        const hasSkuLinks = Array.isArray(fields.links) && fields.links.length > 0
        const hasExplicitColourKey = Boolean(
          fields.colour_name || fields.color_name || fields.colourName || fields.colorName || fields.swatchName || fields.swatch || fields.swatchImage,
        )
        const strictColourSection = /colour|color|swatch|finish|shade/i.test(`${compKey} ${sectionTitle} ${pathKeys.slice(-2).join(' ')}`)

        if (hasExplicitColourKey || strictColourSection || (nextSwatchCtx && hasSkuLinks)) {
          const swatchAsset =
            extractAssetUrlFromObj(fields.swatch) ||
            extractAssetUrlFromObj(fields.swatchImage) ||
            extractAssetUrlFromObj(fields.swatch_image) ||
            extractAssetUrlFromObj(fields.icon) ||
            extractAssetUrlFromObj(fields.image) ||
            extractAssetUrlFromObj(fields.thumbnail)
          if (swatchAsset?.url) {
            pushSwatch(rawColourLabel, swatchAsset.url, swatchAsset.width, swatchAsset.height)
          }
          // Capture nested SKU/profile thumbnails (e.g. James Hardie TimberTech Square/Grooved board icons)
          if (Array.isArray(fields.links)) {
            for (const sub of fields.links) {
              if (!sub || typeof sub !== 'object') continue
              const sf = ((sub as Record<string, unknown>).fields ?? sub) as Record<string, unknown>
              const subSku = typeof sf.linkText === 'string' ? sf.linkText.trim() : undefined
              const subLabel = [rawColourLabel, sf.description, sf.subDescription].filter((x) => typeof x === 'string' && x.trim()).join(' ')
              const subImg = extractAssetUrlFromObj(sf.icon) || extractAssetUrlFromObj(sf.image)
              if (subImg?.url && (subSku || subLabel)) {
                pushItemImage(subSku, subLabel, subImg.url)
              }
            }
          }
        }
      }
    }

    // 3) Detect Contentful / CMS gallery or hero photo asset objects
    const asset = extractAssetUrlFromObj(rec)
    if (asset && !isFeatureSection) {
      const resolved = resolveUrl(asset.url, baseUrl)
      const cleanAlt = asset.title ? stripTagsAndClean(asset.title) : systemName
      const lastKey = (pathKeys[pathKeys.length - 1] || '').toLowerCase()
      const isIconField = /icon|logo|avatar|badge|swatch/.test(lastKey)
      if (resolved && !isIconField && looksLikeUsefulProductPhoto(resolved, cleanAlt, asset.width, asset.height)) {
        const priority = inGallery ? 10 : /hero|banner|cover|main/.test(pathKeys.join(' ').toLowerCase()) ? 8 : 4
        galleryPhotos.push({ url: resolved, alt: cleanAlt || systemName, priority })
      }
    }

    // 4) Recurse into child keys while skipping global site chrome & feature/icon subtrees
    for (const [k, v] of Object.entries(rec)) {
      if (!v || typeof v !== 'object') continue
      const kl = k.toLowerCase()
      if (SKIP_JSON_KEYS.has(kl)) continue
      if (/^(?:menu|header|footer|nav|navigation|megamenu|related|otherproduct|iconimage|sampleproduct)/i.test(kl)) continue
      if (isFeatureSection && kl === 'accessorieslist') continue
      const childInGallery = inGallery || /slide|gallery|banner|hero|carousel|media|photo|images/i.test(kl)
      const childInSwatch = nextSwatchCtx || /colour|color|swatch|finish|shade|variant/i.test(kl)
      walk(v, [...pathKeys, k], childInGallery, childInSwatch, depth + 1)
    }
  }

  // Prefer primary product root keys inside pageProps, skipping global menu/footer/productItems
  for (const [k, v] of Object.entries(pageProps)) {
    if (!v || typeof v !== 'object') continue
    if (SKIP_JSON_KEYS.has(k.toLowerCase())) continue
    if (/^(?:menu|header|footer|nav|productitems|sample)/i.test(k)) continue
    walk(v, [k], /banner|hero|gallery|slide/i.test(k), /colour|color|swatch|finish/i.test(k), 0)
  }

  // Sort photos: explicit gallery/banner slides first
  galleryPhotos.sort((a, b) => b.priority - a.priority)

  return { galleryPhotos, swatches, itemImages, pdfs }
}

function extractPageAssets(html: string, baseUrl: URL, systemName: string): {
  title: string
  images: { url: string; alt: string }[]
  swatches: ExtractedSwatch[]
  itemImages: ExtractedItemImage[]
  pdfs: { url: string; label: string; role: SystemSourceRole }[]
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const rawTitle = titleMatch ? stripTagsAndClean(titleMatch[1]) : systemName
  const title = rawTitle.split(/\s*[|–—-]\s*/)[0]?.trim() || systemName

  const titleTokens = `${systemName} ${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(?:with|from|that|this|your|deck|decking|system|product|collection|james|hardie|australia)$/.test(w))

  const nextExtracted = extractFromNextData(html, baseUrl, systemName)

  const images: { url: string; alt: string }[] = []
  const seenImg = new Set<string>()
  const swatchUrlKeys = new Set(nextExtracted.swatches.map((s) => s.imageUrl.split(/[?#]/)[0].toLowerCase()))

  const pushImg = (rawUrl: string, alt: string, allowIfSwatch = false) => {
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved) return
    const key = resolved.split(/[?#]/)[0].toLowerCase()
    if (!allowIfSwatch && swatchUrlKeys.has(key)) return
    if (seenImg.has(key) || !looksLikeUsefulProductPhoto(resolved, alt)) return
    seenImg.add(key)
    images.push({ url: resolved, alt: stripTagsAndClean(alt) || systemName })
  }

  // 1) Structured product gallery photos from __NEXT_DATA__ FIRST (excludes nav/footer/promo chrome!)
  for (const p of nextExtracted.galleryPhotos) {
    pushImg(p.url, p.alt)
  }

  // 2) og:image & twitter:image (great hero fallback when not already in gallery)
  for (const m of Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi))) {
    pushImg(m[1], `${systemName} hero`)
  }
  for (const m of Array.from(html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi))) {
    pushImg(m[1], `${systemName} hero`)
  }

  // 3) Cleaned HTML body fallback (strip header/nav/footer/aside/script/style so mega-menu promos don't pollute!)
  const cleanedHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, ' ')

  const swatches: ExtractedSwatch[] = [...nextExtracted.swatches]
  const itemImages: ExtractedItemImage[] = [...nextExtracted.itemImages]
  const seenSwatchNames = new Set(swatches.map((s) => s.name.toLowerCase()))
  const seenHtmlItemUrls = new Set(itemImages.map((i) => `${i.label.toLowerCase()}|${i.imageUrl.split(/[?#]/)[0].toLowerCase()}`))
  const ITEM_IMG_HINT_RE =
    /\b(grooved|square|edge|fascia|bullnose|scalloped|solid|profile|board|clip|screw|fastener|jointer|trim|starter|blade|sealant|hulk|breaker|plug|spacer|pedestal|joist|bearer|finishing|end.?cap)\b/i

  // Collect HTML <img> tags, separating swatch images from product photos and scoring relevance
  const scoredHtmlImgs: { url: string; alt: string; score: number }[] = []
  for (const m of Array.from(cleanedHtml.matchAll(/<img\b[^>]*>/gi))) {
    const tag = m[0]
    const srcM = tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)
    if (!srcM) continue
    const altRaw = (tag.match(/\balt=["']([^"']*)["']/i) || [])[1] || ''
    const titleAttr = (tag.match(/\btitle=["']([^"']*)["']/i) || [])[1] || ''
    const classAttr = (tag.match(/\bclass=["']([^"']*)["']/i) || [])[1] || ''
    const alt = stripTagsAndClean(altRaw || titleAttr)
    const resolved = resolveUrl(srcM[1], baseUrl)
    if (!resolved) continue

    // Capture profile board & component/accessory thumbnails from HTML <img> tags
    if (isImageUrl(resolved) && ITEM_IMG_HINT_RE.test(`${alt} ${resolved}`)) {
      const itemLabel = alt || deriveLabel(resolved, '')
      const ikey = `${itemLabel.toLowerCase()}|${resolved.split(/[?#]/)[0].toLowerCase()}`
      if (itemLabel && !seenHtmlItemUrls.has(ikey) && !/logo|icon|banner|slider/i.test(`${alt} ${resolved}`)) {
        seenHtmlItemUrls.add(ikey)
        itemImages.push({ label: itemLabel, imageUrl: resolved })
      }
    }

    // Check if this <img> looks like a colour swatch on non-Next.js sites
    const looksSwatchTag = /\b(swatch|colour|color|finish)\b/i.test(`${classAttr} ${resolved} ${altRaw}`)
    if (looksSwatchTag && swatches.length < MAX_SWATCHES) {
      const candidateName =
        cleanColourName(alt) ||
        cleanColourName(deriveLabel(resolved, ''))
      if (candidateName && !seenSwatchNames.has(candidateName.toLowerCase()) && looksLikeSwatchImage(resolved)) {
        seenSwatchNames.add(candidateName.toLowerCase())
        swatches.push({ name: candidateName, imageUrl: resolved })
        swatchUrlKeys.add(resolved.split(/[?#]/)[0].toLowerCase())
        continue
      }
    }

    if (!looksLikeUsefulProductPhoto(resolved, alt)) continue

    // Reject random SHA-hash filenames with random/empty alt (typical mega-menu promo tiles)
    const filePart = resolved.split(/[?#]/)[0].split('/').pop() || ''
    const hasHashFilename = /^[0-9a-f]{24,}/i.test(filePart)
    const hasHashAlt = !alt || /^[0-9a-f]{20,}/i.test(alt.replace(/[^0-9a-f]/gi, ''))
    if (hasHashFilename && hasHashAlt) continue

    let score = 0
    const hay = `${resolved} ${alt}`.toLowerCase()
    for (const tok of titleTokens) {
      if (hay.includes(tok)) score += 4
    }
    if (alt.length >= 8 && !hasHashAlt) score += 2
    if (/\.(jpe?g|webp)(\?|$)/i.test(resolved)) score += 1
    scoredHtmlImgs.push({ url: resolved, alt: alt || systemName, score })
  }

  scoredHtmlImgs.sort((a, b) => b.score - a.score)
  for (const img of scoredHtmlImgs) {
    if (images.length >= MAX_GALLERY) break
    pushImg(img.url, img.alt)
  }

  // 4) PDF links from structured __NEXT_DATA__ first, then <a href>, then embedded URLs
  const pdfs: { url: string; label: string; role: SystemSourceRole }[] = []
  const seenPdfKeys = new Set<string>()
  const JUNK_PDF_RE =
    /modern[_ -]?slavery|terms[_ -]?(?:and|&)?[_ -]?conditions|privacy[_ -]?policy|cookie[_ -]?policy|whistleblower|asbestos[_ -]?fact[_ -]?sheet|accessibility[_ -]?statement|supplier[_ -]?code[_ -]?of[_ -]?conduct|credit[_ -]?application|gender[_ -]?pay/i
  const pushPdf = (rawUrl: string, anchorText?: string) => {
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved) return
    const urlNoQuery = resolved.split(/[?#]/)[0].toLowerCase()
    if (!/\.pdf$/i.test(urlNoQuery)) return
    const fileKey = normDocKey(urlNoQuery)
    const cleanedAnchor = anchorText ? stripTagsAndClean(anchorText) : ''
    const label = cleanedAnchor && cleanedAnchor.length >= 4 && !/^(download|view|open|pdf|click here)$/i.test(cleanedAnchor)
      ? cleanedAnchor.slice(0, 140)
      : deriveLabel(resolved, `${systemName} document`)
    if (JUNK_PDF_RE.test(`${label} ${resolved}`)) return
    const labelKey = normDocKey(label)
    if (seenPdfKeys.has(urlNoQuery) || (fileKey && seenPdfKeys.has(`file:${fileKey}`)) || (labelKey && seenPdfKeys.has(`label:${labelKey}`))) {
      return
    }
    seenPdfKeys.add(urlNoQuery)
    if (fileKey) seenPdfKeys.add(`file:${fileKey}`)
    if (labelKey) seenPdfKeys.add(`label:${labelKey}`)
    pdfs.push({ url: resolved, label, role: guessPdfRole(`${label} ${resolved}`) })
  }

  for (const p of nextExtracted.pdfs) {
    pushPdf(p.url, p.label)
  }
  for (const m of Array.from(cleanedHtml.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    pushPdf(m[1], m[2])
  }
  if (pdfs.length === 0) {
    for (const m of Array.from(html.matchAll(/(?:https?:)?\/\/[^\s"'\\<>]+\.pdf(?:\?[^\s"'\\<>]*)?/gi))) {
      const raw = m[0].startsWith('//') ? `https:${m[0]}` : m[0]
      pushPdf(raw)
    }
  }

  return {
    title,
    images: images.slice(0, MAX_GALLERY),
    swatches: swatches.slice(0, MAX_SWATCHES),
    itemImages,
    pdfs: pdfs.slice(0, MAX_PDFS),
  }
}

function matchBestItemImage(
  target: { sku?: string | null; name?: string | null; dimensions?: string | null; width_mm?: number | null },
  candidates: ExtractedItemImage[],
): string | null {
  if (candidates.length === 0) return null
  const targetSku = (target.sku || '').trim().toLowerCase()
  const targetText = `${target.name || ''} ${target.dimensions || ''} ${target.width_mm || ''}`.toLowerCase()

  // 1) Exact SKU / product code match always wins
  if (targetSku) {
    const exact = candidates.find((c) => c.sku && c.sku.toLowerCase() === targetSku)
    if (exact) return exact.imageUrl
  }

  // 2) Edge profile / dimension / token match
  const stopWords = new Set(['deck', 'decking', 'board', 'boards', 'collection', 'vintage', 'system', 'plus', 'range', 'series', 'timber', 'composite', 'with', 'from', 'the', 'and', 'for'])
  const targetTokens = targetText
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t))

  const hasGrooved = /\bgroov/i.test(targetText)
  const hasSquare = /\bsquare\b|\bsolid\b|\bedge\b/i.test(targetText) && !hasGrooved
  const hasFascia = /\bfascia\b|\btrim\b/i.test(targetText)

  let bestUrl: string | null = null
  let bestScore = 0

  for (const c of candidates) {
    const hay = `${c.label} ${c.imageUrl}`.toLowerCase()
    const cGrooved = /\bgroov/i.test(hay)
    const cSquare = /\bsquare\b|\bsolid\b/i.test(hay) && !cGrooved
    const cFascia = /\bfascia\b|\btrim\b/i.test(hay)

    // Never assign a grooved board photo to a square-edge board (or vice versa)
    if (hasGrooved && cSquare) continue
    if (hasSquare && cGrooved) continue
    if (hasFascia && (cGrooved || cSquare) && !cFascia) continue

    let score = 0
    if (hasGrooved && cGrooved) score += 8
    if (hasSquare && cSquare) score += 8
    if (hasFascia && cFascia) score += 8
    if (target.width_mm && hay.includes(String(target.width_mm))) score += 6
    for (const tok of targetTokens) {
      if (hay.includes(tok)) score += 3
    }
    if (score > bestScore) {
      bestScore = score
      bestUrl = c.imageUrl
    }
  }

  return bestScore >= 6 ? bestUrl : null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  if (!UUID_RE.test(systemId)) {
    return NextResponse.json({ error: 'Invalid system id.' }, { status: 400 })
  }

  const session = await getStudioSession()
  if (!session.profile || !session.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as {
    manufacturerId?: string
    url?: string
    autoExtract?: boolean
    mode?: ImportMode
    replacePhotos?: boolean
  } | null

  const manufacturerId = body?.manufacturerId
  const rawUrl = body?.url?.trim()
  const autoExtract = body?.autoExtract !== false
  const mode: ImportMode =
    body?.mode === 'swatches_only' || body?.mode === 'photos_only' || body?.mode === 'item_images'
      ? body.mode
      : 'full'
  const replacePhotos = Boolean(body?.replacePhotos)

  if (!manufacturerId || !UUID_RE.test(manufacturerId)) {
    return NextResponse.json({ error: 'manufacturerId is required.' }, { status: 400 })
  }
  if (!rawUrl) {
    return NextResponse.json({ error: 'Enter a product page URL.' }, { status: 400 })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Enter a valid http(s) URL.' }, { status: 400 })
  }
  if ((targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') || isBlockedHost(targetUrl.hostname)) {
    return NextResponse.json({ error: 'URL must be a public http(s) website.' }, { status: 400 })
  }

  if (session.globalRole !== 'buildquote_admin') {
    if (session.globalRole !== 'manufacturer_user') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }
    const hasMembership = session.memberships.some(
      (m) => m.manufacturerId === manufacturerId && m.status === 'active',
    )
    if (!hasMembership) {
      return NextResponse.json({ error: 'Not a member of this workspace.' }, { status: 403 })
    }
  }

  let supabase: ReturnType<typeof createStudioServiceClient>
  try {
    supabase = createStudioServiceClient()
  } catch {
    return NextResponse.json({ error: 'Service role not configured.' }, { status: 500 })
  }

  const { data: system } = await supabase
    .from('staged_systems')
    .select('id, name, hero_image_url, website_url, gallery_images, custom_document_links')
    .eq('id', systemId)
    .eq('manufacturer_id', manufacturerId)
    .maybeSingle()

  if (!system) {
    return NextResponse.json({ error: 'System not found in this workspace.' }, { status: 404 })
  }
  const sys = system as {
    id: string
    name: string | null
    hero_image_url: string | null
    website_url: string | null
    gallery_images: GalleryPhoto[] | null
    custom_document_links: CustomDocumentLink[] | null
  }
  const systemName = sys.name ?? 'Product'

  const { data: mfr } = await supabase
    .from('data_studio_manufacturers')
    .select('name')
    .eq('id', manufacturerId)
    .maybeSingle()
  const manufacturerName = (mfr as { name: string | null } | null)?.name ?? ''

  // Fetch the product page HTML
  let html: string
  let finalUrl: URL = targetUrl
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BuildQuoteDataStudio/1.0; +https://studio.buildquote.com.au)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      return NextResponse.json({ error: `Website returned HTTP ${res.status}.` }, { status: 400 })
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('application/pdf')) {
      return NextResponse.json(
        { error: 'That link is a direct PDF file — paste it into Step 4 (Fetch PDF) instead.' },
        { status: 400 },
      )
    }
    html = await res.text()
    try { finalUrl = new URL(res.url || targetUrl.toString()) } catch { /* keep targetUrl */ }
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch that website: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    )
  }

  const extracted = extractPageAssets(html, finalUrl, systemName)

  // ── 1) Photos & Links (full or photos_only) ────────────────────────────────
  const priorGallery: GalleryPhoto[] = Array.isArray(sys.gallery_images) ? sys.gallery_images : []
  const existingGallery: GalleryPhoto[] = replacePhotos ? [] : priorGallery
  const existingImgUrls = new Set(existingGallery.map((g) => g.url.split(/[?#]/)[0].toLowerCase()))
  const addedPhotos: GalleryPhoto[] = []

  if (mode === 'full' || mode === 'photos_only') {
    for (const img of extracted.images) {
      if (existingGallery.length + addedPhotos.length >= MAX_GALLERY) break
      const key = img.url.split(/[?#]/)[0].toLowerCase()
      if (existingImgUrls.has(key)) continue
      existingImgUrls.add(key)
      addedPhotos.push({
        asset_id: null,
        url: img.url,
        alt: img.alt,
        position_x: 50,
        position_y: 50,
        zoom: 1,
      })
    }
  }
  // Safety guard: if replacePhotos was ticked but the page returned 0 images
  // (e.g. bot-blocked or JS-rendered), keep the existing gallery rather than wiping it.
  const replacedGallery = replacePhotos && addedPhotos.length > 0
  const nextGallery = replacePhotos
    ? (addedPhotos.length > 0 ? addedPhotos : priorGallery)
    : [...priorGallery, ...addedPhotos]

  const existingLinks: CustomDocumentLink[] = Array.isArray(sys.custom_document_links) ? sys.custom_document_links : []
  const existingLinkUrls = new Set(existingLinks.map((l) => l.url))
  const nextLinks = [...existingLinks]
  let linksAdded = 0
  if (mode === 'full' && !existingLinkUrls.has(finalUrl.toString())) {
    nextLinks.unshift({
      label: `${extracted.title} — Official Product Page`,
      url: finalUrl.toString(),
      type: 'product_page',
    })
    linksAdded += 1
  }

  const sysPatch: Record<string, unknown> = {}
  if ((mode === 'full' || mode === 'photos_only') && addedPhotos.length > 0) {
    sysPatch.gallery_images = nextGallery
    if ((replacedGallery || !sys.hero_image_url) && nextGallery[0]?.url) {
      sysPatch.hero_image_url = nextGallery[0].url
      if (replacedGallery) {
        // Clear any previously uploaded hero asset so Publish uses the new hero_image_url
        sysPatch.hero_image_asset_id = null
      }
    }
  }
  if (!sys.website_url) sysPatch.website_url = finalUrl.toString()
  if (linksAdded > 0) sysPatch.custom_document_links = nextLinks

  if (Object.keys(sysPatch).length > 0) {
    const { error: patchErr } = await supabase
      .from('staged_systems')
      .update(sysPatch)
      .eq('id', systemId)
      .eq('manufacturer_id', manufacturerId)
    if (patchErr) {
      return NextResponse.json({ error: `Could not save imported page details: ${patchErr.message}` }, { status: 500 })
    }
  }

  // ── 2) Colour swatches (full or swatches_only) ─────────────────────────────
  let swatchesAdded = 0
  let totalColours = 0
  const addedSwatches: ExtractedSwatch[] = []

  if (mode === 'full' || mode === 'swatches_only') {
    const { data: existingCols } = await supabase
      .from('staged_system_colours')
      .select('id, colour_name, image_url')
      .eq('staged_system_id', systemId)

    const existingList = (existingCols ?? []) as { id: string; colour_name: string | null; image_url: string | null }[]
    totalColours = existingList.length
    const byName = new Map(existingList.map((c) => [(c.colour_name ?? '').trim().toLowerCase(), c]))

    for (const sw of extracted.swatches) {
      const key = sw.name.trim().toLowerCase()
      const existing = byName.get(key)
      if (existing) {
        if (sw.imageUrl && (!existing.image_url || replacePhotos)) {
          const updatePayload = replacePhotos
            ? { image_url: sw.imageUrl, image_asset_id: null }
            : { image_url: sw.imageUrl }
          const { error: swErr } = await supabase
            .from('staged_system_colours')
            .update(updatePayload)
            .eq('id', existing.id)
          if (swErr && replacePhotos && swErr.code === '42703') {
            await supabase
              .from('staged_system_colours')
              .update({ image_url: sw.imageUrl })
              .eq('id', existing.id)
          }
          swatchesAdded += 1
          addedSwatches.push(sw)
        }
        continue
      }
      const { error: colErr } = await supabase
        .from('staged_system_colours')
        .insert({
          staged_system_id: systemId,
          colour_name: sw.name,
          image_url: sw.imageUrl,
          is_stocked: true,
          verification_status: 'pending_review',
        })
      if (!colErr) {
        byName.set(key, { id: '', colour_name: sw.name, image_url: sw.imageUrl })
        swatchesAdded += 1
        totalColours += 1
        addedSwatches.push(sw)
      }
    }
  }

  // ── 3) Discovered PDFs (full mode only) ────────────────────────────────────
  const queuedJobIds: string[] = []
  const addedPdfs: { label: string; role: SystemSourceRole; url: string }[] = []

  if (mode === 'full') {
    const { data: existingSources } = await supabase
      .from('system_sources')
      .select('url, label, source_documents(document_name, original_filename)')
      .eq('staged_system_id', systemId)

    type ExistingSourceRow = {
      url: string | null
      label: string | null
      source_documents:
        | { document_name: string | null; original_filename: string | null }
        | { document_name: string | null; original_filename: string | null }[]
        | null
    }
    const seenExisting = new Set<string>()
    for (const s of (existingSources ?? []) as unknown as ExistingSourceRow[]) {
      if (s.url) {
        seenExisting.add(s.url.split(/[?#]/)[0].toLowerCase())
        const fk = normDocKey(s.url)
        if (fk) seenExisting.add(`name:${fk}`)
      }
      if (s.label) {
        const lk = normDocKey(s.label)
        if (lk) seenExisting.add(`name:${lk}`)
      }
      const sd = Array.isArray(s.source_documents) ? s.source_documents[0] : s.source_documents
      if (sd?.document_name) {
        const dk = normDocKey(sd.document_name)
        if (dk) seenExisting.add(`name:${dk}`)
      }
      if (sd?.original_filename) {
        const ok = normDocKey(sd.original_filename)
        if (ok) seenExisting.add(`name:${ok}`)
      }
    }

    for (const pdf of extracted.pdfs) {
      const urlKey = pdf.url.split(/[?#]/)[0].toLowerCase()
      const fileKey = normDocKey(pdf.url)
      const labelKey = normDocKey(pdf.label)
      if (
        seenExisting.has(urlKey) ||
        (fileKey && seenExisting.has(`name:${fileKey}`)) ||
        (labelKey && seenExisting.has(`name:${labelKey}`))
      ) {
        continue
      }
      seenExisting.add(urlKey)
      if (fileKey) seenExisting.add(`name:${fileKey}`)
      if (labelKey) seenExisting.add(`name:${labelKey}`)

      const { data: doc, error: docErr } = await supabase
        .from('source_documents')
        .insert({
          manufacturer_id: manufacturerId,
          original_filename: `${pdf.label}.pdf`,
          document_name: pdf.label,
          document_type: pdf.role,
          storage_provider: 'cloudflare_r2',
          source_url: pdf.url,
          ingest_kind: 'url_fetch',
          status: 'pending_fetch',
          uploaded_by: session.user.id,
        })
        .select('id')
        .single()

      if (docErr || !doc) continue
      const documentId = (doc as { id: string }).id

      let systemSourceId: string | null = null
      const { data: srcRow } = await supabase
        .from('system_sources')
        .upsert(
          {
            manufacturer_id: manufacturerId,
            staged_system_id: systemId,
            role: pdf.role,
            label: pdf.label,
            url: pdf.url,
            source_document_id: documentId,
            ingest_status: 'queued',
            include_in_container: true,
          },
          { onConflict: 'staged_system_id,role,url' },
        )
        .select('id')
        .single()
      if (srcRow) systemSourceId = (srcRow as { id: string }).id

      const { data: job } = await supabase
        .from('pipeline_jobs')
        .insert({
          manufacturer_id: manufacturerId,
          document_id: documentId,
          job_type: 'fetch_url',
          status: 'pending',
          payload: {
            document_id: documentId,
            document_name: pdf.label,
            manufacturer_id: manufacturerId,
            manufacturer_name: manufacturerName,
            source_url: pdf.url,
            system_source_id: systemSourceId,
            staged_system_id: systemId,
            system_name: systemName,
            then_docling: true,
            auto_chain: autoExtract,
            chunk_size: 7,
            dry_run: false,
          },
        })
        .select('id')
        .single()

      if (job) queuedJobIds.push((job as { id: string }).id)
      addedPdfs.push(pdf)
    }
  }

  // ── 4) Match profile & component thumbnails (full or item_images) ──────────
  let profilePicsAdded = 0
  let componentPicsAdded = 0

  if ((mode === 'full' || mode === 'item_images') && extracted.itemImages.length > 0) {
    const { data: profRows } = await supabase
      .from('staged_system_profiles')
      .select('id, profile_name, product_code, dimensions, width_mm, image_url')
      .eq('staged_system_id', systemId)

    for (const p of (profRows ?? []) as {
      id: string
      profile_name: string | null
      product_code: string | null
      dimensions: string | null
      width_mm: number | null
      image_url: string | null
    }[]) {
      if (p.image_url && !replacePhotos) continue
      const matched = matchBestItemImage(
        { sku: p.product_code, name: p.profile_name, dimensions: p.dimensions, width_mm: p.width_mm },
        extracted.itemImages,
      )
      if (matched) {
        const { error: pe } = await supabase
          .from('staged_system_profiles')
          .update({ image_url: matched })
          .eq('id', p.id)
        if (!pe) profilePicsAdded += 1
      }
    }

    const { data: compLinks } = await supabase
      .from('staged_system_components')
      .select('staged_components(id, name, sku, image_url)')
      .eq('staged_system_id', systemId)

    const seenCompIds = new Set<string>()
    for (const row of (compLinks ?? []) as unknown as {
      staged_components:
        | { id: string; name: string | null; sku: string | null; image_url: string | null }
        | { id: string; name: string | null; sku: string | null; image_url: string | null }[]
        | null
    }[]) {
      const comp = Array.isArray(row.staged_components) ? row.staged_components[0] : row.staged_components
      if (!comp || seenCompIds.has(comp.id)) continue
      seenCompIds.add(comp.id)
      if (comp.image_url && !replacePhotos) continue
      const matched = matchBestItemImage({ sku: comp.sku, name: comp.name }, extracted.itemImages)
      if (matched) {
        const { error: ce } = await supabase
          .from('staged_components')
          .update({ image_url: matched })
          .eq('id', comp.id)
        if (!ce) componentPicsAdded += 1
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pageTitle: extracted.title,
    photosAdded: addedPhotos.length,
    totalPhotos: nextGallery.length,
    swatchesAdded,
    totalColours,
    swatches: addedSwatches,
    profilePicsAdded,
    componentPicsAdded,
    linksAdded,
    pdfsQueued: addedPdfs.length,
    pdfs: addedPdfs,
    jobIds: queuedJobIds,
  })
}
