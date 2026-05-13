// Dry-run fixture validator.
//
// Runs validateParserOutput against all mock parser fixtures and prints results.
// No Supabase client. No DB writes. No AI calls.
//
// Run with:
//   npx tsx apps/web/lib/parser/validate-fixtures.ts

import { validateParserOutput } from './validate'
import type { ParserValidationResult } from './validate'
import { mockNTWAvenueDecking, mockJHLinea, mockEnviroSealWrap } from './fixtures'
import type { ParserOutput } from './types'

const fixtures: Array<{ name: string; data: ParserOutput }> = [
  { name: 'mockNTWAvenueDecking', data: mockNTWAvenueDecking },
  { name: 'mockJHLinea', data: mockJHLinea },
  { name: 'mockEnviroSealWrap', data: mockEnviroSealWrap },
]

const SEP = '='.repeat(64)

function printResult(name: string, result: ParserValidationResult) {
  console.log(`\n${SEP}`)
  console.log(`Fixture : ${name}`)
  console.log(`Result  : ${result.ok ? 'OK ✓' : 'FAIL ✗'}`)
  console.log(`Errors  : ${result.errors.length}`)
  console.log(`Warnings: ${result.warnings.length}`)

  if (result.errors.length > 0) {
    console.log('\n  ERRORS:')
    for (const e of result.errors) {
      const loc = e.path ? `${e.path} — ` : ''
      console.log(`  [${e.code}] ${loc}${e.message}`)
    }
  }

  if (result.warnings.length > 0) {
    console.log('\n  WARNINGS:')
    for (const w of result.warnings) {
      const loc = w.path ? `${w.path} — ` : ''
      console.log(`  [${w.code}] ${loc}${w.message}`)
    }
  }
}

let totalErrors = 0
let totalWarnings = 0

for (const { name, data } of fixtures) {
  const result = validateParserOutput(data)
  printResult(name, result)
  totalErrors += result.errors.length
  totalWarnings += result.warnings.length
}

console.log(`\n${SEP}`)
console.log(
  `SUMMARY: ${fixtures.length} fixtures | ${totalErrors} total errors | ${totalWarnings} total warnings`,
)
console.log(totalErrors === 0 ? 'All fixtures passed validation.' : 'Some fixtures have errors — see above.')
