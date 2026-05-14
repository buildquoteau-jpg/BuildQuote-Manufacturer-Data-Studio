#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-dry-run.ts
 *
 * Local-only dry-run: loads a parser input bundle, applies a fixture parser
 * output, validates it against the parser contract, and produces a staged
 * insertion plan — without writing anything to the database.
 *
 * Usage:
 *   pnpm parser:dry-run -- --input ".local/parser-inputs/some-bundle.json"
 *
 * No DB writes. No AI calls. No Supabase client. No file uploads.
 *
 * The fixture used here (mockNTWAvenueDecking) exercises the full pipeline
 * contract. It is NOT AI-extracted content from the real PDF — that step
 * comes after dry-run passes and AI parser integration is approved.
 */

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import { planParserOutputInsertion } from '../lib/parser/map-to-staged'
import type { ParserOutput, ParserRunContext } from '../lib/parser/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// scripts/ → .. → apps/web → .. → monorepo root
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

async function main() {
  const args = parseArgs(process.argv.slice(2))

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
  console.log('[parser:dry-run] Bundle summary')
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

  console.log('[parser:dry-run] Parser output candidate')
  console.log('  Fixture       : mockNTWAvenueDecking (lib/parser/fixtures.ts)')
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
  console.log(`  staged_systems           : ${plan.summary.stagedSystems}`)
  console.log(`  staged_system_profiles   : ${plan.summary.stagedSystemProfiles}`)
  console.log(`  staged_components        : ${plan.summary.stagedComponents}`)
  console.log(`  staged_system_colours    : ${plan.summary.stagedSystemColours}`)
  console.log(`  staged_system_components : ${plan.summary.stagedSystemComponents}`)
  console.log(`  field_verifications      : ${plan.summary.fieldVerifications}`)
  console.log(`  parser_field_evidence    : ${plan.summary.parserFieldEvidence}`)
  console.log(`  media_candidates         : ${plan.summary.mediaCandidates}`)
  hr()

  // ── Issues ────────────────────────────────────────────────────
  const errors = plan.issues.filter(i => i.severity === 'error')
  const warnings = plan.issues.filter(i => i.severity === 'warning')
  const infos = plan.issues.filter(i => i.severity === 'info')

  if (errors.length > 0) {
    console.log('[parser:dry-run] Errors:')
    for (const e of errors) {
      console.log(`  [ERROR] [${e.code}]${e.path ? ' ' + e.path + ':' : ''} ${e.message}`)
    }
    hr()
  }

  if (warnings.length > 0) {
    console.log('[parser:dry-run] Warnings:')
    for (const w of warnings) {
      console.log(`  [WARN]  [${w.code}]${w.path ? ' ' + w.path + ':' : ''} ${w.message}`)
    }
    hr()
  }

  if (infos.length > 0) {
    console.log('[parser:dry-run] Info:')
    for (const info of infos) {
      console.log(`  [INFO]  [${info.code}] ${info.message}`)
    }
    hr()
  }

  // ── Result ────────────────────────────────────────────────────
  console.log('[parser:dry-run] Result')
  console.log(`  ok               : ${plan.ok}`)
  console.log(`  planning errors  : ${plan.summary.planningErrors}`)
  console.log(`  planning warnings: ${plan.summary.planningWarnings}`)
  hr()

  if (plan.ok) {
    console.log('[parser:dry-run] PASS — plan is valid. No DB writes performed.')
    console.log('  Next step: run AI parser against bundle, then re-run dry-run')
    console.log('             with real parser output before approving staged writes.')
  } else {
    console.log('[parser:dry-run] FAIL — plan has errors. See issues above.')
    process.exit(1)
  }
  console.log()
}

main()
