#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-insert-preview.ts
 *
 * Local-only DB insertion readiness preview. Reads a parser input bundle and
 * saved AI output, runs the full planner + validation contracts, and writes a
 * redacted JSON preview report describing the exact intended insert order,
 * payload shapes, temp key mapping, and relationship strategy.
 *
 * This is NOT the actual insertion. No DB writes. No Supabase client.
 * It is the final safety gate to review before any staged write is approved.
 *
 * Usage:
 *   pnpm parser:insert-preview -- \
 *     --input ".local/parser-inputs/<bundle>.json" \
 *     --ai-output ".local/parser-ai-outputs/<output>.json"
 *
 *   Optional:
 *     --strict   Exit non-zero if dry-run validation has any errors
 *     --out ".local/parser-insert-previews/custom.json"
 *
 * --input      Bundle JSON from parser:bundle (required)
 * --ai-output  Saved AI output from parser:ai-local (required)
 * --strict     Exit non-zero on any validation errors or plan failures
 * --out        Custom output path (must be inside .local/parser-insert-previews/)
 *
 * No DB writes. No AI calls. No Supabase client. No file uploads.
 * Preview is written to .local/parser-insert-previews/ (gitignored).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import { planParserOutputInsertion } from '../lib/parser/map-to-staged'
import { buildDryRunReport } from '../lib/parser/dry-run-report'
import type { ParserOutput, ParserRunContext } from '../lib/parser/types'
import type {
  ParserInsertionPlan,
  PlannedStagedSystem,
  PlannedStagedSystemProfile,
  PlannedStagedComponent,
  PlannedStagedSystemColour,
  PlannedStagedSystemComponent,
  PlannedFieldVerification,
  PlannedParserFieldEvidence,
} from '../lib/parser/map-to-staged'
import type { DryRunReport } from '../lib/parser/dry-run-report'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

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

function toRelativePath(absPath: string): string {
  const rel = path.relative(REPO_ROOT, absPath)
  return rel.replace(/\\/g, '/')
}

// Resolve abs path → repo-relative if it's inside REPO_ROOT, else '[external path]'
function safeRelPath(absPath: string | null | undefined): string | null {
  if (!absPath) return null
  const rel = path.relative(REPO_ROOT, absPath)
  if (rel.startsWith('..')) return '[external path — not shown]'
  return rel.replace(/\\/g, '/')
}

// Guardrail: path must be under .local/<subdir>/ when resolved
function requireUnder(resolvedPath: string, subdir: string, label: string): void {
  const expectedPrefix = path.join(REPO_ROOT, '.local', subdir)
  if (!resolvedPath.startsWith(expectedPrefix)) {
    console.error(
      `[ERROR] ${label} must be under .local/${subdir}/ — got: ${safeRelPath(resolvedPath) ?? resolvedPath}`,
    )
    process.exit(1)
  }
}

// ----------------------------------------------------------
// Redaction
// ----------------------------------------------------------

// Field names matching these patterns are redacted in sample payloads.
// Conservative — errs on the side of not exposing storage/infra values.
function shouldRedactField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase()
  if (lower === 'url' || lower.endsWith('_url')) return true
  if (lower === 'path' || lower.endsWith('_path')) return true
  if (lower.includes('bucket')) return true
  if (lower.includes('token')) return true
  if (lower.includes('secret')) return true
  if (lower.includes('storage_key')) return true
  if (lower.includes('provider_key')) return true
  return false
}

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    out[k] = shouldRedactField(k) && v !== null ? '[REDACTED]' : v
  }
  return out
}

function redactSample<T extends Record<string, unknown>>(
  rows: T[],
  cap = 3,
): Record<string, unknown>[] {
  return rows.slice(0, cap).map(r => redactRow(r))
}

// ----------------------------------------------------------
// Preview report types
// ----------------------------------------------------------

type InsertOrderStep = {
  step: number
  table: string
  row_count: number
  description: string
  depends_on: string[]
  relationship_note: string
}

