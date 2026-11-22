// 1-Click "Import from Product Page URL" for manufacturer self-serve setup.
//
// Given a single official product page URL (e.g.
// https://www.jameshardie.com.au/products/hardiedeck-system), this route:
//   1. Fetches the HTML (including embedded __NEXT_DATA__ / JSON-LD / og:image)
//   2. Non-destructively adds the product page link to custom_document_links
//      (and sets website_url if blank)
//   3. Extracts clean product/gallery photos (up to 10 total) and appends them
//      to staged_systems.gallery_images (setting hero_image_url if blank)
//   4. Discovers linked PDF guides (install, sealing/design, technical data,
//      warranty/brochure), auto-classifies each role, creates source_documents +
//      system_sources rows, and enqueues fetch_url -> docling -> auto_chain
//      (system_identity_parser + knowledge_parser) on the cloud worker.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_GALLERY = 10
const MAX_PDFS = 8

type SystemSourceRole = 'install_guide' | 'design_guide' | 'tech_data' | 'source_catalogue'

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
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
}

function resolveUrl(raw: string, base: URL): string | null {
  try {
    const cleaned = decodeHtmlEntities(raw.trim())
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:') || cleaned.startsWith('mailto:')) {
      return null
    }
    const u = new URL(cleaned, base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (isBlockedHost(u.hostname)) return null
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

function looksLikeUsefulProductPhoto(urlStr: string): boolean {
  const lower = urlStr.toLowerCase()
  if (!/\.(jpg|jpeg|png|webp|avif)(\?|$|#)/i.test(lower) && !/ctfassets\.net|cloudinary\.com|imgix\.net/i.test(lower)) {
    return false
  }
  if (/\.svg(\?|$)|favicon|logo|icon|sprite|avatar|badge|social|facebook|instagram|linkedin|youtube|pinterest|pixel|tracking|analytics|spacer|placeholder|arrow|chevron|close|menu|search/i.test(lower)) {
    return false
  }
  return true
}

function extractPageAssets(html: string, baseUrl: URL, systemName: string): {
  title: string
  images: { url: string; alt: string }[]
  pdfs: { url: string; label: string; role: SystemSourceRole }[]
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : systemName
  const title = rawTitle.split(/\s*[|–—-]\s*/)[0]?.trim() || systemName

  const images: { url: string; alt: string }[] = []
  const seenImg = new Set<string>()
  const pushImg = (rawUrl: string, alt: string) => {
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved) return
    const key = resolved.split('#')[0]
    if (seenImg.has(key) || !looksLikeUsefulProductPhoto(resolved)) return
    seenImg.add(key)
    images.push({ url: resolved, alt: alt.trim() || systemName })
  }

  // 1) og:image & twitter:image first (almost always the best hero shot)
  for (const m of Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi))) {
    pushImg(m[1], `${systemName} hero`)
  }
  for (const m of Array.from(html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi))) {
    pushImg(m[1], `${systemName} hero`)
  }

  // 2) Standard <img> tags
  for (const m of Array.from(html.matchAll(/<img\b[^>]*>/gi))) {
    const tag = m[0]
    const srcM = tag.match(/\b(?:src|data-src)=["']([^"']+)["']/i)
    if (!srcM) continue
    const altM = tag.match(/\balt=["']([^"']*)["']/i)
    pushImg(srcM[1], altM ? decodeHtmlEntities(altM[1]) : systemName)
  }

  // 3) Embedded CMS image URLs (Contentful / Cloudinary / direct jpg/webp in __NEXT_DATA__)
  for (const m of Array.from(html.matchAll(/(?:https?:)?\/\/(?:images\.ctfassets\.net|res\.cloudinary\.com)[^\s"'\\<>]+/gi))) {
    const raw = m[0].startsWith('//') ? `https:${m[0]}` : m[0]
    pushImg(raw, systemName)
  }

  // 4) PDF links from <a href> and embedded JSON/CMS asset strings
  // Deduplicate by BOTH canonical URL (without query/hash) AND normalized
  // filename/label so pages that link the same PDF in multiple tabs/JSON blobs
  // only ever enqueue it once.
  const pdfs: { url: string; label: string; role: SystemSourceRole }[] = []
  const seenPdfKeys = new Set<string>()
  const pushPdf = (rawUrl: string, anchorText?: string) => {
    const resolved = resolveUrl(rawUrl, baseUrl)
    if (!resolved) return
    const urlNoQuery = resolved.split(/[?#]/)[0].toLowerCase()
    if (!/\.pdf$/i.test(urlNoQuery)) return
    const fileKey = normDocKey(urlNoQuery)
    const cleanedAnchor = anchorText ? decodeHtmlEntities(anchorText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : ''
    const label = cleanedAnchor && cleanedAnchor.length >= 4 && !/^(download|view|open|pdf|click here)$/i.test(cleanedAnchor)
      ? cleanedAnchor.slice(0, 140)
      : deriveLabel(resolved, `${systemName} document`)
    const labelKey = normDocKey(label)
    if (seenPdfKeys.has(urlNoQuery) || (fileKey && seenPdfKeys.has(`file:${fileKey}`)) || (labelKey && seenPdfKeys.has(`label:${labelKey}`))) {
      return
    }
    seenPdfKeys.add(urlNoQuery)
    if (fileKey) seenPdfKeys.add(`file:${fileKey}`)
    if (labelKey) seenPdfKeys.add(`label:${labelKey}`)
    pdfs.push({ url: resolved, label, role: guessPdfRole(`${label} ${resolved}`) })
  }

  for (const m of Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    pushPdf(m[1], m[2])
  }
  for (const m of Array.from(html.matchAll(/(?:https?:)?\/\/[^\s"'\\<>]+\.pdf(?:\?[^\s"'\\<>]*)?/gi))) {
    const raw = m[0].startsWith('//') ? `https:${m[0]}` : m[0]
    pushPdf(raw)
  }

  return {
    title,
    images: images.slice(0, MAX_GALLERY),
    pdfs: pdfs.slice(0, MAX_PDFS),
  }
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
  } | null

  const manufacturerId = body?.manufacturerId
  const rawUrl = body?.url?.trim()
  const autoExtract = body?.autoExtract !== false

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

  // Merge photos non-destructively (up to 10 total)
  const existingGallery: GalleryPhoto[] = Array.isArray(sys.gallery_images) ? sys.gallery_images : []
  const existingImgUrls = new Set(existingGallery.map((g) => g.url))
  const addedPhotos: GalleryPhoto[] = []
  for (const img of extracted.images) {
    if (existingGallery.length + addedPhotos.length >= MAX_GALLERY) break
    if (existingImgUrls.has(img.url)) continue
    existingImgUrls.add(img.url)
    addedPhotos.push({
      asset_id: null,
      url: img.url,
      alt: img.alt,
      position_x: 50,
      position_y: 50,
      zoom: 1,
    })
  }
  const nextGallery = [...existingGallery, ...addedPhotos]

  // Merge product page link non-destructively
  const existingLinks: CustomDocumentLink[] = Array.isArray(sys.custom_document_links) ? sys.custom_document_links : []
  const existingLinkUrls = new Set(existingLinks.map((l) => l.url))
  const nextLinks = [...existingLinks]
  let linksAdded = 0
  if (!existingLinkUrls.has(finalUrl.toString())) {
    nextLinks.unshift({
      label: `${extracted.title} — Official Product Page`,
      url: finalUrl.toString(),
      type: 'product_page',
    })
    linksAdded += 1
  }

  const sysPatch: Record<string, unknown> = {}
  if (addedPhotos.length > 0) sysPatch.gallery_images = nextGallery
  if (!sys.hero_image_url && nextGallery[0]?.url) sysPatch.hero_image_url = nextGallery[0].url
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

  // Register & queue discovered PDFs (deduped against existing system_sources
  // by URL, filename, AND normalized label so already-uploaded local PDFs are
  // never re-queued).
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

  const queuedJobIds: string[] = []
  const addedPdfs: { label: string; role: SystemSourceRole; url: string }[] = []

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

  return NextResponse.json({
    ok: true,
    pageTitle: extracted.title,
    photosAdded: addedPhotos.length,
    totalPhotos: nextGallery.length,
    linksAdded,
    pdfsQueued: addedPdfs.length,
    pdfs: addedPdfs,
    jobIds: queuedJobIds,
  })
}
