#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-verify-local-insert.ts
 *
 * Local-only read-only verification CLI. Queries the local Supabase DB for
 * staged rows produced by a previous parser:insert-local run and prints a
 * count/coverage summary. Optionally compares against a parser:insert-preview
 * report to verify expected vs actual row counts.
 *
 * SAFETY RULES:
 *   - Read-only. No DB writes.
 *   - Local only. Never run against production Supabase.
 *   - Uses service role for local reads (gated by LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
 *     and local URL check) because parser_field_evidence has no anon GRANT
 *     (migration 008 added the table but did not add RLS policies until migration 016;
 *     the service role bypasses this for verification-only reads).
 *   - Prints counts and summaries only. Never prints env values, keys, or payloads.
 *
 * Usage:
 *   pnpm parser:verify-local-insert -- --document <source_document_id>
 *
 * Optional:
 *   --preview ".local/parser-insert-previews/<preview>.json"
 *   --extraction-run <extraction_run_id>
 *   --strict   Exit non-zero if counts do not match preview, orphan links exist,
 *              or any required rows are missing.
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, parseArgs } from './lib/cli.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ----------------------------------------------------------
// Env loading
// ----------------------------------------------------------

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ----------------------------------------------------------
// Helpers
// ----------------------------------------------------------

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const h = parsed.hostname
    return h === '127.0.0.1' || h === 'localhost' || h === '::1'
  } catch {
    return false
  }
}

function resolveDotLocal(p: string): string {
  return p.startsWith('.local/')
    ? path.join(REPO_ROOT, p)
    : path.resolve(p)
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n)
}