type TempKeyEntry = {
  temp_key: string
  target_table: string
  display_name: string
  linked_to: string | null
  link_type: string | null
}

type RequiredFieldsSummary = {
  all_ok: boolean
  errors: string[]
  warnings: string[]
}

type SamplePayloads = {
  staged_systems: Record<string, unknown>[]
  staged_system_profiles: Record<string, unknown>[]
  staged_components: Record<string, unknown>[]
  staged_system_colours: Record<string, unknown>[]
  staged_system_components: Record<string, unknown>[]
  field_verifications: Record<string, unknown>[]
  parser_field_evidence: Record<string, unknown>[]
}

export type InsertPreviewReport = {
  schema_version: '1'
  generated_at: string

  source: {
    bundle_file: string
    ai_output_file: string
    source_document_id: string | null
    manufacturer_id: string | null
    manufacturer_name: string | null
    manufacturer_slug: string | null
    document_name: string | null
    chunk_count: number | null
    page_count: number | null
    ai_source: string
  }

  validation: {
    plan_ok: boolean
    errors: number
    warnings: number
    infos: number
  }

  insert_order: InsertOrderStep[]

  row_counts: {
    staged_systems: number
    staged_system_profiles: number
    staged_components: number
    staged_system_colours: number
    staged_system_components: number
    field_verifications: number
    parser_field_evidence: number
    media_candidates: number
    total_catalogue_rows: number
    total_evidence_rows: number
    total_all_rows: number
  }

  relationship_strategy: string

  temp_key_mapping: TempKeyEntry[]

  required_fields_summary: RequiredFieldsSummary

  evidence_coverage: {
    entities_with_field_sources: number
    entities_without_field_sources: number
    total_field_source_entries: number
    total_uncertain_fields: number
    evidence_row_parity: boolean
  }

  issues_summary: {
    errors: Array<{ code: string; message: string; path?: string }>
    warnings: Array<{ code: string; message: string; path?: string }>
    infos: Array<{ code: string; message: string; path?: string }>
  }

  sample_payloads: SamplePayloads

  safety: {
    no_db_writes: true
    no_supabase_client: true
    no_ai_calls: true
    staged_write_requires_explicit_approval: true
    next_step: string
  }
}

// ----------------------------------------------------------
// Insert order builder
// ----------------------------------------------------------

