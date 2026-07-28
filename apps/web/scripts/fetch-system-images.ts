#!/usr/bin/env tsx
/**
 * apps/web/scripts/fetch-system-images.ts
 *
 * Fetches og:image (or twitter:image) from each staged_system's website_url
 * and writes the result back to staged_systems.hero_image_url.
 *
 * SAFETY RULES:
 *   - LOCAL ONLY. Never run against production Supabase.
 *   - Requires LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local
 *   - Requires NEXT_PUBLIC_SUPABASE_URL pointing to 127.0.0.1 or localhost
 *   - Requires --confirm-local-write flag (or use --dry-run to preview)
 *
 * Usage:
 *   pnpm import:images -- --dry-run
 *   pnpm import:images -- --confirm-local-write
 *   pnpm import:images -- --confirm-local-write --manufacturer "James Hardie"
 *   pnpm import:images -- --confirm-local-write --overwrite
 *
 * Flags:
 *   --dry-run              Print what would be updated without writing
 *   --confirm-local-write  Required to actually write to DB
 *   --manufacturer "Name"  Limit to one manufacturer's systems
 *   --overwrite            Also update rows that already have hero_image_url set
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile } from './lib/cli.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

// ── Env loading ──────────────────────────────────────────────

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ── Safety gates ─────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ALLOW_SERVICE_ROLE = process.env.LOCAL_ONLY_ALLOW_SERVICE_ROLE === 'true'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const confirmWrite = args.includes('--confirm-local-write')
const overwrite = args.includes('--overwrite')

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx >= 0 ? args[idx + 1] : undefined
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`)
  process.exit(1)
}

if (!isDryRun) {
  if (!confirmWrite) fail('Pass --confirm-local-write to write to DB, or --dry-run to preview.')
  if (!ALLOW_SERVICE_ROLE) fail('LOCAL_ONLY_ALLOW_SERVICE_ROLE must be true in .env.local')
  if (!SUPABASE_URL) fail('NEXT_PUBLIC_SUPABASE_URL not set')
  if (!SERVICE_ROLE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY not set')
  if (!SUPABASE_URL.includes('127.0.0.1') && !SUPABASE_URL.includes('localhost')) {
    fail('SUPABASE_URL must point to localhost. This script is LOCAL ONLY.')
  }
}

const manufacturerFilter = getArg('--manufacturer')

// ── Supabase client ──────────────────────────────────────────

const supabase = isDryRun
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

// ── Image extraction ─────────────────────────────────────────

const OG_IMAGE_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
const OG_IMAGE_RE2 = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
const TWITTER_IMAGE_RE = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
const TWITTER_IMAGE_RE2 = /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i

function extractImageUrl(html: string): string | null {
  const m =
    html.match(OG_IMAGE_RE) ??
    html.match(OG_IMAGE_RE2) ??
    html.match(TWITTER_IMAGE_RE) ??
    html.match(TWITTER_IMAGE_RE2)
  return m?.[1]?.trim() ?? null
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return `https://${trimmed}`
  }
  return trimmed
}

async function fetchImageUrl(rawUrl: string): Promise<string | null> {
  const pageUrl = normalizeUrl(rawUrl)
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BuildQuoteBot/1.0; +https://buildquote.com.au)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} for ${pageUrl}`)
      return null
    }
    const html = await res.text()
    return extractImageUrl(html)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  ⚠️  Fetch error for ${pageUrl}: ${msg}`)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Main ─────────────────────────────────────────────────────

interface StagedSystem {
  id: string
  name: string
  website_url: string | null
  hero_image_url: string | null
  data_studio_manufacturers: { name: string } | { name: string }[] | null
}

async function main() {
  console.log('\n🖼️  BuildQuote — fetch-system-images')
  console.log(`   Mode: ${isDryRun ? 'DRY RUN (no DB writes)' : 'LIVE WRITE'}`)
  if (manufacturerFilter) console.log(`   Manufacturer filter: "${manufacturerFilter}"`)
  if (overwrite) console.log(`   Overwrite: yes (will re-fetch existing hero_image_url rows)`)
  console.log('')

  // Query staged_systems with manufacturer join
  let query = (isDryRun
    ? createClient(
        // In dry-run we still need to query — use env if available, else skip DB step
        SUPABASE_URL || 'http://localhost:54321',
        SERVICE_ROLE_KEY || 'anon',
        { auth: { persistSession: false, autoRefreshToken: false } }
      )
    : supabase!
  )
    .from('staged_systems')
    .select('id, name, website_url, hero_image_url, data_studio_manufacturers(name)')
    .not('website_url', 'is', null)

  if (!overwrite) {
    query = query.is('hero_image_url', null)
  }

  const { data: systems, error } = await query

  if (error) {
    // In dry-run with no DB available, just warn
    if (isDryRun && (!SUPABASE_URL || !SERVICE_ROLE_KEY)) {
      console.log('ℹ️  No DB credentials — skipping DB query in dry-run mode.')
      console.log('   Would fetch og:image from website_url for all systems where hero_image_url IS NULL')
      return
    }
    fail(`DB query failed: ${error.message}`)
  }

  const rows = (systems ?? []) as StagedSystem[]

  // Filter by manufacturer name if requested
  function getMfrName(r: StagedSystem): string {
    const raw = r.data_studio_manufacturers
    const obj = Array.isArray(raw) ? raw[0] : raw
    return (obj as { name: string } | null)?.name ?? ''
  }

  const filtered = manufacturerFilter
    ? rows.filter(r => getMfrName(r).toLowerCase().includes(manufacturerFilter.toLowerCase()))
    : rows

  if (filtered.length === 0) {
    console.log('✅ No systems to update (all already have hero_image_url, or no website_url set).')
    return
  }

  console.log(`📋 ${filtered.length} system${filtered.length !== 1 ? 's' : ''} to process\n`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < filtered.length; i++) {
    const sys = filtered[i]
    const mfrRaw = sys.data_studio_manufacturers
    const mfrObj = Array.isArray(mfrRaw) ? mfrRaw[0] : mfrRaw
    const mfr = (mfrObj as { name: string } | null)?.name ?? 'Unknown'
    const label = `[${i + 1}/${filtered.length}] ${mfr} — ${sys.name}`

    if (!sys.website_url) {
      console.log(`${label}\n  ⏭  No website_url — skip`)
      skipped++
      continue
    }

    console.log(`${label}\n  🌐 ${sys.website_url}`)

    const imageUrl = await fetchImageUrl(sys.website_url)

    if (!imageUrl) {
      console.log(`  ✗  No og:image found`)
      failed++
    } else {
      console.log(`  ✓  ${imageUrl}`)

      if (!isDryRun) {
        const { error: updateError } = await supabase!
          .from('staged_systems')
          .update({ hero_image_url: imageUrl })
          .eq('id', sys.id)

        if (updateError) {
          console.warn(`  ⚠️  DB update failed: ${updateError.message}`)
          failed++
        } else {
          updated++
        }
      } else {
        updated++ // count as "would update" in dry-run
      }
    }

    // Polite delay between requests (skip after last item)
    if (i < filtered.length - 1) {
      await sleep(1500)
    }
  }

  console.log('\n── Summary ──────────────────────────────────────')
  console.log(`  ${isDryRun ? 'Would update' : 'Updated'}: ${updated}`)
  console.log(`  Skipped (no URL): ${skipped}`)
  console.log(`  No image found:   ${failed}`)
  if (isDryRun) console.log('\n  Run with --confirm-local-write to apply changes.')
  console.log('')
}

main().catch(err => {
  console.error('\n❌ Unhandled error:', err)
  process.exit(1)
})
