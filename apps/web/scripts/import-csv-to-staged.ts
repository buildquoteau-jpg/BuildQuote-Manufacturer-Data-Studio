#!/usr/bin/env tsx
/**
 * apps/web/scripts/import-csv-to-staged.ts
 *
 * Loads ChatGPT-extracted CSVs into local Supabase staged tables.
 * Handles systems → profiles → components → system_component links in order.
 *
 * SAFETY RULES:
 *   - LOCAL ONLY. Never run against production Supabase.
 *   - Requires LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local
 *   - Requires NEXT_PUBLIC_SUPABASE_URL pointing to 127.0.0.1 or localhost
 *   - Requires --confirm-local-write flag
 *
 * Usage:
 *   pnpm import:csv -- \
 *     --manufacturer "James Hardie" \
 *     --systems    data/extractions/james-hardie/systems.csv \
 *     --profiles   data/extractions/james-hardie/profiles.csv \
 *     --components data/extractions/james-hardie/components.csv \
 *     --colours    data/extractions/james-hardie/colours.csv \
 *     --confirm-local-write
 *
 * Flags:
 *   --dry-run            Print what would be inserted without writing
 *   --confirm-local-write  Required to actually write to DB
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// scripts/ is one level under the repo root (apps/web/)
const REPO_ROOT = path.resolve(__dirname, '..')

// ── Env loading ──────────────────────────────────────────────

function loadEnvFile(filepath: string): void {
  if (!existsSync(filepath)) return
  const lines = readFileSync(filepath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ── Safety gates ─────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ALLOW_SERVICE_ROLE = process.env.LOCAL_ONLY_ALLOW_SERVICE_ROLE === 'true'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const confirmWrite = args.includes('--confirm-local-write')

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

const manufacturerName = getArg('--manufacturer')
const systemsPath = getArg('--systems')
const profilesPath = getArg('--profiles')
const componentsPath = getArg('--components')
const coloursPath = getArg('--colours')

if (!manufacturerName) fail('--manufacturer "Name" is required')
if (!systemsPath) fail('--systems <path> is required')

// ── CSV helpers ───────────────────────────────────────────────

type Row = Record<string, string>

function readCsv(filePath: string): Row[] {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath)
  if (!existsSync(fullPath)) fail(`File not found: ${fullPath}`)
  const content = readFileSync(fullPath, 'utf8')
  return parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Row[]
}

function str(v: string | undefined): string | null {
  return v && v.trim() !== '' ? v.trim() : null
}

function num(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = parseFloat(v.trim())
  return isNaN(n) ? null : n
}

function bool(v: string | undefined): boolean | null {
  if (!v || v.trim() === '') return null
  return v.trim().toLowerCase() === 'true'
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 BuildQuote CSV Import`)
  console.log(`   Manufacturer : ${manufacturerName}`)
  console.log(`   Mode         : ${isDryRun ? 'DRY RUN' : 'LIVE WRITE'}`)
  console.log(`   Systems      : ${systemsPath}`)
  console.log(`   Profiles     : ${profilesPath ?? '(skipped)'}`)
  console.log(`   Colours      : ${coloursPath ?? '(skipped)'}`)
  console.log(`   Components   : ${componentsPath ?? '(skipped)'}\n`)

  const supabase = isDryRun
    ? null
    : createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })

  // ── 1. Resolve manufacturer ──────────────────────────────

  let manufacturerId: string | null = null

  if (!isDryRun && supabase) {
    const { data: mfr, error } = await supabase
      .from('data_studio_manufacturers')
      .select('id')
      .ilike('name', manufacturerName!)
      .maybeSingle()

    if (error) fail(`Manufacturer lookup failed: ${error.message}`)

    if (!mfr) {
      console.log(`   Manufacturer not found — creating "${manufacturerName}"...`)
      const { data: created, error: createErr } = await supabase
        .from('data_studio_manufacturers')
        .insert({ name: manufacturerName })
        .select('id')
        .single()
      if (createErr) fail(`Failed to create manufacturer: ${createErr.message}`)
      manufacturerId = created.id
      console.log(`   ✅ Created manufacturer: ${manufacturerId}`)
    } else {
      manufacturerId = mfr.id
      console.log(`   ✅ Found manufacturer: ${manufacturerId}`)
    }
  }

  // ── 2. Insert systems ────────────────────────────────────

  const systemRows = readCsv(systemsPath!)
  console.log(`\n📋 Systems: ${systemRows.length} rows`)

  // Map system_name → staged_system UUID for FK resolution
  const systemIdMap: Record<string, string> = {}

  for (const row of systemRows) {
    const payload = {
      manufacturer_id: manufacturerId,
      name: str(row.name),
      product_code: str(row.product_code),
      slug: str(row.slug),
      category: str(row.category),
      subcategory: str(row.subcategory),
      description: str(row.description),
      dimensions: str(row.dimensions),
      sheet_format: str(row.sheet_format),
      website_url: str(row.website_url),
      source_label: str(row.source_label),
      source_url: str(row.source_url),
      bal_rating: str(row.bal_rating),
      acoustic_rating: str(row.acoustic_rating),
      moisture_resistant: bool(row.moisture_resistant),
      structural_grade: str(row.structural_grade),
      notes: str(row.notes),
      parser_notes: str(row.parser_notes) ? JSON.parse(row.parser_notes) : null,
      sort_order: num(row.sort_order),
      extraction_confidence: num(row.extraction_confidence),
      verification_status: str(row.verification_status) ?? 'pending_review',
      reviewer_notes: str(row.reviewer_notes),
    }

    if (isDryRun) {
      console.log(`   [dry] system: ${payload.name}`)
      // Use name as stand-in key for dry run
      systemIdMap[row.name ?? ''] = `dry-run-id-${row.sort_order}`
      continue
    }

    if (!supabase) continue

    const { data, error } = await supabase
      .from('staged_systems')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.error(`   ❌ Failed to insert system "${row.name}": ${error.message}`)
      continue
    }

    systemIdMap[row.name ?? ''] = data.id
    console.log(`   ✅ ${row.name}`)
  }

  console.log(`   → ${Object.keys(systemIdMap).length} systems inserted`)

  // ── 3. Insert profiles ───────────────────────────────────

  if (profilesPath) {
    const profileRows = readCsv(profilesPath)
    console.log(`\n📐 Profiles: ${profileRows.length} rows`)
    let ok = 0
    let skip = 0

    for (const row of profileRows) {
      const systemId = systemIdMap[row.system_name ?? '']
      if (!systemId) {
        console.warn(`   ⚠️  No system found for profile system_name="${row.system_name}" — skipping`)
        skip++
        continue
      }

      const payload = {
        staged_system_id: isDryRun ? null : systemId,
        name: str(row.name),
        profile_name: str(row.profile_name),
        product_code: str(row.product_code),
        dimensions: str(row.dimensions),
        length_m: num(row.length_m),
        sheet_format: str(row.sheet_format),
        length_mm: num(row.length_mm),
        width_mm: num(row.width_mm),
        height_mm: num(row.height_mm),
        thickness_mm: num(row.thickness_mm),
        depth_mm: num(row.depth_mm),
        gauge_mm: num(row.gauge_mm),
        diameter_mm: num(row.diameter_mm),
        roll_m: num(row.roll_m),
        weight_kg: num(row.weight_kg),
        pieces: num(row.pieces),
        pack_format: str(row.pack_format),
        supplier_pack_qty: num(row.supplier_pack_qty),
        supplier_pack_uom: str(row.supplier_pack_uom),
        supplier_pack_note: str(row.supplier_pack_note),
        bal_rating: str(row.bal_rating),
        uom: str(row.uom),
        image_url: str(row.image_url),
        website_url: str(row.website_url),
        sort_order: num(row.sort_order),
        verification_status: str(row.verification_status) ?? 'pending_review',
        reviewer_notes: str(row.reviewer_notes),
      }

      if (isDryRun) {
        console.log(`   [dry] profile: ${payload.profile_name} (${row.system_name})`)
        ok++
        continue
      }

      if (!supabase) continue

      const { error } = await supabase.from('staged_system_profiles').insert(payload)
      if (error) {
        console.error(`   ❌ Failed to insert profile "${row.profile_name}": ${error.message}`)
        skip++
      } else {
        ok++
      }
    }

    console.log(`   → ${ok} inserted, ${skip} skipped`)
  }

  // ── 4. Insert colours ────────────────────────────────────

  if (coloursPath) {
    const colourRows = readCsv(coloursPath)
    console.log(`\n🎨 Colours: ${colourRows.length} rows`)
    let ok = 0
    let skip = 0

    for (const row of colourRows) {
      const systemId = systemIdMap[row.system_name ?? '']
      if (!systemId) {
        console.warn(`   ⚠️  No system found for colour system_name="${row.system_name}" — skipping`)
        skip++
        continue
      }

      const payload = {
        staged_system_id: isDryRun ? null : systemId,
        colour_name: str(row.colour_name),
        sku: str(row.sku),
        sku_suffix: str(row.sku_suffix),
        image_url: str(row.image_url),
        is_stocked: bool(row.is_stocked),
        parser_notes: str(row.parser_notes) ? JSON.parse(row.parser_notes) : null,
        sort_order: num(row.sort_order),
        verification_status: str(row.verification_status) ?? 'pending_review',
        reviewer_notes: str(row.reviewer_notes),
      }

      if (isDryRun) {
        console.log(`   [dry] colour: ${payload.colour_name} (${row.system_name})`)
        ok++
        continue
      }

      if (!supabase) continue

      const { error } = await supabase.from('staged_system_colours').insert(payload)
      if (error) {
        console.error(`   ❌ Failed to insert colour "${row.colour_name}": ${error.message}`)
        skip++
      } else {
        ok++
      }
    }

    console.log(`   → ${ok} inserted, ${skip} skipped`)
  }

  // ── 5. Insert components + system links ──────────────────

  if (componentsPath) {
    const componentRows = readCsv(componentsPath)
    console.log(`\n🔩 Components: ${componentRows.length} rows`)

    // De-duplicate components by SKU (or name when SKU absent) — same component can appear under multiple systems
    const componentIdMap: Record<string, string> = {} // dedup key → staged_component UUID
    let newComponents = 0
    let linkedRows = 0
    let skipRows = 0

    for (const row of componentRows) {
      const sku = str(row.sku)
      // Fall back to name-based dedup when no SKU is present
      const dedupKey = sku ?? `name:${str(row.name)}`
      const systemId = systemIdMap[row.system_name ?? '']

      if (!systemId) {
        console.warn(`   ⚠️  No system found for component system_name="${row.system_name}" — skipping link`)
        skipRows++
        continue
      }

      // Insert component only once per dedup key
      if (dedupKey && !componentIdMap[dedupKey]) {
        const payload = {
          manufacturer_id: manufacturerId,
          sku,
          name: str(row.name),
          description: str(row.description),
          category: str(row.category),
          uom: str(row.uom),
          length_mm: num(row.length_mm),
          width_mm: num(row.width_mm),
          height_mm: num(row.height_mm),
          thickness_mm: num(row.thickness_mm),
          depth_mm: num(row.depth_mm),
          gauge_mm: num(row.gauge_mm),
          diameter_mm: num(row.diameter_mm),
          roll_m: num(row.roll_m),
          weight_kg: num(row.weight_kg),
          pieces: num(row.pieces) ? Math.round(num(row.pieces)!) : null,
          volume_ml: num(row.volume_ml),
          weight_g: num(row.weight_g),
          pack_format: str(row.pack_format),
          supplier_pack_qty: num(row.supplier_pack_qty),
          supplier_pack_uom: str(row.supplier_pack_uom),
          supplier_pack_note: str(row.supplier_pack_note),
          material: str(row.material),
          finish: str(row.finish),
          colour: str(row.colour),
          profile: str(row.profile),
          texture: str(row.texture),
          coverage_m2: num(row.coverage_m2),
          image_url: str(row.image_url),
          website_url: str(row.website_url),
          parser_notes: str(row.parser_notes) ? JSON.parse(row.parser_notes) : null,
          sort_order: num(row.sort_order),
          extraction_confidence: num(row.extraction_confidence),
          verification_status: str(row.verification_status) ?? 'pending_review',
          reviewer_notes: str(row.reviewer_notes),
        }

        if (isDryRun) {
          componentIdMap[dedupKey] = `dry-run-component-${dedupKey}`
          console.log(`   [dry] component: ${payload.name} (${sku ?? 'no-sku'})`)
        } else if (supabase) {
          const { data, error } = await supabase
            .from('staged_components')
            .insert(payload)
            .select('id')
            .single()

          if (error) {
            console.error(`   ❌ Failed to insert component "${row.name}": ${error.message}`)
            continue
          }
          componentIdMap[dedupKey] = data.id
        }

        newComponents++
      }

      // Insert system ↔ component link
      const componentId = componentIdMap[dedupKey] ?? null
      if (!componentId) continue

      const linkPayload = {
        staged_system_id: isDryRun ? null : systemId,
        staged_component_id: isDryRun ? null : componentId,
        role: str(row.category),
        verification_status: 'pending_review',
      }

      if (!isDryRun && supabase) {
        const { error } = await supabase.from('staged_system_components').insert(linkPayload)
        if (error) {
          console.error(`   ❌ Failed to link component "${row.name}" to "${row.system_name}": ${error.message}`)
          skipRows++
          continue
        }
      }

      linkedRows++
    }

    console.log(`   → ${newComponents} unique components, ${linkedRows} system links, ${skipRows} skipped`)
  }

  console.log(`\n✅ Import complete.\n`)
}

main().catch((err) => {
  console.error('\n❌ Unexpected error:', err)
  process.exit(1)
})
