// Static System Card website package builder — the ZIP a manufacturer
// installs on their own website (default /system-cards/). Pure assembly:
// callers resolve all remote data first (Supabase rows → SystemCardSystem,
// asset ids → downloaded bytes) and hand plain values in, so this module runs
// identically in a server action and in the local fixture script
// (scripts/build-package-fixture.ts) with no Supabase/R2 access.
//
// ZIP layout (all paths relative — every page works over file://):
//
//   system-cards/
//     index.html            branded collection page (tile grid)
//     feed.json             machine-readable card feed (future static embeds)
//     manifest.json         file inventory + build metadata
//     README.md
//     install-guide.html
//     card-link-list.csv
//     embed-snippets.html
//     assets/
//       system-card.js      bundled renderer (React included, IIFE)
//       site.css            base page styles
//       logo.<ext>          manufacturer logo (when provided)
//       brand-hero.<ext>    collection-page hero (when provided)
//     cards/<slug>/
//       index.html          full System Card page
//       card.json           the card's SystemCardSystem JSON (local asset paths)
//       qr-code.png         points at the card's public URL on the manufacturer site
//       assets/hero.<ext>…  card-local images

import JSZip from 'jszip'
import QRCode from 'qrcode'
import { createHash } from 'crypto'
import type {
  SystemCardSystem,
  SystemCardManufacturerPage,
} from '@/components/system-card-renderer/types'
import type { StaticCardData, StaticCollectionData } from '@/components/system-card-renderer/static/StaticPages'

export type PackageFile = {
  /** File name inside the owning assets folder, e.g. "hero.webp". */
  fileName: string
  bytes: Uint8Array
}

export type PackageCardInput = {
  slug: string
  /** Card data with ORIGINAL image URLs — the builder rewrites them to local paths. */
  system: SystemCardSystem
  /** Downloaded hero image, if the card has one the package should bundle. */
  heroAsset: PackageFile | null
}

export type PackageBuildInput = {
  manufacturer: SystemCardManufacturerPage
  cards: PackageCardInput[]
  /** Manufacturer logo bytes (assets/logo.<ext>), when available. */
  logoAsset: PackageFile | null
  /** Collection-page hero bytes (assets/brand-hero.<ext>), when available. */
  brandHeroAsset: PackageFile | null
  /** The prebuilt renderer bundle (lib/packages/generated/system-card-bundle.ts). */
  bundleJs: string
  /** e.g. "https://manufacturer.com.au" — QR codes/links need it. Null = placeholders. */
  websiteBaseUrl: string | null
  /** Where the folder will live on the manufacturer site. Default /system-cards/. */
  installPath?: string
  packageVersion: number
  generatedAtIso: string
}

export type PackageBuildItem = {
  slug: string
  name: string
  cardPath: string   // cards/<slug>/index.html
  jsonPath: string   // cards/<slug>/card.json
  qrPath: string     // cards/<slug>/qr-code.png
  publicUrl: string | null
}

export type PackageBuildResult = {
  zip: Buffer
  checksum: string   // sha256 hex of the zip bytes
  items: PackageBuildItem[]
  fileCount: number
  buildLog: string[]
}

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'

const SITE_CSS = `/* BuildQuote System Card package — base page styles */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #f5f7f9; }
body { font-family: 'Barlow', -apple-system, 'Segoe UI', sans-serif; color: #0f172a; }
#root { min-height: 100vh; }
.bq-noscript { max-width: 640px; margin: 60px auto; padding: 0 24px; font-size: 15px; line-height: 1.6; color: #334155; }
`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// JSON destined for an inline <script> block — escape "<" so "</script>" in
// data can never terminate the tag.
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function normaliseInstallPath(p: string | undefined): string {
  let path = (p ?? '/system-cards/').trim() || '/system-cards/'
  if (!path.startsWith('/')) path = `/${path}`
  if (!path.endsWith('/')) path = `${path}/`
  return path
}