// ----------------------------------------------------------
// Main
// ----------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const strict = args['strict'] === true

  console.log('parser:verify-local-insert — read-only DB verification')
  console.log('=======================================================')

  // ── Safety gates (read-only, but still local-only + service role) ──────────
  if (process.env['LOCAL_ONLY_ALLOW_SERVICE_ROLE'] !== 'true') {
    console.error('[GATE FAIL] LOCAL_ONLY_ALLOW_SERVICE_ROLE must be true in .env.local')
    console.error('  This script uses the service role for local reads (parser_field_evidence')
    console.error('  requires service role until migration 016 is applied and anon GRANT confirmed).')
    process.exit(1)
  }

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
  if (!isLocalUrl(supabaseUrl)) {
    console.error('[GATE FAIL] NEXT_PUBLIC_SUPABASE_URL must be a local Supabase instance.')
    console.error('  Never run verification scripts against production Supabase.')
    process.exit(1)
  }

  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  if (!serviceKey) {
    console.error('[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set in .env.local')
    process.exit(1)
  }

  const documentId = args['document'] as string | undefined
  if (!documentId) {
    console.error('[ERROR] --document <source_document_id> is required')
    process.exit(1)
  }

  const previewArg = args['preview'] as string | undefined
  const extractionRunArg = args['extraction-run'] as string | undefined

  console.log(`\n  document: ${documentId}`)
  if (extractionRunArg) console.log(`  extraction_run: ${extractionRunArg}`)
  if (previewArg) console.log(`  preview: ${previewArg}`)
  console.log(`  strict: ${strict}`)
  console.log()

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Verify document exists ────────────────────────────────────────────────
  const { data: docRow, error: docErr } = await supabase
    .from('source_documents')
    .select('id, document_name, manufacturer_id, status')
    .eq('id', documentId)
    .maybeSingle()

  if (docErr) {
    console.error(`[ERROR] DB error checking document: ${docErr.message}`)
    process.exit(1)
  }
  if (!docRow) {
    console.error(`[ERROR] No source_document found for id=${documentId}`)
    if (strict) process.exit(1)
    return
  }

  type DocRow = { id: string; document_name: string; manufacturer_id: string; status: string }
  const doc = docRow as DocRow
  const manufacturerId = doc.manufacturer_id

  console.log(`  document_name: ${doc.document_name}`)
  console.log(`  manufacturer_id: ${manufacturerId}`)
  console.log(`  status: ${doc.status}`)
  console.log()

  // ── Resolve extraction_run_id ─────────────────────────────────────────────
  let extractionRunId = extractionRunArg ?? null

  if (!extractionRunId) {
    const { data: runRows } = await supabase
      .from('extraction_runs')
      .select('id, run_type, status, started_at, completed_at')
      .eq('source_document_id', documentId)
      .eq('run_type', 'parse_systems')
      .order('created_at', { ascending: false })
      .limit(1)

    type RunRow = { id: string; run_type: string; status: string; started_at: string | null; completed_at: string | null }
    const runs = (runRows ?? []) as RunRow[]
    if (runs.length > 0) {
      extractionRunId = runs[0].id
      console.log(`  extraction_run_id: ${extractionRunId}`)
      console.log(`  run_type: ${runs[0].run_type}`)
      console.log(`  run_status: ${runs[0].status}`)
    } else {
      console.log('  extraction_run: none found for run_type=parse_systems')
    }
    console.log()
  }

  // ── Staged systems ────────────────────────────────────────────────────────
  const { count: sysCnt, error: sysErr } = await supabase
    .from('staged_systems')
    .select('id', { count: 'exact', head: true })
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)

  const { data: sysIdRows } = await supabase
    .from('staged_systems')
    .select('id')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)

  type IdRow = { id: string }
  const systemIds = ((sysIdRows ?? []) as IdRow[]).map((r) => r.id)

  // ── Staged components ─────────────────────────────────────────────────────
  const { count: compCnt } = await supabase
    .from('staged_components')
    .select('id', { count: 'exact', head: true })
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)

  const { data: compIdRows } = await supabase
    .from('staged_components')
    .select('id')
    .eq('source_document_id', documentId)
    .eq('manufacturer_id', manufacturerId)

  const componentIds = new Set(((compIdRows ?? []) as IdRow[]).map((r) => r.id))

  // ── Child tables ──────────────────────────────────────────────────────────
  let profCnt = 0
  let colCnt = 0
  let linkCnt = 0
  let orphanLinkCount = 0

  if (systemIds.length > 0) {
    const [profRes, colRes, linkRes] = await Promise.all([
      supabase.from('staged_system_profiles').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds),
      supabase.from('staged_system_colours').select('*', { count: 'exact', head: true }).in('staged_system_id', systemIds),
      supabase.from('staged_system_components').select('id, staged_component_id').in('staged_system_id', systemIds),
    ])
    profCnt = profRes.count ?? 0
    colCnt = colRes.count ?? 0

    type LinkRow = { id: string; staged_component_id: string }
    const links = (linkRes.data ?? []) as LinkRow[]
    linkCnt = links.length
    orphanLinkCount = links.filter((l) => !componentIds.has(l.staged_component_id)).length
  }

  // ── field_verifications ───────────────────────────────────────────────────
  const { count: fvCnt } = await supabase
    .from('field_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('source_document_id', documentId)

  // ── parser_field_evidence ─────────────────────────────────────────────────
  let pfeCnt = 0
  if (extractionRunId) {
    const { count } = await supabase
      .from('parser_field_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('extraction_run_id', extractionRunId)
    pfeCnt = count ?? 0
  }

  // ── Duplicate checks ──────────────────────────────────────────────────────
  let duplicateProductCodes = 0
  let duplicateSkus = 0

  if (systemIds.length > 0) {
    const { data: sysCodeData } = await supabase
      .from('staged_systems')
      .select('product_code')
      .eq('source_document_id', documentId)
      .eq('manufacturer_id', manufacturerId)
      .not('product_code', 'is', null)

    type CodeRow = { product_code: string | null }
    const codes = ((sysCodeData ?? []) as CodeRow[]).map((r) => r.product_code).filter(Boolean)
    const codeSet = new Set<string>()
    const dupeCodeSet = new Set<string>()
    for (const c of codes) {
      if (codeSet.has(c!)) dupeCodeSet.add(c!)
      codeSet.add(c!)
    }
    duplicateProductCodes = dupeCodeSet.size
  }

  if ((compCnt ?? 0) > 0) {
    const { data: skuData } = await supabase
      .from('staged_components')
      .select('sku')
      .eq('source_document_id', documentId)
      .eq('manufacturer_id', manufacturerId)
      .not('sku', 'is', null)

    type SkuRow = { sku: string | null }
    const skus = ((skuData ?? []) as SkuRow[]).map((r) => r.sku).filter(Boolean)
    const skuSet = new Set<string>()
    const dupeSkuSet = new Set<string>()
    for (const s of skus) {
      if (skuSet.has(s!)) dupeSkuSet.add(s!)
      skuSet.add(s!)
    }
    duplicateSkus = dupeSkuSet.size
  }

  // ── Print counts ──────────────────────────────────────────────────────────
  console.log('Staged row counts (local DB):')
  console.log(`  ${pad('staged_systems', 30)} ${sysCnt ?? 0}`)
  console.log(`  ${pad('staged_system_profiles', 30)} ${profCnt}`)
  console.log(`  ${pad('staged_components', 30)} ${compCnt ?? 0}`)
  console.log(`  ${pad('staged_system_colours', 30)} ${colCnt}`)
  console.log(`  ${pad('staged_system_components', 30)} ${linkCnt}`)
  console.log(`  ${pad('field_verifications', 30)} ${fvCnt ?? 0}`)
  console.log(`  ${pad('parser_field_evidence', 30)} ${pfeCnt}`)
  console.log()

  // ── Warnings ──────────────────────────────────────────────────────────────
  const issues: string[] = []

  if ((sysCnt ?? 0) === 0 && (compCnt ?? 0) === 0) {
    issues.push('No staged systems or components found — insert may not have run for this document.')
  }
  if (orphanLinkCount > 0) {
    issues.push(`${orphanLinkCount} staged_system_components link(s) reference a component not found in this document's staged_components.`)
  }
  if (duplicateProductCodes > 0) {
    issues.push(`${duplicateProductCodes} duplicate product_code value(s) across staged_systems for this document.`)
  }
  if (duplicateSkus > 0) {
    issues.push(`${duplicateSkus} duplicate SKU value(s) across staged_components for this document.`)
  }
  if ((fvCnt ?? 0) === 0 && ((sysCnt ?? 0) > 0 || (compCnt ?? 0) > 0)) {
    issues.push('field_verifications count is 0 but staged rows exist — evidence seeding may have failed.')
  }
  if (pfeCnt === 0 && extractionRunId && ((sysCnt ?? 0) > 0 || (compCnt ?? 0) > 0)) {
    issues.push('parser_field_evidence count is 0 for this extraction run — evidence insertion may have failed.')
  }

  // ── Preview comparison ────────────────────────────────────────────────────
  let previewMismatches: string[] = []

  if (previewArg) {
    const previewPath = resolveDotLocal(previewArg)
    if (!existsSync(previewPath)) {
      console.error(`[WARN] Preview file not found: ${previewArg}`)
    } else {
      let preview: Record<string, unknown>
      try {
        preview = JSON.parse(readFileSync(previewPath, 'utf8'))
      } catch {
        console.error(`[WARN] Could not parse preview file: ${previewArg}`)
        preview = {}
      }

      const expectedCounts = preview['row_counts'] as Record<string, number> | undefined

      if (expectedCounts) {
        console.log('Preview vs actual comparison:')
        const tableMap: Record<string, number> = {
          staged_systems: sysCnt ?? 0,
          staged_system_profiles: profCnt,
          staged_components: compCnt ?? 0,
          staged_system_colours: colCnt,
          staged_system_components: linkCnt,
          field_verifications: fvCnt ?? 0,
          parser_field_evidence: pfeCnt,
        }

        for (const [table, actual] of Object.entries(tableMap)) {
          const expected = expectedCounts[table]
          if (expected === undefined) continue
          const match = actual === expected
          const icon = match ? '✓' : '✗'
          console.log(`  ${icon} ${pad(table, 30)} expected: ${pad(expected, 4)} actual: ${actual}`)
          if (!match) {
            previewMismatches.push(`${table}: expected ${expected}, got ${actual}`)
          }
        }
        console.log()
      } else {
        console.log('[NOTE] Preview file does not contain row_counts — skipping count comparison.')
        console.log()
      }
    }
  }

  // ── Strict mode exit ──────────────────────────────────────────────────────
  const allIssues = [...issues, ...previewMismatches]

  if (allIssues.length > 0) {
    console.log('Issues:')
    for (const issue of allIssues) {
      console.log(`  ⚠  ${issue}`)
    }
    console.log()
  } else {
    console.log('✓ No issues found.')
    console.log()
  }

  // ── Evidence coverage summary ─────────────────────────────────────────────
  if (extractionRunId && pfeCnt > 0) {
    const { data: entitySummary } = await supabase
      .from('parser_field_evidence')
      .select('entity_type')
      .eq('extraction_run_id', extractionRunId)

    type EntityRow = { entity_type: string }
    const entityCounts = new Map<string, number>()
    for (const r of (entitySummary ?? []) as EntityRow[]) {
      entityCounts.set(r.entity_type, (entityCounts.get(r.entity_type) ?? 0) + 1)
    }

    if (entityCounts.size > 0) {
      console.log('Evidence coverage by entity type:')
      for (const [type, count] of Array.from(entityCounts.entries()).sort()) {
        console.log(`  ${pad(type, 30)} ${count} fields`)
      }
      console.log()
    }
  }

  // ── Inspect commands ──────────────────────────────────────────────────────
  console.log('To inspect in local Supabase Studio:')
  console.log('  npx supabase db query --local "SELECT id, name, verification_status FROM staged_systems WHERE source_document_id = \'' + documentId + '\' LIMIT 20"')
  console.log()

  // ── Final exit ────────────────────────────────────────────────────────────
  if (strict && allIssues.length > 0) {
    console.error(`[STRICT] ${allIssues.length} issue(s) found. Exiting non-zero.`)
    process.exit(1)
  }

  if (sysErr) {
    console.error(`[WARN] DB error on staged_systems query: ${sysErr.message}`)
  }

  console.log('=======================================================')
  console.log('Verification complete.')
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
