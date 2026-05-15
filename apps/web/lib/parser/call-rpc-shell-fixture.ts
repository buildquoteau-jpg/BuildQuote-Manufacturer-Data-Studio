// Local-only dry-run caller for the parser insertion RPC shell.
//
// Chains: validateParserOutput → planParserOutputInsertion → insert_parser_output_plan_v1 RPC.
// Uses mockNTWAvenueDecking as the input fixture.
//
// No rows are written — the RPC shell has mode='dry_rpc_shell' and does no inserts.
// Row counts before and after the RPC call are printed to confirm this.
//
// If the RPC fails due to permission errors (EXECUTE was revoked from PUBLIC in
// migration 010), the error is reported and the script exits non-zero without
// loosening grants or retrying with elevated credentials.
//
// Run with:
//   npx tsx apps/web/lib/parser/call-rpc-shell-fixture.ts
//
// Prerequisites:
//   - Local Supabase running  (npx supabase start)
//   - Migrations applied      (npx supabase db reset)

import { createClient } from '@supabase/supabase-js'
import { validateParserOutput } from './validate'
import { planParserOutputInsertion } from './map-to-staged'
import { mockNTWAvenueDecking } from './fixtures'

// Local dev values — public, not secrets.
// The anon key is intentionally the publishable (anon) key, not service role.
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY)

const SEP = '='.repeat(64)

// Tables that the real insertion will write to — used to prove no rows are added.
const STAGED_TABLES = [
  'staged_systems',
  'staged_system_profiles',
  'staged_components',
  'staged_system_colours',
  'staged_system_components',
  'field_verifications',
  'parser_field_evidence',
] as const

async function countRows(): Promise<Record<string, number | null>> {
  const counts: Record<string, number | null> = {}
  for (const table of STAGED_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    counts[table] = error ? null : (count ?? 0)
  }
  return counts
}

function printCounts(label: string, counts: Record<string, number | null>) {
  console.log(`\n  Row counts (${label}):`)
  for (const [table, n] of Object.entries(counts)) {
    const display = n === null ? 'ERROR (could not read)' : String(n)
    console.log(`    ${table.padEnd(30)} ${display}`)
  }
}

