#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-insert-local.ts
 *
 * Local-only CLI. Writes a validated parser plan to the local Supabase staged
 * tables via the insert_parser_output_plan_v1 RPC. Nine safety gates must all
 * pass before any DB write is attempted.
 *
 * SAFETY RULES — read before running:
 *   - LOCAL ONLY. Never run against production Supabase.
 *   - Requires LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local.
 *   - Requires NEXT_PUBLIC_SUPABASE_URL pointing to 127.0.0.1 or localhost.
 *   - Requires --strict and --confirm-local-write flags.
 *   - Never prints env values, keys, or raw payloads to stdout.
 *   - Never imported from app runtime code.
 *
 * Usage:
 *   pnpm parser:insert-local -- \
 *     --input ".local/parser-inputs/<bundle>.json" \
 *     --ai-output ".local/parser-ai-outputs/<output>.json" \
 *     --strict \
 *     --confirm-local-write
 *
 * Optional:
 *   --replace-existing-for-document   Purge existing staged rows for this
 *                                     document before inserting (idempotent).
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { planParserOutputInsertion } from '../lib/parser/map-to-staged'
import { buildDryRunReport } from '../lib/parser/dry-run-report'
import type { ParserOutput, ParserRunContext } from '../lib/parser/types'
import type { DryRunReportInput } from '../lib/parser/dry-run-report'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ----------------------------------------------------------
// Env loading
// ----------------------------------------------------------

