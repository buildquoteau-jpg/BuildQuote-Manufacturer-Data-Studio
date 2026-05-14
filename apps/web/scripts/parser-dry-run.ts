#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-dry-run.ts
 *
 * Local-only dry-run: loads a parser input bundle, applies a fixture parser
 * output, runs the full validation + insertion planning contracts, saves a
 * structured JSON report, and prints a readable summary.
 *
 * Usage:
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json"
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json" --strict
 *
 * --strict: exits non-zero if there are any validation errors, missing
 *   required fields, unresolved links, or missing evidence for core entities.
 *   Without --strict: saves report and prints warnings but exits 0.
 *
 * No DB writes. No AI calls. No Supabase client. No file uploads.
 * Report is written to .local/parser-reports/ (gitignored).
 *
 * The fixture used here (mockNTWAvenueDecking) exercises the full pipeline
 * contract. It is NOT AI-extracted content from the real PDF — that step
 * comes after dry-run passes and AI parser integration is approved.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import { planParserOutputInsertion } from '../lib/parser/map-to-staged'
import { buildDryRunReport } from '../lib/parser/dry-run-report'
import type { ParserOutput, ParserRunContext } from '../lib/parser/types'
import type { DryRunReport, DryRunCheck } from '../lib/parser/dry-run-report'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// scripts/ → .. → apps/web → .. → .. → monorepo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

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

function hr() {
  console.log('─'.repeat(60))
}

const MAX_ISSUES_PRINTED = 20