async function main() {
  console.log(SEP)
  console.log('Parser insertion RPC shell — dry-run caller')
  console.log(`Fixture : mockNTWAvenueDecking`)
  console.log(`RPC     : insert_parser_output_plan_v1`)
  console.log(`Client  : anon key (publishable) — no elevated credentials`)

  // ----------------------------------------------------------------
  // Step 1 — Validate
  // ----------------------------------------------------------------
  console.log(`\n${SEP}`)
  console.log('Step 1: validateParserOutput')

  const validation = validateParserOutput(mockNTWAvenueDecking)
  console.log(`  ok       : ${validation.ok}`)
  console.log(`  errors   : ${validation.errors.length}`)
  console.log(`  warnings : ${validation.warnings.length}`)

  if (!validation.ok) {
    console.error('\n  VALIDATION FAILED — aborting before plan step.')
    for (const e of validation.errors) {
      console.error(`    [${e.code}] ${e.path ? e.path + ' — ' : ''}${e.message}`)
    }
    process.exit(1)
  }

  // ----------------------------------------------------------------
  // Step 2 — Plan
  // ----------------------------------------------------------------
  console.log(`\n${SEP}`)
  console.log('Step 2: planParserOutputInsertion')

  const plan = planParserOutputInsertion(mockNTWAvenueDecking)
  const planErrors = plan.issues.filter(i => i.severity === 'error')

  console.log(`  ok               : ${plan.ok}`)
  console.log(`  planning errors  : ${plan.summary.planningErrors}`)
  console.log(`  planning warnings: ${plan.summary.planningWarnings}`)
  console.log('\n  Planned row counts:')
  console.log(`    stagedSystems          : ${plan.summary.stagedSystems}`)
  console.log(`    stagedSystemProfiles   : ${plan.summary.stagedSystemProfiles}`)
  console.log(`    stagedComponents       : ${plan.summary.stagedComponents}`)
  console.log(`    stagedSystemColours    : ${plan.summary.stagedSystemColours}`)
  console.log(`    stagedSystemComponents : ${plan.summary.stagedSystemComponents}`)
  console.log(`    fieldVerifications     : ${plan.summary.fieldVerifications}`)
  console.log(`    parserFieldEvidence    : ${plan.summary.parserFieldEvidence}`)
  console.log(`    mediaCandidates        : ${plan.summary.mediaCandidates}`)

  if (!plan.ok) {
    console.error('\n  PLANNING FAILED — aborting before RPC step.')
    for (const e of planErrors) {
      console.error(`    [${e.code}] ${e.path ? e.path + ' — ' : ''}${e.message}`)
    }
    process.exit(1)
  }

  // Build the JSON payload — strip non-serialisable fields (temp keys are strings, fine).
  // The RPC expects only the array fields; the plan also has ok/issues/summary which are TS-only.
  const rpcPayload = {
    stagedSystems:          plan.stagedSystems,
    stagedSystemProfiles:   plan.stagedSystemProfiles,
    stagedComponents:       plan.stagedComponents,
    stagedSystemColours:    plan.stagedSystemColours,
    stagedSystemComponents: plan.stagedSystemComponents,
    fieldVerifications:     plan.fieldVerifications,
    parserFieldEvidence:    plan.parserFieldEvidence,
    mediaCandidates:        plan.mediaCandidates,
  }

  // ----------------------------------------------------------------
  // Step 3 — Row counts BEFORE RPC call
  // ----------------------------------------------------------------
  console.log(`\n${SEP}`)
  console.log('Step 3: Row counts BEFORE RPC call')

  const beforeCounts = await countRows()
  printCounts('before', beforeCounts)

  // ----------------------------------------------------------------
  // Step 4 — Call the RPC shell
  // ----------------------------------------------------------------
  console.log(`\n${SEP}`)
  console.log('Step 4: supabase.rpc(insert_parser_output_plan_v1)')

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'insert_parser_output_plan_v1',
    { plan: rpcPayload }
  )

  if (rpcError) {
    // Permission error is the expected outcome — EXECUTE was revoked from PUBLIC in migration 010.
    console.error('\n  RPC CALL FAILED')
    console.error(`  code    : ${rpcError.code ?? '(none)'}`)
    console.error(`  message : ${rpcError.message}`)
    if (rpcError.details) console.error(`  details : ${rpcError.details}`)
    if (rpcError.hint)    console.error(`  hint    : ${rpcError.hint}`)

    const isPermissionError =
      rpcError.code === '42501' ||
      rpcError.message?.toLowerCase().includes('permission denied') ||
      rpcError.message?.toLowerCase().includes('execute')

    if (isPermissionError) {
      console.error(
        '\n  PERMISSION DENIED — EXECUTE was revoked from PUBLIC in migration 010.'
      )
      console.error(
        '  This is expected. Do not loosen grants without approval.'
      )
      console.error(
        '  To call this RPC legitimately, a deliberate GRANT must be added'
      )
      console.error(
        '  alongside the RLS/auth design (docs/parser-insertion-adapter-design.md §10.3).'
      )
    }

    // Still check row counts to confirm nothing mutated despite the error.
    console.log(`\n${SEP}`)
    console.log('Step 5: Row counts AFTER RPC call (confirms no mutation on error path)')
    const afterCounts = await countRows()
    printCounts('after', afterCounts)

    let countsUnchanged = true
    for (const table of STAGED_TABLES) {
      if (beforeCounts[table] !== afterCounts[table]) {
        countsUnchanged = false
        console.error(`  UNEXPECTED CHANGE in ${table}: ${beforeCounts[table]} → ${afterCounts[table]}`)
      }
    }
    if (countsUnchanged) {
      console.log('\n  All row counts unchanged — no mutation occurred.')
    }

    process.exit(1)
  }

  // ----------------------------------------------------------------
  // Step 5 — RPC succeeded: print response
  // ----------------------------------------------------------------
  console.log('\n  RPC response:')
  console.log(JSON.stringify(rpcData, null, 4))

  // ----------------------------------------------------------------
  // Step 6 — Row counts AFTER RPC call
  // ----------------------------------------------------------------
  console.log(`\n${SEP}`)
  console.log('Step 5: Row counts AFTER RPC call')

  const afterCounts = await countRows()
  printCounts('after', afterCounts)

  let countsUnchanged = true
  for (const table of STAGED_TABLES) {
    if (beforeCounts[table] !== afterCounts[table]) {
      countsUnchanged = false
      console.error(`  UNEXPECTED CHANGE in ${table}: ${beforeCounts[table]} → ${afterCounts[table]}`)
    }
  }

  console.log(`\n${SEP}`)
  if (countsUnchanged) {
    console.log('RESULT: RPC shell OK — no rows written (mode=dry_rpc_shell).')
  } else {
    console.error('RESULT: UNEXPECTED — row counts changed after dry-run call.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('\nUnhandled error:', err)
  process.exit(1)
})