function normaliseBaseUrl(u: string | null): string | null {
  if (!u) return null
  const trimmed = u.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function pageHtml(opts: {
  title: string
  description: string | null
  assetsPrefix: string  // "./" (collection) or "../../" (card pages)
  data: StaticCollectionData | StaticCardData
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
${opts.description ? `<meta name="description" content="${escapeHtml(opts.description)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${FONTS_HREF}">
<link rel="stylesheet" href="${opts.assetsPrefix}assets/site.css">
</head>
<body>
<div id="root"><noscript><div class="bq-noscript">This System Card needs JavaScript enabled. The same product data is available in <a href="card.json">card.json</a>.</div></noscript></div>
<script id="__SYSTEM_CARD_DATA__" type="application/json">${inlineJson(opts.data)}</script>
<script src="${opts.assetsPrefix}assets/system-card.js"></script>
</body>
</html>
`
}

// Rewrite a card's image URLs to paths relative to a given page location.
function localiseSystem(
  card: PackageCardInput,
  heroPrefix: string,       // "./assets/" on the card page, "./cards/<slug>/assets/" on the collection page
  logoPath: string | null,  // manufacturer logo relative to the same page
): SystemCardSystem {
  return {
    ...card.system,
    hero_image_url: card.heroAsset
      ? `${heroPrefix}${card.heroAsset.fileName}`
      : card.system.hero_image_url,
    manufacturer: card.system.manufacturer
      ? { ...card.system.manufacturer, logo_url: logoPath }
      : card.system.manufacturer,
  }
}

export async function buildPackageZip(input: PackageBuildInput): Promise<PackageBuildResult> {
  const log: string[] = []
  const zip = new JSZip()
  const root = zip.folder('system-cards')!
  const installPath = normaliseInstallPath(input.installPath)
  const baseUrl = normaliseBaseUrl(input.websiteBaseUrl)
  const storageKeySuffix = input.manufacturer.slug || 'cards'
  const storageKey = `bq-shopping-list:${storageKeySuffix}`

  if (!baseUrl) {
    log.push('WARN: no public website URL — QR codes and embed snippets use a placeholder address.')
  }
  const effectiveBase = baseUrl ?? 'https://your-website.com.au'
  const collectionUrl = `${effectiveBase}${installPath}`

  // ── Shared assets ──
  root.file('assets/site.css', SITE_CSS)
  root.file('assets/system-card.js', input.bundleJs)

  let logoRootPath: string | null = null // relative to /system-cards/
  if (input.logoAsset) {
    root.file(`assets/${input.logoAsset.fileName}`, input.logoAsset.bytes)
    logoRootPath = `assets/${input.logoAsset.fileName}`
  } else {
    log.push('Note: no logo asset — pages show the brand name as text.')
  }

  let brandHeroRootPath: string | null = null
  if (input.brandHeroAsset) {
    root.file(`assets/${input.brandHeroAsset.fileName}`, input.brandHeroAsset.bytes)
    brandHeroRootPath = `assets/${input.brandHeroAsset.fileName}`
  }

  // ── Card pages ──
  const items: PackageBuildItem[] = []
  const feedCards: Array<Record<string, unknown>> = []

  for (const card of input.cards) {
    const dir = root.folder(`cards/${card.slug}`)!
    const publicUrl = baseUrl ? `${baseUrl}${installPath}cards/${card.slug}/` : null

    if (card.heroAsset) {
      dir.file(`assets/${card.heroAsset.fileName}`, card.heroAsset.bytes)
    } else if (card.system.hero_image_url) {
      log.push(`WARN: ${card.system.name} — hero image could not be bundled; the card renders without one.`)
    }

    // Card page: assets live beside the page, logo two levels up.
    const cardPageSystem = localiseSystem(
      { ...card, system: card.heroAsset ? card.system : { ...card.system, hero_image_url: null } },
      './assets/',
      logoRootPath ? `../../${logoRootPath}` : null,
    )
    const cardData: StaticCardData = {
      mode: 'card',
      manufacturer: {
        ...input.manufacturer,
        logo_url: logoRootPath ? `../../${logoRootPath}` : null,
        hero_image_url: null,
        hero_wide_image_url: null,
      },
      system: cardPageSystem,
      backHref: '../../index.html',
      storageKey,
    }
    dir.file('index.html', pageHtml({
      title: `${card.system.name} — ${input.manufacturer.name} System Card`,
      description: card.system.description,
      assetsPrefix: '../../',
      data: cardData,
    }))

    // card.json — same local-path shape the page uses (portable data contract).
    dir.file('card.json', JSON.stringify(cardPageSystem, null, 2))

    // QR code → the card's public URL on the manufacturer's website.
    const qrTarget = publicUrl ?? `${effectiveBase}${installPath}cards/${card.slug}/`
    const qrPng = await QRCode.toBuffer(qrTarget, {
      type: 'png', width: 512, margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
    dir.file('qr-code.png', qrPng)

    items.push({
      slug: card.slug,
      name: card.system.name,
      cardPath: `cards/${card.slug}/index.html`,
      jsonPath: `cards/${card.slug}/card.json`,
      qrPath: `cards/${card.slug}/qr-code.png`,
      publicUrl,
    })

    feedCards.push({
      slug: card.slug,
      name: card.system.name,
      category: card.system.category,
      subcategory: card.system.subcategory,
      description: card.system.description,
      path: `cards/${card.slug}/`,
      json: `cards/${card.slug}/card.json`,
      url: publicUrl,
    })
  }

  // ── Collection page ──
  const collectionData: StaticCollectionData = {
    mode: 'collection',
    manufacturer: {
      ...input.manufacturer,
      logo_url: logoRootPath ? `./${logoRootPath}` : null,
      hero_image_url: brandHeroRootPath ? `./${brandHeroRootPath}` : null,
      hero_wide_image_url: null,
    },
    cards: input.cards.map((card) => ({
      href: `./cards/${card.slug}/index.html`,
      system: localiseSystem(card, `./cards/${card.slug}/assets/`, logoRootPath ? `./${logoRootPath}` : null),
    })),
    storageKey,
  }
  root.file('index.html', pageHtml({
    title: `${input.manufacturer.name} System Cards`,
    description: input.manufacturer.description,
    assetsPrefix: './',
    data: collectionData,
  }))

  // ── feed.json ──
  root.file('feed.json', JSON.stringify({
    format: 'buildquote-system-card-feed',
    version: 1,
    generated_at: input.generatedAtIso,
    package_version: input.packageVersion,
    install_path: installPath,
    site_url: baseUrl,
    manufacturer: {
      name: input.manufacturer.name,
      slug: input.manufacturer.slug,
      description: input.manufacturer.description,
      website_url: input.manufacturer.website_url,
      logo: logoRootPath,
    },
    cards: feedCards,
  }, null, 2))

  // ── card-link-list.csv ──
  const csvEscape = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
  const csvLines = [
    'Card,Category,Public URL,Card page,QR code',
    ...items.map((item) => {
      const card = input.cards.find((c) => c.slug === item.slug)!
      return [
        csvEscape(item.name),
        csvEscape(card.system.category),
        csvEscape(item.publicUrl ?? `${collectionUrl}cards/${item.slug}/ (set your website URL in Brand Profile)`),
        csvEscape(item.cardPath),
        csvEscape(item.qrPath),
      ].join(',')
    }),
  ]
  root.file('card-link-list.csv', csvLines.join('\r\n') + '\r\n')

  // ── embed-snippets.html ──
  root.file('embed-snippets.html', buildEmbedSnippetsHtml(input.manufacturer.name, collectionUrl, items, !baseUrl))

  // ── install-guide.html ──
  root.file('install-guide.html', buildInstallGuideHtml(input.manufacturer.name, installPath, collectionUrl, items.length))

  // ── README.md ──
  root.file('README.md', buildReadme(input, installPath, collectionUrl, items))

  // ── manifest.json ──
  const fileList: string[] = []
  zip.forEach((relativePath, entry) => { if (!entry.dir) fileList.push(relativePath) })
  fileList.sort()
  root.file('manifest.json', JSON.stringify({
    format: 'buildquote-system-card-package',
    version: 1,
    package_version: input.packageVersion,
    generated_at: input.generatedAtIso,
    manufacturer: input.manufacturer.slug,
    install_path: installPath,
    site_url: baseUrl,
    card_count: items.length,
    cards: items.map((i) => ({ slug: i.slug, name: i.name, path: i.cardPath })),
    files: fileList,
  }, null, 2))

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const checksum = createHash('sha256').update(zipBuffer).digest('hex')
  const fileCount = fileList.length + 1 // + manifest.json (added after listing)

  log.push(`Built package v${input.packageVersion}: ${items.length} card(s), ${fileCount} files, ${(zipBuffer.length / 1024).toFixed(0)} KB.`)

  return { zip: zipBuffer, checksum, items, fileCount, buildLog: log }
}

// ─── Static documents ─────────────────────────────────────────────────────────

const DOC_CSS = `body{font-family:'Barlow',-apple-system,'Segoe UI',sans-serif;max-width:760px;margin:0 auto;padding:40px 24px;color:#0f172a;line-height:1.65}
h1{font-size:28px;letter-spacing:-0.02em}h2{font-size:19px;margin-top:32px}
code,pre{background:#f1f5f9;border-radius:6px;font-size:13px}code{padding:2px 6px}
pre{padding:14px 16px;overflow-x:auto;border:1px solid #e2e8f0}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
.note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;font-size:14px}`

function buildInstallGuideHtml(
  manufacturerName: string,
  installPath: string,
  collectionUrl: string,
  cardCount: number,
): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Install guide — ${escapeHtml(manufacturerName)} System Cards</title>
<link rel="stylesheet" href="${FONTS_HREF}"><style>${DOC_CSS}</style></head><body>
<h1>Installing your System Card website package</h1>
<p>This folder is a complete, self-contained mini-website with ${cardCount} System Card${cardCount === 1 ? '' : 's'} for ${escapeHtml(manufacturerName)}. It has no server code and no database — it is plain HTML, JavaScript and images, so it can be hosted anywhere.</p>
<h2>1. Upload the folder</h2>
<p>Upload the entire <code>system-cards</code> folder to your website so it is reachable at:</p>
<pre>${escapeHtml(collectionUrl)}</pre>
<p>How you upload depends on your hosting: your web developer, cPanel / hosting file manager, FTP/SFTP, or your CMS's static file area. The folder must keep its internal structure (<code>assets/</code>, <code>cards/</code>).</p>
<h2>2. Check it works</h2>
<p>Open <a href="${escapeHtml(collectionUrl)}">${escapeHtml(collectionUrl)}</a> in a browser. You should see your branded collection page; every tile opens a full System Card with selectable line items, a shopping list and PNG sharing — all running in the visitor's browser.</p>
<h2>3. Link it from your site</h2>
<ul>
<li>Add a menu item (e.g. <strong>System Cards</strong>) pointing at <code>${escapeHtml(installPath)}</code>.</li>
<li><code>card-link-list.csv</code> has the direct URL for every card — use them in quotes, emails and spec documents.</li>
<li>Each card folder contains a print-ready <code>qr-code.png</code> pointing at that card's page.</li>
<li><code>embed-snippets.html</code> has copy-paste iframe/button snippets for pages that should surface a single card.</li>
</ul>
<h2>Updating</h2>
<p>When your cards change, generate a new package in BuildQuote Data Studio and replace the whole <code>system-cards</code> folder. Never edit files inside the folder by hand — changes are lost on the next update.</p>
<div class="note">Using Wix or a builder that can't host uploaded folders? Use the <em>Embeds &amp; Links</em> options in BuildQuote Data Studio instead.</div>
</body></html>
`
}

function buildEmbedSnippetsHtml(
  manufacturerName: string,
  collectionUrl: string,
  items: PackageBuildItem[],
  usingPlaceholder: boolean,
): string {
  const cardBlocks = items.map((item) => {
    const url = item.publicUrl ?? `${collectionUrl}cards/${item.slug}/`
    return `<h2>${escapeHtml(item.name)}</h2>
<p>Link button:</p>
<pre>${escapeHtml(`<a href="${url}" target="_blank" rel="noopener"
   style="display:inline-block;padding:10px 22px;background:#185D7A;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-family:sans-serif">
  View ${item.name} System Card
</a>`)}</pre>
<p>Iframe embed (for pages that should show the card inline):</p>
<pre>${escapeHtml(`<iframe src="${url}" title="${item.name} System Card"
        style="width:100%;min-height:900px;border:1px solid #d1d9e0;border-radius:12px"
        loading="lazy"></iframe>`)}</pre>`
  }).join('\n')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Embed snippets — ${escapeHtml(manufacturerName)} System Cards</title>
<link rel="stylesheet" href="${FONTS_HREF}"><style>${DOC_CSS}</style></head><body>
<h1>Embed &amp; link snippets</h1>
${usingPlaceholder ? `<div class="note"><strong>Heads up:</strong> these snippets use a placeholder address because no website URL is set in your Brand Profile. Set it and regenerate the package to get real URLs.</div>` : ''}
<p>These snippets assume the package is installed at <code>${escapeHtml(collectionUrl)}</code>.</p>
<h2>Collection page</h2>
<pre>${escapeHtml(`<a href="${collectionUrl}" target="_blank" rel="noopener">Browse all ${manufacturerName} System Cards</a>`)}</pre>
${cardBlocks}
</body></html>
`
}

function buildReadme(
  input: PackageBuildInput,
  installPath: string,
  collectionUrl: string,
  items: PackageBuildItem[],
): string {
  return `# ${input.manufacturer.name} — System Card website package

Generated by BuildQuote Data Studio on ${input.generatedAtIso} (package v${input.packageVersion}).

This folder is a self-contained static website: HTML + JavaScript + images,
no server code, no database. Install it on your website at:

    ${collectionUrl}

Read **install-guide.html** for step-by-step instructions.

## What's inside

| Path | Purpose |
|---|---|
| index.html | Branded collection page listing every card |
| cards/<slug>/index.html | One full System Card page per product system |
| cards/<slug>/card.json | The card's data as plain JSON |
| cards/<slug>/qr-code.png | Print-ready QR code pointing at the card's page |
| assets/ | Shared renderer script, styles and brand images |
| feed.json | Machine-readable list of all cards (for embeds/integrations) |
| manifest.json | File inventory + build metadata |
| card-link-list.csv | Every card's public URL in spreadsheet form |
| embed-snippets.html | Copy-paste link/iframe snippets |
| install-guide.html | How to install and link the package |

## Cards in this package

${items.map((i) => `- ${i.name} (${installPath}cards/${i.slug}/)`).join('\n')}

## Updating

Generate a new package in BuildQuote Data Studio and replace this whole
folder. Do not hand-edit files here — changes are lost on the next update.
`
}