function buildInsertOrder(plan: ParserInsertionPlan): InsertOrderStep[] {
  return [
    {
      step: 1,
      table: 'staged_systems',
      row_count: plan.summary.stagedSystems,
      description: 'Root product system records. No intra-plan FK dependencies.',
      depends_on: [],
      relationship_note:
        'Requires manufacturer_id → resolved to real UUID from data_studio_manufacturers at insertion time. ' +
        'After insert, each row yields a real staged_systems.id used by steps 2, 4, 5.',
    },
    {
      step: 2,
      table: 'staged_system_profiles',
      row_count: plan.summary.stagedSystemProfiles,
      description: 'Dimensional profile variants of systems. FK: staged_system_id.',
      depends_on: ['staged_systems'],
      relationship_note:
        '_staged_system_temp_key → staged_systems.id (resolved after step 1 inserts). ' +
        'Unresolved _staged_system_temp_key = null would cause FK violation — planner flags these as errors.',
    },
    {
      step: 3,
      table: 'staged_components',
      row_count: plan.summary.stagedComponents,
      description: 'Supporting parts, accessories, fixings, and trims. No intra-plan FK dependencies.',
      depends_on: [],
      relationship_note:
        'Requires manufacturer_id → resolved to real UUID (same as step 1). ' +
        'After insert, each row yields a real staged_components.id used by step 5.',
    },
    {
      step: 4,
      table: 'staged_system_colours',
      row_count: plan.summary.stagedSystemColours,
      description: 'Colour/finish options for systems. FK: staged_system_id.',
      depends_on: ['staged_systems'],
      relationship_note:
        '_staged_system_temp_key → staged_systems.id (resolved after step 1). ' +
        'Unresolved _staged_system_temp_key = null would cause FK violation.',
    },
    {
      step: 5,
      table: 'staged_system_components',
      row_count: plan.summary.stagedSystemComponents,
      description: 'System↔component relationship links. FK: staged_system_id + staged_component_id.',
      depends_on: ['staged_systems', 'staged_components'],
      relationship_note:
        '_staged_system_temp_key → staged_systems.id (step 1), ' +
        '_staged_component_temp_key → staged_components.id (step 3). ' +
        'Both must resolve before this step executes.',
    },
    {
      step: 6,
      table: 'field_verifications',
      row_count: plan.summary.fieldVerifications,
      description:
        'Per-field reviewer rows seeded as "pending". ' +
        'UNIQUE (entity_type, entity_id, field_name) — insertion layer enforces dedup.',
      depends_on: [
        'staged_systems',
        'staged_system_profiles',
        'staged_components',
        'staged_system_colours',
        'staged_system_components',
      ],
      relationship_note:
        'entity_temp_key → real entity UUID resolved from whichever staged table the entity_type references. ' +
        'verified_value is always null at seed time — set by reviewer later.',
    },
    {
      step: 7,
      table: 'parser_field_evidence',
      row_count: plan.summary.parserFieldEvidence,
      description:
        'Append-only extraction history rows. One row per field per run. No UNIQUE constraint.',
      depends_on: [
        'staged_systems',
        'staged_system_profiles',
        'staged_components',
        'staged_system_colours',
        'staged_system_components',
      ],
      relationship_note:
        'entity_temp_key → real entity UUID (same resolution as step 6). ' +
        'extraction_run_id must reference an existing extraction_runs row.',
    },
  ]
}

// ----------------------------------------------------------
// Temp key mapping builder
// ----------------------------------------------------------

function buildTempKeyMapping(plan: ParserInsertionPlan): TempKeyEntry[] {
  const entries: TempKeyEntry[] = []

  for (const s of plan.stagedSystems) {
    entries.push({
      temp_key: s._temp_key,
      target_table: 'staged_systems',
      display_name: s.name ?? s._temp_key,
      linked_to: null,
      link_type: null,
    })
  }

  for (const p of plan.stagedSystemProfiles) {
    entries.push({
      temp_key: p._temp_key,
      target_table: 'staged_system_profiles',
      display_name: p.profile_name ?? p.name ?? p._temp_key,
      linked_to: p._staged_system_temp_key,
      link_type: p._staged_system_temp_key ? 'staged_system_id' : 'UNRESOLVED',
    })
  }

  for (const c of plan.stagedComponents) {
    entries.push({
      temp_key: c._temp_key,
      target_table: 'staged_components',
      display_name: c.name ?? c._temp_key,
      linked_to: null,
      link_type: null,
    })
  }

  for (const c of plan.stagedSystemColours) {
    entries.push({
      temp_key: c._temp_key,
      target_table: 'staged_system_colours',
      display_name: c.colour_name ?? c._temp_key,
      linked_to: c._staged_system_temp_key,
      link_type: c._staged_system_temp_key ? 'staged_system_id' : 'UNRESOLVED',
    })
  }

  for (const sc of plan.stagedSystemComponents) {
    const display = [
      sc._staged_system_temp_key ?? 'UNRESOLVED_SYSTEM',
      '→',
      sc._staged_component_temp_key ?? 'UNRESOLVED_COMPONENT',
      `(${sc.role})`,
    ].join(' ')
    entries.push({
      temp_key: sc._temp_key,
      target_table: 'staged_system_components',
      display_name: display,
      linked_to: sc._staged_system_temp_key,
      link_type: 'staged_system_id + staged_component_id',
    })
  }

  return entries
}

// ----------------------------------------------------------
// Required fields summary builder
// ----------------------------------------------------------