function printIssues(label: string, items: DryRunCheck[], cap: number) {
  if (items.length === 0) return
  console.log(`[parser:dry-run] ${label}:`)
  const shown = items.slice(0, cap)
  for (const issue of shown) {
    const tag = issue.severity === 'error' ? '[ERROR]' : issue.severity === 'warning' ? '[WARN] ' : '[INFO] '
    const loc = issue.path ? ` ${issue.path}:` : ''
    console.log(`  ${tag} [${issue.code}]${loc} ${issue.message}`)
  }
  if (items.length > cap) {
    console.log(`  … and ${items.length - cap} more (see report file for full list)`)
  }
  hr()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const strict = args.strict === true

  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <path> is required')
    console.error(
      '  Example: pnpm parser:dry-run -- --input ".local/parser-inputs/some-bundle.json"'
    )
    process.exit(1)
  }

  // Resolve .local/ paths relative to monorepo root (where the bundle script writes them)
  const resolvedInput = inputArg.startsWith('.local/')
    ? path.join(REPO_ROOT, inputArg)
    : path.resolve(inputArg)

  if (!existsSync(resolvedInput)) {
    console.error(`[ERROR] Bundle file not found: ${resolvedInput}`)
    console.error('  Run pnpm parser:bundle first to generate a bundle.')
    process.exit(1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bundle: any
  try {
    bundle = JSON.parse(readFileSync(resolvedInput, 'utf8'))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Could not parse bundle file: ${msg}`)
    process.exit(1)
  }

  const { manufacturer, document, extraction_run, combined_text_metadata } = bundle

  hr()
  console.log(`[parser:dry-run] Bundle summary${strict ? ' (--strict mode)' : ''}`)
  console.log(`  Manufacturer  : ${manufacturer?.name ?? '?'} (${manufacturer?.slug ?? '?'})`)
  console.log(`  Document      : ${document?.document_name ?? document?.id ?? '?'}`)
  console.log(`  Doc status    : ${document?.status ?? '?'}`)
  console.log(`  Chunks        : ${combined_text_metadata?.chunk_count ?? '?'}`)
  console.log(`  Pages         : ${combined_text_metadata?.page_count ?? '?'}`)
  console.log(
    `  Total chars   : ${
      combined_text_metadata?.total_chars != null
        ? Number(combined_text_metadata.total_chars).toLocaleString()
        : '?'
    }`
  )
  console.log(`  Tool          : ${extraction_run?.tool_name ?? '—'}`)
  console.log(
    `  Extraction ID : ${extraction_run?.id ?? 'none'} (${extraction_run?.status ?? '—'})`
  )
  hr()

  // Build a parser output candidate from the existing fixture,
  // overriding source_document_id to reference the real extracted document.
  const candidate: ParserOutput = {
    ...mockNTWAvenueDecking,
    source_document_id: document?.id ?? null,
  }

  const FIXTURE_LABEL = 'mockNTWAvenueDecking (lib/parser/fixtures.ts)'
  console.log('[parser:dry-run] Parser output candidate')
  console.log(`  Fixture       : ${FIXTURE_LABEL}`)
  console.log('  NOTE: No AI call made. This exercises pipeline contracts,')
  console.log('        not actual catalogue data from the real PDF.')
  hr()

  // Assemble run context from bundle data
  const context: Partial<ParserRunContext> = {
    source_document_id: document?.id ?? undefined,
    manufacturer_id: manufacturer?.id ?? undefined,
    extraction_run_id: extraction_run?.id ?? undefined,
    parsed_at: new Date().toISOString(),
  }

  // Run planner (validates internally, then plans if valid)
  const plan = planParserOutputInsertion(candidate, context)

  // Build full report
  const report: DryRunReport = buildDryRunReport({
    output: candidate,
    plan,
    fixtureLabel: FIXTURE_LABEL,
    bundleDocumentId: document?.id ?? null,
    bundleDocumentName: document?.document_name ?? null,
  })

  // ── Candidate entity counts ───────────────────────────────────
  console.log('[parser:dry-run] Candidate entity counts')
  console.log(`  systems               : ${candidate.systems.length}`)
  console.log(`  system_profiles       : ${candidate.system_profiles.length}`)
  console.log(`  components            : ${candidate.components.length}`)
  console.log(`  system_components     : ${candidate.system_components.length}`)
  console.log(`  system_colours        : ${candidate.system_colours.length}`)
  console.log(`  media images          : ${candidate.media?.images.length ?? 0}`)
  hr()

  // ── Staged insertion plan ─────────────────────────────────────
  console.log('[parser:dry-run] Staged insertion plan (no writes performed)')
  console.log(`  staged_systems           : ${report.counts.staged_systems}`)
  console.log(`  staged_system_profiles   : ${report.counts.staged_system_profiles}`)
  console.log(`  staged_components        : ${report.counts.staged_components}`)
  console.log(`  staged_system_colours    : ${report.counts.staged_system_colours}`)
  console.log(`  staged_system_components : ${report.counts.staged_system_components}`)
  console.log(`  field_verifications      : ${report.counts.field_verifications}`)
  console.log(`  parser_field_evidence    : ${report.counts.parser_field_evidence}`)
  console.log(`  media_candidates         : ${report.counts.media_candidates}`)
  hr()

  // ── Evidence coverage ─────────────────────────────────────────
  const cov = report.evidence_coverage
  console.log('[parser:dry-run] Evidence coverage')
  console.log(`  entities with field_sources    : ${cov.entities_with_field_sources}`)
  console.log(`  entities without field_sources : ${cov.entities_without_field_sources}`)
  console.log(`  total field_source entries     : ${cov.total_field_source_entries}`)
  console.log(`  total uncertain fields         : ${cov.total_uncertain_fields}`)
  console.log(`  evidence row parity            : ${cov.evidence_row_parity ? 'ok' : 'MISMATCH'}`)
  hr()

  // ── Issues ────────────────────────────────────────────────────
  const errors = report.checks.filter(c => c.severity === 'error')
  const warnings = report.checks.filter(c => c.severity === 'warning')
  const infos = report.checks.filter(c => c.severity === 'info')

  printIssues('Errors', errors, MAX_ISSUES_PRINTED)
  printIssues('Warnings', warnings, MAX_ISSUES_PRINTED)
  printIssues('Info', infos, MAX_ISSUES_PRINTED)

  // ── Save report ───────────────────────────────────────────────
  const reportDir = path.join(REPO_ROOT, '.local', 'parser-reports')
  mkdirSync(reportDir, { recursive: true })

  const docSlug = (document?.document_name ?? document?.id ?? 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportFilename = `${docSlug}-${timestamp}.json`
  const reportPath = path.join(reportDir, reportFilename)

  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

  // ── Summary ───────────────────────────────────────────────────
  console.log('[parser:dry-run] Report')
  console.log(`  Saved         : ${reportPath}`)
  console.log(`  Errors        : ${report.totals.errors}`)
  console.log(`  Warnings      : ${report.totals.warnings}`)
  console.log(`  Info          : ${report.totals.infos}`)
  console.log(`  plan_ok       : ${report.plan_ok}`)
  hr()

  const hasErrors = report.totals.errors > 0
  const planFailed = !report.plan_ok

  if (strict && (hasErrors || planFailed)) {
    console.log('[parser:dry-run] FAIL (--strict) — errors present or plan failed.')
    console.log('  Resolve all errors before proceeding to staged writes.')
    process.exit(1)
  }

  if (planFailed) {
    console.log('[parser:dry-run] FAIL — planner returned ok=false. See errors above.')
    console.log('  Run with --strict to enforce exit code.')
    process.exit(strict ? 1 : 0)
  }

  if (hasErrors && !strict) {
    console.log('[parser:dry-run] PASS (with errors) — plan ok, but validation errors found.')
    console.log('  Run with --strict to enforce exit code on errors.')
  } else if (report.totals.warnings > 0 && !hasErrors) {
    console.log('[parser:dry-run] PASS (with warnings) — plan ok. Review warnings before staged write.')
  } else {
    console.log('[parser:dry-run] PASS — plan valid, no errors.')
  }

  console.log('  No DB writes performed.')
  console.log()
}

main()