function loadEnvFile(filepath: string): void {
  if (!existsSync(filepath)) return
  const lines = readFileSync(filepath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const rawVal = trimmed.slice(eqIdx + 1).split(' #')[0].trim()
    const val = rawVal.replace(/^["']|["']$/g, '')
    if (key && !process.env[key]) {
      process.env[key] = val
    }
  }
}

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ----------------------------------------------------------
// Arg parser
// ----------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}

// ----------------------------------------------------------
// Path helpers
// ----------------------------------------------------------

function resolveDotLocal(p: string): string {
  return p.startsWith('.local/')
    ? path.join(REPO_ROOT, p)
    : path.resolve(p)
}

function requireUnder(resolvedPath: string, subdir: string, label: string): void {
  const expectedPrefix = path.join(REPO_ROOT, '.local', subdir)
  if (!resolvedPath.startsWith(expectedPrefix)) {
    console.error(`[GATE FAIL] ${label} must be under .local/${subdir}/`)
    process.exit(1)
  }
}

// ----------------------------------------------------------
// Safety gate helpers
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

function gate(label: string, pass: boolean, hint: string): void {
  if (!pass) {
    console.error(`\n[GATE FAIL] ${label}`)
    console.error(`  → ${hint}`)
    process.exit(1)
  }
  console.log(`[gate ok]  ${label}`)
}

// ----------------------------------------------------------
// Main
// ----------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('parser:insert-local — local staged write')
  console.log('=========================================')

  // ── Gate 1: --strict required ──────────────────────────────────────────────
  gate(
    '--strict flag present',
    args['strict'] === true,
    'Pass --strict to confirm that dry-run validation must pass before any write.',
  )

  // ── Gate 2: --confirm-local-write required ─────────────────────────────────
  gate(
    '--confirm-local-write flag present',
    args['confirm-local-write'] === true,
    'Pass --confirm-local-write to explicitly acknowledge that this writes to local DB.',
  )

  // ── Gate 3: LOCAL_ONLY_ALLOW_SERVICE_ROLE=true ─────────────────────────────
  gate(
    'LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in env',
    process.env['LOCAL_ONLY_ALLOW_SERVICE_ROLE'] === 'true',
    'Set LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local (local Supabase only).',
  )

  // ── Gate 4: SUPABASE_URL is local ─────────────────────────────────────────
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
  gate(
    'NEXT_PUBLIC_SUPABASE_URL is local (127.0.0.1 or localhost)',
    isLocalUrl(supabaseUrl),
    'NEXT_PUBLIC_SUPABASE_URL must point to a local Supabase instance. Never run against production.',
  )

  // ── Gate 5: Input paths under .local/ subdirs ──────────────────────────────
  const inputArg = args['input'] as string | undefined
  const aiOutputArg = args['ai-output'] as string | undefined

  if (!inputArg) {
    console.error('[ERROR] --input is required')
    process.exit(1)
  }
  if (!aiOutputArg) {
    console.error('[ERROR] --ai-output is required')
    process.exit(1)
  }

  const inputPath = resolveDotLocal(inputArg)
  const aiOutputPath = resolveDotLocal(aiOutputArg)

  requireUnder(inputPath, 'parser-inputs', '--input')
  requireUnder(aiOutputPath, 'parser-ai-outputs', '--ai-output')

  gate('--input exists', existsSync(inputPath), `File not found: ${inputArg}`)
  gate('--ai-output exists', existsSync(aiOutputPath), `File not found: ${aiOutputArg}`)

  console.log(`[gate ok]  input/ai-output paths are under .local/ subdirs`)

  // ── Load bundle + AI output ────────────────────────────────────────────────
  let bundle: { document?: { id?: string }; manufacturer?: { id?: string } }
  let aiOutputFile: { parser_output?: ParserOutput }
  let aiOutput: ParserOutput

  try {
    bundle = JSON.parse(readFileSync(inputPath, 'utf8'))
  } catch (e) {
    console.error(`[ERROR] Failed to parse --input JSON: ${(e as Error).message}`)
    process.exit(1)
  }
  try {
    aiOutputFile = JSON.parse(readFileSync(aiOutputPath, 'utf8'))
  } catch (e) {
    console.error(`[ERROR] Failed to parse --ai-output JSON: ${(e as Error).message}`)
    process.exit(1)
  }
  if (!aiOutputFile.parser_output) {
    console.error('[ERROR] AI output file has no parser_output field.')
    process.exit(1)
  }
  aiOutput = aiOutputFile.parser_output

  const sourceDocumentId: string = bundle.document?.id ?? ''
  const manufacturerId: string = bundle.manufacturer?.id ?? ''

  if (!sourceDocumentId || !manufacturerId) {
    console.error('[ERROR] Bundle is missing document.id or manufacturer.id')
    process.exit(1)
  }

  console.log(`\n  document:     ${sourceDocumentId}`)
  console.log(`  manufacturer: ${manufacturerId}`)

  // ── Gate 6: Strict dry-run validation ─────────────────────────────────────
  const context: Partial<ParserRunContext> = {
    extraction_run_id: '00000000-0000-0000-0000-000000000000',
    manufacturer_id: manufacturerId,
    source_document_id: sourceDocumentId,
  }

  console.log('\n[gate]     Running strict dry-run validation...')
  const plan = planParserOutputInsertion(aiOutput, context)

  const dryRunInput: DryRunReportInput = {
    output: aiOutput,
    plan,
    fixtureLabel: 'parser:insert-local',
    bundleDocumentId: sourceDocumentId,
    bundleDocumentName: null,
  }
  const report = buildDryRunReport(dryRunInput)

  if (!plan.ok || report.totals.errors > 0) {
    console.error('\n[GATE FAIL] Dry-run validation failed')
    console.error(`  errors:   ${report.totals.errors}`)
    console.error(`  warnings: ${report.totals.warnings}`)
    for (const c of report.checks.filter(x => x.severity === 'error').slice(0, 10)) {
      console.error(`  • [${c.category}] ${c.message}`)
    }
    if (report.totals.errors > 10) {
      console.error(`  … and ${report.totals.errors - 10} more`)
    }
    process.exit(1)
  }
  console.log(`[gate ok]  dry-run validation passed`)
  console.log(`           errors: ${report.totals.errors}  warnings: ${report.totals.warnings}  infos: ${report.totals.infos}`)
  console.log(`           systems: ${plan.summary.stagedSystems}  profiles: ${plan.summary.stagedSystemProfiles}`)
  console.log(`           components: ${plan.summary.stagedComponents}  colours: ${plan.summary.stagedSystemColours}`)
  console.log(`           links: ${plan.summary.stagedSystemComponents}`)
  console.log(`           field_verifications: ${plan.summary.fieldVerifications}  parser_field_evidence: ${plan.summary.parserFieldEvidence}`)

  // ── Build Supabase client (service role — local only) ──────────────────────
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
  if (!serviceKey) {
    console.error('[ERROR] SUPABASE_SERVICE_ROLE_KEY is not set in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── Gate 7: source_document_id exists in local DB ─────────────────────────
  console.log('\n[gate]     Checking source_document_id exists in local DB...')
  const { data: docCheck, error: docErr } = await supabase
    .from('source_documents')
    .select('id')
    .eq('id', sourceDocumentId)
    .maybeSingle()

  if (docErr) {
    console.error(`[GATE FAIL] DB error checking source_document_id: ${docErr.message}`)
    process.exit(1)
  }
  gate(
    'source_document_id exists in local DB',
    docCheck !== null,
    `No source_document record found for id=${sourceDocumentId}`,
  )

  // ── Gate 8: manufacturer_id exists in local DB ────────────────────────────
  console.log('\n[gate]     Checking manufacturer_id exists in local DB...')
  const { data: mfgCheck, error: mfgErr } = await supabase
    .from('data_studio_manufacturers')
    .select('id')
    .eq('id', manufacturerId)
    .maybeSingle()

  if (mfgErr) {
    console.error(`[GATE FAIL] DB error checking manufacturer_id: ${mfgErr.message}`)
    process.exit(1)
  }
  gate(
    'manufacturer_id exists in local DB',
    mfgCheck !== null,
    `No manufacturer record found for id=${manufacturerId}`,
  )

  // ── Gate 9: No existing staged rows (unless --replace-existing-for-document) ─
  const replaceExisting = args['replace-existing-for-document'] === true

  console.log('\n[gate]     Checking for existing staged rows...')
  const { count: existingCount, error: countErr } = await supabase
    .from('staged_systems')
    .select('id', { count: 'exact', head: true })
    .eq('source_document_id', sourceDocumentId)
    .eq('manufacturer_id', manufacturerId)

  if (countErr) {
    console.error(`[GATE FAIL] DB error checking existing staged_systems: ${countErr.message}`)
    process.exit(1)
  }

  const hasExisting = (existingCount ?? 0) > 0

  if (hasExisting && !replaceExisting) {
    console.error(`\n[GATE FAIL] Existing staged rows detected (staged_systems count: ${existingCount})`)
    console.error('  → Pass --replace-existing-for-document to purge and re-insert.')
    process.exit(1)
  }

  if (hasExisting) {
    console.log(`[gate ok]  existing staged rows found (count: ${existingCount}) — will purge before insert`)
  } else {
    console.log(`[gate ok]  no existing staged rows for this document`)
  }

  // ── All gates passed ───────────────────────────────────────────────────────
  console.log('\n✓ All 9 safety gates passed. Proceeding with local DB write.\n')

  // ── Purge if --replace-existing-for-document ──────────────────────────────
  if (hasExisting && replaceExisting) {
    console.log('[purge]    Calling purge_staged_for_document_v1...')
    const { data: purgeResult, error: purgeErr } = await supabase.rpc(
      'purge_staged_for_document_v1',
      { p_source_document_id: sourceDocumentId, p_manufacturer_id: manufacturerId },
    )
    if (purgeErr) {
      console.error(`[ERROR] Purge RPC failed: ${purgeErr.message}`)
      process.exit(1)
    }
    const pr = purgeResult as { ok: boolean; deleted_counts: Record<string, number> }
    console.log('[purge ok] Deleted counts:')
    for (const [table, cnt] of Object.entries(pr.deleted_counts ?? {})) {
      console.log(`           ${table}: ${cnt}`)
    }
  }

  // ── Create extraction_run (parse_systems) ──────────────────────────────────
  console.log('\n[run]      Creating extraction_run (run_type=parse_systems)...')
  const { data: runData, error: runErr } = await supabase
    .from('extraction_runs')
    .insert({
      source_document_id: sourceDocumentId,
      run_type: 'parse_systems',
      status: 'running',
      tool_name: 'parser:insert-local',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runErr || !runData) {
    console.error(`[ERROR] Failed to create extraction_run: ${runErr?.message ?? 'no data returned'}`)
    process.exit(1)
  }

  const extractionRunId: string = runData.id
  console.log(`[run ok]   extraction_run id: ${extractionRunId}`)

  // ── Re-plan with real extractionRunId ────────────────────────────────────
  const realContext: Partial<ParserRunContext> = {
    extraction_run_id: extractionRunId,
    manufacturer_id: manufacturerId,
    source_document_id: sourceDocumentId,
  }
  const finalPlan = planParserOutputInsertion(aiOutput, realContext)

  // ── Patch placeholder IDs with real values ────────────────────────────────
  // The planner takes source_document_id, source_chunk_id, and manufacturer_id
  // from parser output candidates, which may contain fixture/placeholder UUIDs.
  // Replace source_document_id/manufacturer_id with the real bundle values.
  // Null out source_chunk_id values: fixture chunks are placeholder UUIDs that
  // don't exist in the local DB (FK → document_chunks.id would fail). For real
  // AI output, chunks come from the bundle and are valid, but we null them here
  // to keep the contract simple — source_chunk_id FK is ON DELETE SET NULL and
  // the field is optional tracing metadata only.
  for (const row of finalPlan.stagedSystems) {
    if (row.source_document_id !== sourceDocumentId) row.source_document_id = sourceDocumentId
    if (row.manufacturer_id !== manufacturerId) row.manufacturer_id = manufacturerId
    row.source_chunk_id = null
  }
  for (const row of finalPlan.stagedComponents) {
    if (row.source_document_id !== sourceDocumentId) row.source_document_id = sourceDocumentId
    if (row.manufacturer_id !== manufacturerId) row.manufacturer_id = manufacturerId
    row.source_chunk_id = null
  }
  for (const row of finalPlan.fieldVerifications) {
    if (row.source_document_id !== sourceDocumentId) row.source_document_id = sourceDocumentId
    row.source_chunk_id = null
  }
  for (const row of finalPlan.parserFieldEvidence) {
    if (row.source_document_id !== sourceDocumentId) row.source_document_id = sourceDocumentId
    row.source_chunk_id = null
  }

  // ── Call insert RPC ────────────────────────────────────────────────────────
  console.log('\n[insert]   Calling insert_parser_output_plan_v1 RPC...')
  const { data: rpcResult, error: rpcErr } = await supabase.rpc(
    'insert_parser_output_plan_v1',
    { plan: finalPlan },
  )

  if (rpcErr) {
    // Mark run as failed before exiting
    await supabase
      .from('extraction_runs')
      .update({ status: 'failed', error_message: rpcErr.message, completed_at: new Date().toISOString() })
      .eq('id', extractionRunId)
    console.error(`[ERROR] Insert RPC failed: ${rpcErr.message}`)
    process.exit(1)
  }

  const result = rpcResult as {
    ok: boolean
    mode: string
    inserted_counts: Record<string, number>
    id_maps: Record<string, Record<string, string>>
  }

  if (!result.ok) {
    await supabase
      .from('extraction_runs')
      .update({ status: 'failed', error_message: 'RPC returned ok=false', completed_at: new Date().toISOString() })
      .eq('id', extractionRunId)
    console.error('[ERROR] Insert RPC returned ok=false')
    process.exit(1)
  }

  // ── Mark extraction_run completed ─────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('extraction_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', extractionRunId)

  if (updateErr) {
    console.error(`[WARN] Failed to mark extraction_run completed: ${updateErr.message}`)
  }

  console.log('\n[insert ok] RPC succeeded')
  console.log(`  mode: ${result.mode}`)
  console.log('  inserted_counts:')
  for (const [table, cnt] of Object.entries(result.inserted_counts ?? {})) {
    console.log(`    ${table}: ${cnt}`)
  }

  // ── Readback verification ──────────────────────────────────────────────────
  console.log('\n[verify]   Readback verification from local DB...')

  const [sysRes, compRes, fvRes, pfeRes] = await Promise.all([
    supabase
      .from('staged_systems')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', sourceDocumentId)
      .eq('manufacturer_id', manufacturerId),
    supabase
      .from('staged_components')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', sourceDocumentId)
      .eq('manufacturer_id', manufacturerId),
    supabase
      .from('field_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', sourceDocumentId),
    supabase
      .from('parser_field_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('extraction_run_id', extractionRunId),
  ])

  const readback = {
    staged_systems: sysRes.count ?? 0,
    staged_components: compRes.count ?? 0,
    field_verifications: fvRes.count ?? 0,
    parser_field_evidence: pfeRes.count ?? 0,
  }

  const expected = {
    staged_systems: result.inserted_counts['staged_systems'] ?? 0,
    staged_components: result.inserted_counts['staged_components'] ?? 0,
    field_verifications: result.inserted_counts['field_verifications'] ?? 0,
    parser_field_evidence: result.inserted_counts['parser_field_evidence'] ?? 0,
  }

  let readbackOk = true
  for (const table of Object.keys(expected) as Array<keyof typeof expected>) {
    const got = readback[table]
    const want = expected[table]
    const match = got >= want
    const icon = match ? '✓' : '✗'
    console.log(`  ${icon} ${table}: expected ≥${want}, got ${got}`)
    if (!match) readbackOk = false
  }

  if (!readbackOk) {
    console.error('\n[WARN] Readback counts do not match inserted counts — review DB state.')
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=========================================')
  console.log('parser:insert-local — complete')
  console.log(`  extraction_run_id: ${extractionRunId}`)
  console.log(`  document:          ${sourceDocumentId}`)
  console.log(`  manufacturer:      ${manufacturerId}`)
  console.log(`  readback ok:       ${readbackOk}`)
  console.log('\nInspect results:')
  console.log('  pnpm supabase studio  (local Supabase Studio)')
  console.log('  npx supabase db query --local "SELECT id, name, verification_status FROM staged_systems LIMIT 20"')
  console.log('  npx supabase db query --local "SELECT id, name, verification_status FROM staged_components LIMIT 20"')
  console.log('\nTo reset local staged tables:')
  console.log('  npx supabase db reset --local')
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