function buildRequiredFieldsSummary(report: DryRunReport): RequiredFieldsSummary {
  const errorChecks = report.checks.filter(
    c => c.severity === 'error' && c.category === 'required_fields',
  )
  const warnChecks = report.checks.filter(
    c => c.severity === 'warning' && c.category === 'required_fields',
  )
  return {
    all_ok: errorChecks.length === 0,
    errors: errorChecks.map(c => (c.path ? `${c.path}: ${c.message}` : c.message)),
    warnings: warnChecks.map(c => (c.path ? `${c.path}: ${c.message}` : c.message)),
  }
}

// ----------------------------------------------------------
// Console helpers
// ----------------------------------------------------------

function hr() {
  console.log('─'.repeat(60))
}

// ----------------------------------------------------------
// Main
// ----------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const strict = args.strict === true

  // ── Require --input ───────────────────────────────────────
  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <bundle.json> is required')
    console.error(
      '  Example: pnpm parser:insert-preview -- --input ".local/parser-inputs/some-bundle.json" --ai-output ".local/parser-ai-outputs/some-output.json"',
    )
    process.exit(1)
  }

  // ── Require --ai-output ───────────────────────────────────
  const aiOutputArg = args['ai-output']
  if (!aiOutputArg || typeof aiOutputArg !== 'string') {
    console.error('[ERROR] --ai-output <output.json> is required')
    console.error(
      '  Run pnpm parser:ai-local -- --input "..." first, then pass the output here.',
    )
    console.error(
      '  For fixture testing: pnpm parser:ai-local -- --input "..." --fixture',
    )
    process.exit(1)
  }

  // ── Resolve and validate input paths ─────────────────────
  const resolvedInput = resolveDotLocal(inputArg)
  requireUnder(resolvedInput, 'parser-inputs', '--input')

  if (!existsSync(resolvedInput)) {
    console.error(`[ERROR] Bundle file not found: ${safeRelPath(resolvedInput)}`)
    console.error('  Run pnpm parser:bundle first.')
    process.exit(1)
  }

  const resolvedAiOutput = resolveDotLocal(aiOutputArg)
  requireUnder(resolvedAiOutput, 'parser-ai-outputs', '--ai-output')

  if (!existsSync(resolvedAiOutput)) {
    console.error(`[ERROR] AI output file not found: ${safeRelPath(resolvedAiOutput)}`)
    console.error('  Run pnpm parser:ai-local first.')
    process.exit(1)
  }

  // ── Validate custom --out if provided ────────────────────
  const outArg = args.out
  if (outArg && typeof outArg === 'string') {
    const resolvedOut = resolveDotLocal(outArg)
    requireUnder(resolvedOut, 'parser-insert-previews', '--out')
  }

  // ── Load bundle ───────────────────────────────────────────
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

  // ── Load AI output ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiOutputFile: any
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

  const aiOutputMeta: Record<string, unknown> = aiOutputFile._meta ?? {}
  const aiSource: string = aiOutputMeta.fixture_mode
    ? `fixture (${aiOutputMeta.fixture_label ?? 'unknown'})`
    : `AI (${aiOutputMeta.model ?? 'unknown model'})`

  // ── Build candidate ───────────────────────────────────────
  const raw = aiOutputFile.parser_output
  const requiredArrays = [
    'systems',
    'system_profiles',
    'components',
    'system_components',
    'system_colours',
  ] as const
  const missingArrays = requiredArrays.filter(k => !Array.isArray(raw[k]))
  if (missingArrays.length > 0) {
    console.warn(`[WARN] AI output missing top-level arrays: ${missingArrays.join(', ')}`)
    for (const k of missingArrays) raw[k] = []
  }
  if (!Array.isArray(raw.warnings)) raw.warnings = []
  if (!Array.isArray(raw.ignored_content_notes)) raw.ignored_content_notes = []

  const candidate = raw as ParserOutput
  const fixtureLabel = aiSource

  // ── Run context ───────────────────────────────────────────
  const context: Partial<ParserRunContext> = {
    source_document_id: document?.id ?? undefined,
    manufacturer_id: manufacturer?.id ?? undefined,
    extraction_run_id: extraction_run?.id ?? undefined,
    parsed_at: new Date().toISOString(),
  }

  // ── Print header ──────────────────────────────────────────
  const modeTag = strict ? ' (--strict mode)' : ''
  hr()
  console.log(`[parser:insert-preview] Source summary${modeTag}`)
  console.log(`  Manufacturer  : ${manufacturer?.name ?? '?'} (${manufacturer?.slug ?? '?'})`)
  console.log(`  Document      : ${document?.document_name ?? document?.id ?? '?'}`)
  console.log(`  Doc status    : ${document?.status ?? '?'}`)
  console.log(`  Chunks        : ${combined_text_metadata?.chunk_count ?? '?'}`)
  console.log(`  AI source     : ${aiSource}`)
  console.log(`  Bundle file   : ${toRelativePath(resolvedInput)}`)
  console.log(`  AI output     : ${toRelativePath(resolvedAiOutput)}`)
  hr()

  // ── Plan + dry-run report (reuse existing contracts) ──────
  const plan = planParserOutputInsertion(candidate, context)

  const report: DryRunReport = buildDryRunReport({
    output: candidate,
    plan,
    fixtureLabel,
    bundleDocumentId: document?.id ?? null,
    bundleDocumentName: document?.document_name ?? null,
  })

  // ── Strict gate — exit if dry-run has errors ──────────────
  if (strict && (report.totals.errors > 0 || !report.plan_ok)) {
    console.log('[parser:insert-preview] FAIL (--strict) — dry-run validation has errors.')
    console.log('  Errors:')
    for (const c of report.checks.filter(ch => ch.severity === 'error').slice(0, 20)) {
      const loc = c.path ? ` ${c.path}:` : ''
      console.log(`    [${c.code}]${loc} ${c.message}`)
    }
    console.log('  Resolve all errors before reviewing an insert preview.')
    process.exit(1)
  }

  if (!report.plan_ok) {
    console.log('[parser:insert-preview] FAIL — planner returned ok=false.')
    console.log('  Fix all planning errors before proceeding.')
    process.exit(1)
  }

  // ── Build insert order ────────────────────────────────────
  const insertOrder = buildInsertOrder(plan)

  // ── Build row counts ──────────────────────────────────────
  const totalCatalogueRows =
    plan.summary.stagedSystems +
    plan.summary.stagedSystemProfiles +
    plan.summary.stagedComponents +
    plan.summary.stagedSystemColours +
    plan.summary.stagedSystemComponents
  const totalEvidenceRows =
    plan.summary.fieldVerifications + plan.summary.parserFieldEvidence

  const rowCounts = {
    staged_systems: plan.summary.stagedSystems,
    staged_system_profiles: plan.summary.stagedSystemProfiles,
    staged_components: plan.summary.stagedComponents,
    staged_system_colours: plan.summary.stagedSystemColours,
    staged_system_components: plan.summary.stagedSystemComponents,
    field_verifications: plan.summary.fieldVerifications,
    parser_field_evidence: plan.summary.parserFieldEvidence,
    media_candidates: plan.summary.mediaCandidates,
    total_catalogue_rows: totalCatalogueRows,
    total_evidence_rows: totalEvidenceRows,
    total_all_rows: totalCatalogueRows + totalEvidenceRows,
  }

  // ── Build temp key mapping ────────────────────────────────
  const tempKeyMapping = buildTempKeyMapping(plan)

  // ── Build required fields summary ────────────────────────
  const reqFieldsSummary = buildRequiredFieldsSummary(report)

  // ── Build issues summary ──────────────────────────────────
  const issuesSummary = {
    errors: report.checks
      .filter(c => c.severity === 'error')
      .map(c => ({ code: c.code, message: c.message, ...(c.path ? { path: c.path } : {}) })),
    warnings: report.checks
      .filter(c => c.severity === 'warning')
      .map(c => ({ code: c.code, message: c.message, ...(c.path ? { path: c.path } : {}) })),
    infos: report.checks
      .filter(c => c.severity === 'info')
      .map(c => ({ code: c.code, message: c.message, ...(c.path ? { path: c.path } : {}) })),
  }

  // ── Build redacted sample payloads ────────────────────────
  const samplePayloads: SamplePayloads = {
    staged_systems: redactSample(plan.stagedSystems as unknown as Record<string, unknown>[]),
    staged_system_profiles: redactSample(
      plan.stagedSystemProfiles as unknown as Record<string, unknown>[],
    ),
    staged_components: redactSample(
      plan.stagedComponents as unknown as Record<string, unknown>[],
    ),
    staged_system_colours: redactSample(
      plan.stagedSystemColours as unknown as Record<string, unknown>[],
    ),
    staged_system_components: redactSample(
      plan.stagedSystemComponents as unknown as Record<string, unknown>[],
    ),
    field_verifications: redactSample(
      plan.fieldVerifications as unknown as Record<string, unknown>[],
    ),
    parser_field_evidence: redactSample(
      plan.parserFieldEvidence as unknown as Record<string, unknown>[],
    ),
  }

  // ── Assemble preview report ───────────────────────────────
  const preview: InsertPreviewReport = {
    schema_version: '1',
    generated_at: new Date().toISOString(),

    source: {
      bundle_file: toRelativePath(resolvedInput),
      ai_output_file: toRelativePath(resolvedAiOutput),
      source_document_id: document?.id ?? null,
      manufacturer_id: manufacturer?.id ?? null,
      manufacturer_name: manufacturer?.name ?? null,
      manufacturer_slug: manufacturer?.slug ?? null,
      document_name: document?.document_name ?? null,
      chunk_count: combined_text_metadata?.chunk_count ?? null,
      page_count: combined_text_metadata?.page_count ?? null,
      ai_source: aiSource,
    },

    validation: {
      plan_ok: report.plan_ok,
      errors: report.totals.errors,
      warnings: report.totals.warnings,
      infos: report.totals.infos,
    },

    insert_order: insertOrder,

    row_counts: rowCounts,

    relationship_strategy:
      'Temp keys are parser-only placeholders. The insertion layer resolves them to real ' +
      'DB UUIDs in dependency order: systems and components are inserted first (no intra-plan FKs). ' +
      'After each staged insert, the returned UUID replaces the temp key in a local resolution map. ' +
      'Profiles, colours, and system_component links are inserted in subsequent steps using the ' +
      'resolved UUIDs. field_verifications and parser_field_evidence rows are inserted last, after ' +
      'all staged entity UUIDs are known. The insertion layer (not yet implemented) will enforce ' +
      'this order within a single DB transaction.',

    temp_key_mapping: tempKeyMapping,

    required_fields_summary: reqFieldsSummary,

    evidence_coverage: report.evidence_coverage,

    issues_summary: issuesSummary,

    sample_payloads: samplePayloads,

    safety: {
      no_db_writes: true,
      no_supabase_client: true,
      no_ai_calls: true,
      staged_write_requires_explicit_approval: true,
      next_step:
        'Review this preview to confirm payload shapes and relationship mapping are correct. ' +
        'The actual staged insertion is a separate future task that requires explicit approval ' +
        'before any code is written.',
    },
  }

  // ── Print terminal summary ────────────────────────────────
  console.log('[parser:insert-preview] Planned row counts')
  console.log(`  staged_systems           : ${rowCounts.staged_systems}`)
  console.log(`  staged_system_profiles   : ${rowCounts.staged_system_profiles}`)
  console.log(`  staged_components        : ${rowCounts.staged_components}`)
  console.log(`  staged_system_colours    : ${rowCounts.staged_system_colours}`)
  console.log(`  staged_system_components : ${rowCounts.staged_system_components}`)
  console.log(`  ─────`)
  console.log(`  total_catalogue_rows     : ${rowCounts.total_catalogue_rows}`)
  console.log(`  field_verifications      : ${rowCounts.field_verifications}`)
  console.log(`  parser_field_evidence    : ${rowCounts.parser_field_evidence}`)
  console.log(`  total_evidence_rows      : ${rowCounts.total_evidence_rows}`)
  console.log(`  media_candidates         : ${rowCounts.media_candidates}`)
  hr()

  console.log('[parser:insert-preview] Insert order (transaction sequence)')
  for (const step of insertOrder) {
    const deps =
      step.depends_on.length === 0 ? 'none' : step.depends_on.join(', ')
    console.log(
      `  Step ${step.step}: ${step.table.padEnd(28)} ${String(step.row_count).padStart(4)} rows  deps: ${deps}`,
    )
  }
  hr()

  console.log('[parser:insert-preview] Temp key mapping')
  for (const entry of tempKeyMapping) {
    const link =
      entry.linked_to
        ? ` → ${entry.linked_to} (${entry.link_type})`
        : ''
    console.log(`  ${entry.temp_key.padEnd(14)} ${entry.target_table.padEnd(26)} ${entry.display_name}${link}`)
  }
  hr()

  console.log('[parser:insert-preview] Validation')
  console.log(`  plan_ok   : ${report.plan_ok}`)
  console.log(`  Errors    : ${report.totals.errors}`)
  console.log(`  Warnings  : ${report.totals.warnings}`)
  console.log(`  Info      : ${report.totals.infos}`)
  hr()

  if (issuesSummary.errors.length > 0) {
    console.log('[parser:insert-preview] Errors:')
    for (const e of issuesSummary.errors.slice(0, 20)) {
      const loc = e.path ? ` ${e.path}:` : ''
      console.log(`  [ERROR] [${e.code}]${loc} ${e.message}`)
    }
    hr()
  }

  if (issuesSummary.warnings.length > 0) {
    console.log('[parser:insert-preview] Warnings:')
    for (const w of issuesSummary.warnings.slice(0, 20)) {
      const loc = w.path ? ` ${w.path}:` : ''
      console.log(`  [WARN]  [${w.code}]${loc} ${w.message}`)
    }
    hr()
  }

  // ── Save report ───────────────────────────────────────────
  const previewDir = path.join(REPO_ROOT, '.local', 'parser-insert-previews')
  mkdirSync(previewDir, { recursive: true })

  let reportPath: string
  if (outArg && typeof outArg === 'string') {
    reportPath = resolveDotLocal(outArg)
  } else {
    const docSlug = (document?.document_name ?? document?.id ?? 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    reportPath = path.join(previewDir, `${docSlug}-${timestamp}.json`)
  }

  writeFileSync(reportPath, JSON.stringify(preview, null, 2), 'utf8')

  console.log('[parser:insert-preview] Report')
  console.log(`  Saved         : ${toRelativePath(reportPath)}`)
  console.log(`  Payloads      : redacted (url, path, bucket, token, secret fields → [REDACTED])`)
  console.log(`  Sample rows   : up to 3 per table`)
  console.log(`  DB writes     : none`)
  hr()

  if (report.totals.errors > 0) {
    console.log(
      '[parser:insert-preview] READY WITH ERRORS — resolve validation errors before inserting.',
    )
  } else if (report.totals.warnings > 0) {
    console.log(
      '[parser:insert-preview] READY (with warnings) — review warnings before approving staged write.',
    )
  } else {
    console.log(
      '[parser:insert-preview] READY — plan valid, no errors. ' +
        'Staged insertion requires explicit approval and a separate implementation task.',
    )
  }

  console.log('  No DB writes performed.')
  console.log()
}

main()
