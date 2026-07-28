#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-dry-run.ts
 *
 * Local-only dry-run: loads a parser input bundle plus an optional AI output
 * file, runs the full validation + insertion planning contracts, saves a
 * structured JSON report, and prints a readable summary.
 *
 * Usage (fixture mode — no AI output needed):
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json"
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json" --strict
 *
 * Usage (AI output mode — validate real AI parser output):
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/<bundle>.json" \
 *                          --ai-output ".local/parser-ai-outputs/<output>.json"
 *   pnpm parser:dry-run -- --input "..." --ai-output "..." --strict
 *
 * --input      Bundle JSON from parser:bundle (required — provides run context)
 * --ai-output  AI output JSON from parser:ai-local (optional — replaces fixture)
 * --strict     Exit non-zero on any validation errors or plan failures
 *
 * No DB writes. No AI calls. No Supabase client. No file uploads.
 * Report is written to .local/parser-reports/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import { planParserOutputInsertion } from '../lib/parser/map-to-staged'
import { buildDryRunReport } from '../lib/parser/dry-run-report'
import type { ParserOutput, ParserRunContext } from '../lib/parser/types'
import type { DryRunReport, DryRunCheck } from '../lib/parser/dry-run-report'
import { parseArgs } from './lib/cli.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

function resolveDotLocal(p: string): string {
  return p.startsWith('.local/')
    ? path.join(REPO_ROOT, p)
    : path.resolve(p)
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
    const tag =
      issue.severity === 'error' ? '[ERROR]' :
      issue.severity === 'warning' ? '[WARN] ' : '[INFO] '
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

  // ── Load bundle (required for run context) ────────────────────
  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <bundle.json> is required')
    console.error(
      '  Example: pnpm parser:dry-run -- --input ".local/parser-inputs/some-bundle.json"'
    )
    process.exit(1)
  }

  const resolvedInput = resolveDotLocal(inputArg)
  if (!existsSync(resolvedInput)) {
    console.error(`[ERROR] Bundle file not found: ${resolvedInput}`)
    console.error('  Run pnpm parser:bundle first.')
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

  // ── Load AI output (optional) ─────────────────────────────────
  const aiOutputArg = args['ai-output']
  let aiOutputMeta: Record<string, unknown> | null = null
  let candidateSource = 'fixture'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiOutputFile: any = null
  if (aiOutputArg && typeof aiOutputArg === 'string') {
    const resolvedAiOutput = resolveDotLocal(aiOutputArg)
    if (!existsSync(resolvedAiOutput)) {
      console.error(`[ERROR] AI output file not found: ${resolvedAiOutput}`)
      console.error('  Run pnpm parser:ai-local first.')
      process.exit(1)
    }
    try {
      aiOutputFile = JSON.parse(readFileSync(resolvedAiOutput, 'utf8'))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[ERROR] Could not parse AI output file: ${msg}`)
      process.exit(1)
    }
    if (!aiOutputFile.parser_output) {
      console.error('[ERROR] AI output file has no parser_output field.')
      console.error('  The file may have a parse_error. Inspect it before re-running.')
      process.exit(1)
    }
    aiOutputMeta = aiOutputFile._meta ?? null
    candidateSource = aiOutputMeta?.fixture_mode
      ? `fixture via parser:ai-local (${aiOutputMeta?.fixture_label ?? 'unknown'})`
      : `AI (${aiOutputMeta?.model ?? 'unknown model'})`
  }

  // ── Print bundle summary ──────────────────────────────────────
  const modeTag = strict ? ' (--strict mode)' : ''
  const aiTag = aiOutputArg ? ' + AI output' : ''
  hr()
  console.log(`[parser:dry-run] Bundle summary${modeTag}${aiTag}`)
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

  // ── Build parser output candidate ────────────────────────────
  let candidate: ParserOutput
  let fixtureLabel: string

  if (aiOutputFile) {
    // AI output path — validate the shape minimally before passing to planner
    const raw = aiOutputFile.parser_output
    const requiredArrays = ['systems', 'system_profiles', 'components', 'system_components', 'system_colours'] as const
    const missingArrays = requiredArrays.filter(k => !Array.isArray(raw[k]))
    if (missingArrays.length > 0) {
      console.warn(`[WARN] AI output is missing top-level arrays: ${missingArrays.join(', ')}`)
      console.warn('  Adding empty arrays — validation will flag missing entities.')
      for (const k of missingArrays) raw[k] = []
    }
    if (!Array.isArray(raw.warnings)) raw.warnings = []
    if (!Array.isArray(raw.ignored_content_notes)) raw.ignored_content_notes = []

    candidate = raw as ParserOutput
    fixtureLabel = candidateSource

    console.log('[parser:dry-run] Parser output source')
    console.log(`  Source        : ${candidateSource}`)
    if (aiOutputMeta?.model) console.log(`  Model         : ${aiOutputMeta.model}`)
    if (aiOutputMeta?.usage) {
      const u = aiOutputMeta.usage as Record<string, unknown>
      console.log(`  Input tokens  : ${u.input_tokens ?? '?'}`)
      console.log(`  Output tokens : ${u.output_tokens ?? '?'}`)
    }
    console.log(`  AI output     : ${resolveDotLocal(aiOutputArg as string)}`)
    hr()
  } else {
    // Fixture path (no AI output provided)
    candidate = {
      ...mockNTWAvenueDecking,
      source_document_id: document?.id ?? null,
    }
    fixtureLabel = 'mockNTWAvenueDecking (lib/parser/fixtures.ts)'

    console.log('[parser:dry-run] Parser output candidate')
    console.log(`  Fixture       : ${fixtureLabel}`)
    console.log('  NOTE: No AI call made. This exercises pipeline contracts,')
    console.log('        not actual catalogue data from the real PDF.')
    hr()
  }

  // ── Run context ───────────────────────────────────────────────
  const context: Partial<ParserRunContext> = {
    source_document_id: document?.id ?? undefined,
    manufacturer_id: manufacturer?.id ?? undefined,
    extraction_run_id: extraction_run?.id ?? undefined,
    parsed_at: new Date().toISOString(),
  }

  // ── Plan + report ─────────────────────────────────────────────
  const plan = planParserOutputInsertion(candidate, context)

  const report: DryRunReport = buildDryRunReport({
    output: candidate,
    plan,
    fixtureLabel,
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
  const aiSuffix = aiOutputFile ? '-ai' : '-fixture'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportPath = path.join(reportDir, `${docSlug}${aiSuffix}-${timestamp}.json`)

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
