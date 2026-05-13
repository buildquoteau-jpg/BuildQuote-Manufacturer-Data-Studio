// Dry-run insertion planner.
//
// Runs planParserOutputInsertion against all mock parser fixtures and prints
// the planned row counts, any planning errors/warnings, and info notes.
//
// No Supabase client. No DB writes. No AI calls.
//
// Run with:
//   npx tsx apps/web/lib/parser/plan-fixtures.ts

import { planParserOutputInsertion } from './map-to-staged'
import type { ParserInsertionPlan } from './map-to-staged'
import { mockNTWAvenueDecking, mockJHLinea, mockEnviroSealWrap } from './fixtures'
import type { ParserOutput } from './types'

const fixtures: Array<{ name: string; data: ParserOutput }> = [
  { name: 'mockNTWAvenueDecking', data: mockNTWAvenueDecking },
  { name: 'mockJHLinea', data: mockJHLinea },
  { name: 'mockEnviroSealWrap', data: mockEnviroSealWrap },
]

const SEP = '='.repeat(64)

function printPlan(name: string, plan: ParserInsertionPlan) {
  const s = plan.summary
  console.log(`\n${SEP}`)
  console.log(`Fixture : ${name}`)
  console.log(`Result  : ${plan.ok ? 'OK ✓' : 'FAIL ✗'}`)

  console.log('\n  Staged rows planned:')
  console.log(`    staged_systems           : ${s.stagedSystems}`)
  console.log(`    staged_system_profiles   : ${s.stagedSystemProfiles}`)
  console.log(`    staged_components        : ${s.stagedComponents}`)
  console.log(`    staged_system_colours    : ${s.stagedSystemColours}`)
  console.log(`    staged_system_components : ${s.stagedSystemComponents}`)

  console.log('\n  Evidence rows planned:')
  console.log(`    field_verifications      : ${s.fieldVerifications}`)
  console.log(`    parser_field_evidence    : ${s.parserFieldEvidence}`)

  console.log('\n  Other:')
  console.log(`    media_candidates         : ${s.mediaCandidates}`)
  console.log(`    planning_errors          : ${s.planningErrors}`)
  console.log(`    planning_warnings        : ${s.planningWarnings}`)

  const errors = plan.issues.filter(i => i.severity === 'error')
  const warnings = plan.issues.filter(i => i.severity === 'warning')
  const infos = plan.issues.filter(i => i.severity === 'info')

  if (errors.length > 0) {
    console.log('\n  ERRORS:')
    for (const e of errors) {
      const loc = e.path ? `${e.path} — ` : ''
      console.log(`    [${e.code}] ${loc}${e.message}`)
    }
  }

  if (warnings.length > 0) {
    console.log('\n  WARNINGS:')
    for (const w of warnings) {
      const loc = w.path ? `${w.path} — ` : ''
      console.log(`    [${w.code}] ${loc}${w.message}`)
    }
  }

  if (infos.length > 0) {
    console.log('\n  INFO:')
    for (const i of infos) {
      const loc = i.path ? `${i.path} — ` : ''
      console.log(`    [${i.code}] ${loc}${i.message}`)
    }
  }
}

let totalErrors = 0
let totalWarnings = 0

for (const { name, data } of fixtures) {
  const plan = planParserOutputInsertion(data)
  printPlan(name, plan)
  totalErrors += plan.summary.planningErrors
  totalWarnings += plan.summary.planningWarnings
}

console.log(`\n${SEP}`)
console.log(
  `SUMMARY: ${fixtures.length} fixtures | ${totalErrors} total planning errors | ${totalWarnings} total planning warnings`,
)
console.log(
  totalErrors === 0
    ? 'All fixtures planned successfully.'
    : 'Some fixtures have planning errors — see above.',
)
