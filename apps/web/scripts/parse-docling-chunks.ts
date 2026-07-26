#!/usr/bin/env tsx
/**
 * apps/web/scripts/parse-docling-chunks.ts
 *
 * Local-only. Reads a Docling parser_chunks.json and runs a structured
 * multi-pass extraction workflow across 5 targeted passes:
 *   1. systems    — product ranges/categories
 *   2. profiles   — dimensional board/sheet variants
 *   3. components — fixings, clips, trims, accessories
 *   4. colours    — colour names and SKU suffixes
 *   5. relationships — component ↔ system links
 *
 * Runs in FIXTURE mode by default (no API key needed).
 * AI extraction requires an explicit --ai flag.
 *
 * SAFETY RULES — read before running:
 *   - Local only. No Supabase. No DB writes. No service role.
 *   - Input must be under .local/ (gitignored).
 *   - Output goes to .local/parser-outputs/docling/ (gitignored).
 *   - API keys are never printed. Chunk text is never printed to terminal.
 *
 * Usage:
 *   pnpm docling:parse -- --input ".local/parser-inputs/docling/<folder>/parser_chunks.json"
 *   pnpm docling:parse -- --input "..." --dry-run
 *   pnpm docling:parse -- --input "..." --ai
 *   pnpm docling:parse -- --input "..." --ai --provider openai --model gpt-4.1
 *   pnpm docling:parse -- --check-keys
 *
 * --input      Path to parser_chunks.json (required)
 * --dry-run    Preview pass plan without writing any files
 * --ai         Enable live AI extraction (requires API key in .env.local)
 * --provider   anthropic (default) | openai  — only with --ai
 * --model      Model ID override              — only with --ai
 * --out-dir    Custom output dir (must be under .local/)
 * --manufacturer  Manufacturer slug matching a file in prompts/manufacturer-hints/ (e.g. james_hardie)
 * --only-pass     Run a single named pass only: systems | profiles | components | colours | relationships
 * --check-keys    Print API key diagnostics and exit
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnvFile, parseArgs } from './lib/cli.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ─── Env loading ──────────────────────────────────────────────────────────────

loadEnvFile(path.join(REPO_ROOT, '.env.local'))
loadEnvFile(path.join(REPO_ROOT, 'apps', 'web', '.env.local'))

// ─── Types ────────────────────────────────────────────────────────────────────

type PassName = 'systems' | 'profiles' | 'components' | 'colours' | 'relationships'
type Provider = 'anthropic' | 'openai'

interface DoclingChunk {
  chunk_index: number
  page_number: number | null
  chunk_type: 'text' | 'table' | 'spec_table'
  heading: string | null
  char_count: number
  raw_text: string
}

interface DoclingBundle {
  _meta: Record<string, unknown>
  document: {
    input_filename: string
    document_id: string | null
    page_count: number | null
    docling_output_dir: string
  }
  combined_text_metadata: {
    chunk_count: number
    total_chars: number
    chunk_type_counts: Record<string, number>
  }
  chunks: DoclingChunk[]
}

// Partial ParserOutput shape for each pass
interface PassResult {
  pass: PassName
  chunks_used: number
  chars_used: number
  fixture_mode: boolean
  // entity arrays (only the relevant one is non-empty per pass)
  systems: unknown[]
  system_profiles: unknown[]
  components: unknown[]
  system_colours: unknown[]
  system_components: unknown[]
  image_candidates: unknown[]
  warnings: string[]
  ignored_content_notes: string[]
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function resolveDotLocal(p: string): string {
  return p.startsWith('.local/')
    ? path.join(REPO_ROOT, p)
    : path.resolve(p)
}

function requireUnderLocal(resolvedPath: string, label: string): void {
  const localBase = path.join(REPO_ROOT, '.local')
  if (!resolvedPath.startsWith(localBase + path.sep) && resolvedPath !== localBase) {
    console.error(`[ERROR] ${label} must be under .local/`)
    console.error(`  Got: ${resolvedPath}`)
    process.exit(1)
  }
}

function hr() { console.log('─'.repeat(60)) }

// ─── Pass chunk selection ─────────────────────────────────────────────────────
//
// Each pass targets a subset of chunks to keep prompts focused and small.
// Overlapping is intentional — profiles need spec tables AND text with product codes.

const PASS_CHUNK_FILTERS: Record<PassName, (c: DoclingChunk) => boolean> = {
  // Systems: range descriptions live in text chunks, but range names also appear as row-group
  // labels in spec_table chunks (e.g. "AVENUE", "COASTAL" as section headers in a decking
  // spec table). Including spec_table here ensures those ranges are visible during system
  // discovery. The model is instructed to extract range names from table section headers
  // without promoting individual SKU/profile rows into systems.
  systems: c =>
    c.chunk_type === 'text' ||
    c.chunk_type === 'table' ||
    c.chunk_type === 'spec_table',

  // Profiles: spec tables have dimensional data; text chunks carry inline product codes
  profiles: c =>
    c.chunk_type === 'spec_table' ||
    (c.chunk_type === 'text' && c.raw_text.includes('Product Code')),

  // Components: fixings/trims spec tables + compatibility table chunks.
  // Also include text chunks that signal accessory content — some manufacturers
  // (e.g. James Hardie) list accessories in plain text sections, not tables.
  // The keyword check runs on the heading first; if no heading, it checks the
  // first 300 chars of raw_text so continuation paragraphs are also captured.
  components: c =>
    c.chunk_type === 'spec_table' ||
    c.chunk_type === 'table' ||
    (c.chunk_type === 'text' &&
      /accessor|trim|fixing|clip|screw|sealer|adhesive|corner|jointer|starter|flashing/i.test(
        c.heading ?? c.raw_text.slice(0, 300),
      )),

  // Colours: colour names appear inline in text chunks and in stocked-colours columns of spec tables
  colours: c =>
    c.chunk_type === 'text' ||
    (c.chunk_type === 'spec_table' && /stocked|colour/i.test(c.raw_text)),

  // Relationships: synthesis — uses all chunks plus previous pass context
  relationships: () => true,
}

function selectChunks(chunks: DoclingChunk[], pass: PassName): DoclingChunk[] {
  return chunks.filter(PASS_CHUNK_FILTERS[pass])
}

// ─── Per-pass AI prompts ──────────────────────────────────────────────────────

const PASS_DESCRIPTIONS: Record<PassName, string> = {
  systems:
    'Extract ONLY the top-level product systems/ranges from these chunks. ' +
    'A system is a broad named product category (e.g. "Avenue Decking", "Shadowline Cladding"). ' +
    'Do NOT extract individual profile sizes or accessories here. ' +
    'Return JSON: { "systems": [...], "image_candidates": [...], "warnings": [], "ignored_content_notes": [] }',

  profiles:
    'Extract ONLY the main sellable dimensional board/panel variants (system profiles). ' +
    'Focus on spec tables and lines containing "Product Code". ' +
    'Profiles are the primary product a builder orders by size — not accessories, clips, or trims. ' +
    'Return JSON: { "system_profiles": [...], "image_candidates": [...], "warnings": [], "ignored_content_notes": [] }',

  components:
    'Extract ONLY accessories, fixings, trims, clips, and screws (components). ' +
    'Focus on FIXINGS and TRIMS tables. ' +
    'NEVER put board/panel variants here — those are profiles. ' +
    'Return JSON: { "components": [...], "image_candidates": [...], "warnings": [], "ignored_content_notes": [] }',

  colours:
    'Extract colour names for each product system. ' +
    'Colours appear inline in text chunks (e.g. ANTIQUE, TEAK, BLACKBUTT). ' +
    'Include sku_suffix if stated. Do NOT invent SKUs. ' +
    'Return JSON: { "system_colours": [...], "image_candidates": [...], "warnings": [], "ignored_content_notes": [] }',

  relationships:
    'Using the previously extracted systems and components, identify which components ' +
    'are required, optional, or accessory for each system. ' +
    'Use compatibility tables and fixings tables. ' +
    'Return JSON: { "system_components": [...], "image_candidates": [...], "warnings": [], "ignored_content_notes": [] }',
}

function loadExtractionSkill(): string {
  const skillPath = path.join(REPO_ROOT, 'prompts', 'extraction_skill.md')
  if (!existsSync(skillPath)) return ''
  return readFileSync(skillPath, 'utf8')
}

function loadManufacturerHint(manufacturerSlug: string): string {
  const hintPath = path.join(REPO_ROOT, 'prompts', 'manufacturer-hints', `${manufacturerSlug}.md`)
  if (!existsSync(hintPath)) return ''
  return readFileSync(hintPath, 'utf8')
}

const EXTRACTION_SKILL = loadExtractionSkill()

function buildPassSystemPrompt(pass: PassName, manufacturerHint?: string): string {
  const tempKeyConvention =
    pass === 'systems' ? '"system_0", "system_1"...' :
    pass === 'profiles' ? '"profile_0", "profile_1"...' :
    pass === 'components' ? '"component_0"...' :
    pass === 'colours' ? '"colour_0"...' :
    '"link_0"...'

  const hintBlock = manufacturerHint
    ? `\n\n---\n\n## Manufacturer-specific guidance\n\n${manufacturerHint}`
    : ''

  return `${EXTRACTION_SKILL}${hintBlock}

---

## Current pass: ${pass.toUpperCase()}

${PASS_DESCRIPTIONS[pass]}

## Pass-specific rules
- Return ONLY the JSON object. No markdown fences, no prose.
- Temp key convention for this pass: ${tempKeyConvention}
- source_chunk_id format: "docling:chunk_N" where N is the chunk_index from the source chunk header.
- role on system_components is free-text describing what the component does — e.g. "timber fix clip", "external_corner", "sealing tape". Do not use required/optional/accessory.
- uom: only set if the source explicitly states or clearly implies the sell/request unit. If not stated, set uom to null, add "uom" to uncertain_fields, and put the likely value as a suggestion in parser_note. Never infer uom from product category alone.
- Never guess dimensions, SKUs, product codes, pack quantities, BAL ratings, or uom. If a value is not in the source text, use null.
- Do not write field_verifications. Do not write to Supabase. Output JSON only.`
}

function buildPassUserPrompt(
  chunks: DoclingChunk[],
  pass: PassName,
  documentId: string | null,
  previousSystems?: unknown[],
): string {
  const header = [
    `## Pass: ${pass.toUpperCase()}`,
    `Document ID: ${documentId ?? 'unknown'}`,
    `Chunks in this pass: ${chunks.length}`,
    previousSystems && previousSystems.length > 0
      ? `## Previously extracted systems\n${JSON.stringify(previousSystems.map((s: unknown) => {
          const sys = s as Record<string, unknown>
          return { temp_key: sys.temp_key, name: sys.name, product_code: sys.product_code }
        }), null, 2)}`
      : '',
    '',
    '## Source chunks',
  ].filter(Boolean).join('\n')

  const chunkLines = chunks.map(c => [
    `--- chunk_${c.chunk_index} | type: ${c.chunk_type}${c.heading ? ` | heading: ${c.heading}` : ''} | ref: docling:chunk_${c.chunk_index} ---`,
    c.raw_text.trim(),
    '',
  ].join('\n'))

  return [header, '', ...chunkLines].join('\n')
}

// ─── Fixture mode ─────────────────────────────────────────────────────────────
//
// Derives plausible system names from chunk headings so the fixture is grounded
// in actual Docling content. Does not call any API.

const SYSTEM_HEADING_PATTERNS = /RANGE|PANEL|BOARD|CLADDING|DECKING|SCREENING|FENCING|SHADOWLINE|CASTELLATION/i

function isLikelySystemHeading(heading: string): boolean {
  return SYSTEM_HEADING_PATTERNS.test(heading)
}

function makeFieldSource(
  fieldName: string,
  value: string,
  chunkIndex: number,
): Record<string, unknown> {
  return {
    field_name: fieldName,
    extracted_value: value,
    source_page_number: null,
    source_chunk_id: `docling:chunk_${chunkIndex}`,
    confidence: 0,
    is_uncertain: true,
    parser_note: 'FIXTURE MODE — not a real extraction',
  }
}

function generateFixtureSystems(
  chunks: DoclingChunk[],
  documentId: string | null,
): unknown[] {
  const seen = new Set<string>()
  const systems: unknown[] = []
  let i = 0

  for (const chunk of chunks) {
    if (!chunk.heading || !isLikelySystemHeading(chunk.heading)) continue
    if (seen.has(chunk.heading)) continue
    seen.add(chunk.heading)

    systems.push({
      temp_key: `system_${i}`,
      source_document_id: documentId,
      source_chunk_id: `docling:chunk_${chunk.chunk_index}`,
      source_page_number: null,
      name: chunk.heading,
      product_code: null,
      slug: null,
      category: /DECK/i.test(chunk.heading) ? 'Decking' : /CLAD|SHADOW|CASTELL/i.test(chunk.heading) ? 'Cladding' : /SCREEN|FENCE/i.test(chunk.heading) ? 'Screening' : null,
      subcategory: null,
      description: null,
      bal_rating: null,
      acoustic_rating: null,
      moisture_resistant: null,
      structural_grade: null,
      double_sided: null,
      sheet_format: null,
      install_guide_urls: null,
      tech_data_url: null,
      notes: null,
      sort_order: i,
      extraction_confidence: 0,
      field_sources: [makeFieldSource('name', chunk.heading, chunk.chunk_index)],
      parser_notes: ['FIXTURE MODE — heading-derived placeholder. Run with --ai for real extraction.'],
      uncertain_fields: ['name', 'category'],
      warnings: [],
      ignored_content_notes: [],
    })
    i++
  }

  return systems
}

function generateFixtureProfiles(
  chunks: DoclingChunk[],
  documentId: string | null,
): unknown[] {
  const profiles: unknown[] = []
  let i = 0

  for (const chunk of chunks) {
    if (chunk.chunk_type !== 'spec_table') continue
    profiles.push({
      temp_key: `profile_${i}`,
      system_match: { system_name: chunk.heading ?? null, product_code: null },
      name: null,
      profile_name: null,
      product_code: null,
      dimensions: null,
      length_mm: null,
      length_m: null,
      width_mm: null,
      height_mm: null,
      thickness_mm: null,
      depth_mm: null,
      gauge_mm: null,
      diameter_mm: null,
      roll_m: null,
      weight_kg: null,
      weight_g: null,
      volume_ml: null,
      pieces: null,
      uom: null,
      pack_format: null,
      supplier_pack_qty: null,
      supplier_pack_uom: null,
      supplier_pack_note: null,
      bal_rating: null,
      sort_order: i,
      source_page_number: null,
      source_chunk_id: `docling:chunk_${chunk.chunk_index}`,
      extraction_confidence: 0,
      field_sources: [],
      parser_notes: [
        `FIXTURE MODE — placeholder for spec_table chunk_${chunk.chunk_index}. Run with --ai for real extraction.`,
      ],
      uncertain_fields: [],
      warnings: [],
      ignored_content_notes: [],
    })
    i++
  }

  return profiles
}

function generateFixtureComponents(
  chunks: DoclingChunk[],
  documentId: string | null,
): unknown[] {
  const fixingChunks = chunks.filter(
    c => c.chunk_type === 'spec_table' && /FIX|TRIM|CLIP/i.test(c.heading ?? ''),
  )
  if (fixingChunks.length === 0) return []

  return fixingChunks.map((chunk, i) => ({
    temp_key: `component_${i}`,
    source_document_id: documentId,
    source_chunk_id: `docling:chunk_${chunk.chunk_index}`,
    source_page_number: null,
    sku: null,
    name: `[FIXTURE] Component from: ${chunk.heading ?? `chunk_${chunk.chunk_index}`}`,
    description: null,
    category: 'Fixings',
    uom: null,
    dimensions: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    thickness_mm: null,
    depth_mm: null,
    gauge_mm: null,
    diameter_mm: null,
    roll_m: null,
    weight_kg: null,
    weight_g: null,
    volume_ml: null,
    pieces: null,
    pack_format: null,
    supplier_pack_qty: null,
    supplier_pack_uom: null,
    supplier_pack_note: null,
    material: null,
    finish: null,
    colour: null,
    profile: null,
    texture: null,
    coverage_m2: null,
    sort_order: i,
    extraction_confidence: 0,
    field_sources: [makeFieldSource('name', `Component from ${chunk.heading ?? `chunk_${chunk.chunk_index}`}`, chunk.chunk_index)],
    parser_notes: ['FIXTURE MODE — run with --ai for real extraction.'],
    uncertain_fields: ['name', 'sku'],
    warnings: [],
    ignored_content_notes: [],
  }))
}

// Known colour tokens that appear in the brochure text
const COLOUR_TOKENS = [
  'ANTIQUE', 'TEAK', 'WALNUT', 'BLACKBUTT', 'IPE', 'SILVER GREY',
  'BEECH', 'AGED WOOD', 'EBONY', 'SEA SALT', 'CANADIAN CEDAR',
]

function generateFixtureColours(
  chunks: DoclingChunk[],
  documentId: string | null,
): unknown[] {
  const found = new Set<string>()
  for (const chunk of chunks) {
    for (const colour of COLOUR_TOKENS) {
      if (chunk.raw_text.toUpperCase().includes(colour)) found.add(colour)
    }
  }

  return Array.from(found).map((colourName, i) => ({
    temp_key: `colour_${i}`,
    system_match: { system_name: null, product_code: null },
    colour_name: colourName,
    sku: null,
    sku_suffix: null,
    image_url: null,
    is_stocked: null,
    sort_order: i,
    source_page_number: null,
    source_chunk_id: null,
    extraction_confidence: 0,
  }))
}

function runFixturePass(
  pass: PassName,
  chunks: DoclingChunk[],
  documentId: string | null,
): PassResult {
  const selected = selectChunks(chunks, pass)
  const charsUsed = selected.reduce((s, c) => s + c.char_count, 0)

  let systems: unknown[] = []
  let system_profiles: unknown[] = []
  let components: unknown[] = []
  let system_colours: unknown[] = []
  let system_components: unknown[] = []
  const warnings = ['FIXTURE MODE — no AI extraction performed. Run with --ai for real results.']

  switch (pass) {
    case 'systems':
      systems = generateFixtureSystems(selected, documentId)
      break
    case 'profiles':
      system_profiles = generateFixtureProfiles(selected, documentId)
      break
    case 'components':
      components = generateFixtureComponents(selected, documentId)
      break
    case 'colours':
      system_colours = generateFixtureColours(selected, documentId)
      break
    case 'relationships':
      // Relationships require AI to be useful — empty in fixture mode
      warnings.push('Relationships pass skipped in fixture mode — no meaningful output without AI.')
      break
  }

  return {
    pass,
    chunks_used: selected.length,
    chars_used: charsUsed,
    fixture_mode: true,
    systems,
    system_profiles,
    components,
    system_colours,
    system_components,
    image_candidates: [],
    warnings,
    ignored_content_notes: [],
  }
}

// ─── AI pass ──────────────────────────────────────────────────────────────────

async function runAIPass(
  pass: PassName,
  chunks: DoclingChunk[],
  documentId: string | null,
  provider: Provider,
  model: string,
  previousSystems?: unknown[],
  manufacturerHint?: string,
): Promise<PassResult> {
  const selected = selectChunks(chunks, pass)
  const charsUsed = selected.reduce((s, c) => s + c.char_count, 0)
  const systemPrompt = buildPassSystemPrompt(pass, manufacturerHint)
  const userPrompt = buildPassUserPrompt(selected, pass, documentId, previousSystems)

  let rawJson: string

  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[ERROR] Missing ANTHROPIC_API_KEY in .env.local')
      process.exit(1)
    }
    const client = new Anthropic({ apiKey })
    console.log(`  [${pass}] anthropic/${model} — ${selected.length} chunks, ${charsUsed.toLocaleString()} chars`)
    const stream = client.messages.stream({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const response = await stream.finalMessage()
    if (response.stop_reason === 'max_tokens') {
      console.error(`[ERROR] Pass ${pass}: Anthropic response truncated (max_tokens). Reduce chunk count.`)
      process.exit(1)
    }
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error(`[ERROR] Pass ${pass}: Anthropic returned no text block.`)
      process.exit(1)
    }
    rawJson = textBlock.text.trim()
  } else {
    const { default: OpenAI } = await import('openai')
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.error('[ERROR] Missing OPENAI_API_KEY in .env.local')
      process.exit(1)
    }
    const client = new OpenAI({ apiKey, timeout: 300_000 })
    console.log(`  [${pass}] openai/${model} — ${selected.length} chunks, ${charsUsed.toLocaleString()} chars`)
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 32000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    if (response.choices[0]?.finish_reason === 'length') {
      // Do not raise max_completion_tokens further — split the pass into smaller chunk batches instead.
      // Each batch writes its own partial JSON file; results are merged after all batches complete.
      console.error(`[ERROR] Pass ${pass}: OpenAI response truncated (finish_reason=length). Split this pass into smaller chunk batches rather than raising the token limit.`)
      process.exit(1)
    }
    rawJson = response.choices[0]?.message?.content?.trim() ?? ''
    if (!rawJson) {
      console.error(`[ERROR] Pass ${pass}: OpenAI returned empty content.`)
      process.exit(1)
    }
  }

  // Strip markdown fences if present
  const jsonStr = rawJson
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Pass ${pass}: JSON parse failed — ${msg}`)
    process.exit(1)
  }

  return {
    pass,
    chunks_used: selected.length,
    chars_used: charsUsed,
    fixture_mode: false,
    systems: (parsed.systems as unknown[] | undefined) ?? [],
    system_profiles: (parsed.system_profiles as unknown[] | undefined) ?? [],
    components: (parsed.components as unknown[] | undefined) ?? [],
    system_colours: (parsed.system_colours as unknown[] | undefined) ?? [],
    system_components: (parsed.system_components as unknown[] | undefined) ?? [],
    image_candidates: (parsed.image_candidates as unknown[] | undefined) ?? [],
    warnings: (parsed.warnings as string[] | undefined) ?? [],
    ignored_content_notes: (parsed.ignored_content_notes as string[] | undefined) ?? [],
  }
}

// ─── Key diagnostics ──────────────────────────────────────────────────────────

function checkKeys(provider: Provider): void {
  const envFiles = [
    path.join(REPO_ROOT, '.env.local'),
    path.join(REPO_ROOT, 'apps', 'web', '.env.local'),
  ]
  console.log('\n[docling:parse] --check-keys')
  console.log(`  Provider      : ${provider}`)
  console.log(`  Env files     : ${envFiles.filter(existsSync).map(f => path.relative(REPO_ROOT, f)).join(', ') || '(none found)'}`)
  const key = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY
  const keyName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  console.log(`  ${keyName}`)
  console.log(`    present     : ${!!key}`)
  if (key) console.log(`    length      : ${key.length}`)
  console.log()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const PASSES: PassName[] = ['systems', 'profiles', 'components', 'colours', 'relationships']

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const DEFAULT_OPENAI_MODEL = 'gpt-5.4'

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const providerArg = typeof args.provider === 'string' ? args.provider.toLowerCase() : 'anthropic'
  const provider: Provider = providerArg === 'openai' ? 'openai' : 'anthropic'
  const defaultModel = provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL
  const model = typeof args.model === 'string' ? args.model : defaultModel
  const useAI = args.ai === true
  const isDryRun = args['dry-run'] === true
  const onlyPassArg = typeof args['only-pass'] === 'string' ? args['only-pass'] as PassName : null
  const manufacturerSlug = typeof args.manufacturer === 'string' ? args.manufacturer : null
  const manufacturerHint = manufacturerSlug ? loadManufacturerHint(manufacturerSlug) : ''
  if (manufacturerSlug && !manufacturerHint) {
    console.warn(`[WARN] No hint file found for manufacturer "${manufacturerSlug}" — expected prompts/manufacturer-hints/${manufacturerSlug}.md`)
  }
  const passesToRun: PassName[] = onlyPassArg
    ? PASSES.filter(p => p === onlyPassArg)
    : [...PASSES]
  if (onlyPassArg && passesToRun.length === 0) {
    console.error(`[ERROR] --only-pass "${onlyPassArg}" is not a valid pass. Valid passes: ${PASSES.join(', ')}`)
    process.exit(1)
  }

  hr()
  console.log('[docling:parse] Multi-pass Docling extraction')
  console.log(`  Mode          : ${useAI ? `AI (${provider}/${model})` : 'fixture (no API call)'}`)
  if (isDryRun) console.log('  DRY-RUN — no files will be written')
  if (onlyPassArg) console.log(`  Only pass     : ${onlyPassArg}`)
  if (manufacturerSlug) console.log(`  Manufacturer  : ${manufacturerSlug}${manufacturerHint ? '' : ' (no hint file found)'}`)

  // ── --check-keys ───────────────────────────────────────────────
  if (args['check-keys']) {
    checkKeys(provider)
    return
  }

  // ── Validate --input ───────────────────────────────────────────
  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <parser_chunks.json> is required')
    console.error(
      '  Example: pnpm docling:parse -- --input ".local/parser-inputs/docling/<folder>/parser_chunks.json"'
    )
    process.exit(1)
  }

  const resolvedInput = resolveDotLocal(inputArg)
  requireUnderLocal(resolvedInput, '--input')

  if (!existsSync(resolvedInput)) {
    console.error(`[ERROR] File not found: ${resolvedInput}`)
    console.error('  Run pnpm docling:chunks first.')
    process.exit(1)
  }

  let bundle: DoclingBundle
  try {
    bundle = JSON.parse(readFileSync(resolvedInput, 'utf8')) as DoclingBundle
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Could not parse input: ${msg}`)
    process.exit(1)
  }

  const chunks = bundle.chunks ?? []
  const documentId = bundle.document?.document_id ?? null
  const docFilename = bundle.document?.input_filename ?? 'unknown'
  const outDirBasename = path.basename(path.dirname(resolvedInput))

  // ── Resolve output directory ───────────────────────────────────
  const defaultOutDir = path.join(REPO_ROOT, '.local', 'parser-outputs', 'docling', outDirBasename)
  let resolvedOutDir: string
  if (args['out-dir'] && typeof args['out-dir'] === 'string') {
    resolvedOutDir = resolveDotLocal(args['out-dir'])
    requireUnderLocal(resolvedOutDir, '--out-dir')
  } else {
    resolvedOutDir = defaultOutDir
  }

  // ── Print input summary ────────────────────────────────────────
  hr()
  console.log('[docling:parse] Input')
  console.log(`  File          : ${path.relative(REPO_ROOT, resolvedInput)}`)
  console.log(`  Document      : ${docFilename}`)
  if (documentId) console.log(`  Document ID   : ${documentId}`)
  console.log(`  Total chunks  : ${chunks.length}`)
  const typeCounts = bundle.combined_text_metadata?.chunk_type_counts ?? {}
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  ${type.padEnd(14)}: ${count}`)
  }

  // ── Print pass plan ────────────────────────────────────────────
  hr()
  console.log('[docling:parse] Pass plan')
  for (const pass of passesToRun) {
    const selected = selectChunks(chunks, pass)
    const chars = selected.reduce((s, c) => s + c.char_count, 0)
    console.log(`  ${pass.padEnd(15)}: ${String(selected.length).padStart(2)} chunks, ${chars.toLocaleString().padStart(7)} chars`)
  }
  hr()

  if (isDryRun) {
    console.log('[docling:parse] DRY-RUN complete. No files written.')
    console.log(`  Would write to: ${path.relative(REPO_ROOT, resolvedOutDir)}/`)
    console.log()
    return
  }

  if (!isDryRun) {
    mkdirSync(resolvedOutDir, { recursive: true })
  }

  // ── Run passes ─────────────────────────────────────────────────
  const results: Partial<Record<PassName, PassResult>> = {}
  let extractedSystems: unknown[] = []

  for (const pass of passesToRun) {
    let result: PassResult
    if (useAI) {
      result = await runAIPass(pass, chunks, documentId, provider, model,
        pass !== 'systems' ? extractedSystems : undefined,
        manufacturerHint || undefined)
    } else {
      result = runFixturePass(pass, chunks, documentId)
    }
    results[pass] = result

    // Systems from pass 1 are passed to subsequent AI passes as context
    if (pass === 'systems' && result.systems.length > 0) {
      extractedSystems = result.systems
    }

    // Write per-pass file
    const passFilename = pass === 'relationships' ? 'relationships.json' : `${pass}.json`
    const passFile = path.join(resolvedOutDir, passFilename)
    writeFileSync(passFile, JSON.stringify({
      _meta: {
        pass,
        generated_at: new Date().toISOString(),
        fixture_mode: result.fixture_mode,
        chunks_used: result.chunks_used,
        chars_used: result.chars_used,
      },
      ...(result.systems.length > 0 ? { systems: result.systems } : {}),
      ...(result.system_profiles.length > 0 ? { system_profiles: result.system_profiles } : {}),
      ...(result.components.length > 0 ? { components: result.components } : {}),
      ...(result.system_colours.length > 0 ? { system_colours: result.system_colours } : {}),
      ...(result.system_components.length > 0 ? { system_components: result.system_components } : {}),
      ...(result.image_candidates.length > 0 ? { image_candidates: result.image_candidates } : {}),
      warnings: result.warnings,
      ignored_content_notes: result.ignored_content_notes,
    }, null, 2), 'utf8')
  }

  // ── Combine into single parser-output compatible file ──────────
  const combinedParserOutput = {
    source_document_id: documentId,
    systems: results.systems?.systems ?? [],
    system_profiles: results.profiles?.system_profiles ?? [],
    components: results.components?.components ?? [],
    system_components: results.relationships?.system_components ?? [],
    system_colours: results.colours?.system_colours ?? [],
    image_candidates: [
      ...(results.systems?.image_candidates ?? []),
      ...(results.profiles?.image_candidates ?? []),
      ...(results.components?.image_candidates ?? []),
      ...(results.colours?.image_candidates ?? []),
      ...(results.relationships?.image_candidates ?? []),
    ],
    warnings: [
      ...(results.systems?.warnings ?? []),
      ...(results.profiles?.warnings ?? []),
      ...(results.components?.warnings ?? []),
      ...(results.colours?.warnings ?? []),
      ...(results.relationships?.warnings ?? []),
    ].filter((w, i, arr) => arr.indexOf(w) === i), // deduplicate
    ignored_content_notes: [
      ...(results.systems?.ignored_content_notes ?? []),
      ...(results.profiles?.ignored_content_notes ?? []),
    ],
  }

  const combinedFile = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'parse-docling-chunks.ts',
      local_only: true,
      fixture_mode: !useAI,
      source_tool: 'docling',
      provider: useAI ? provider : 'fixture',
      model: useAI ? model : 'fixture (no API call)',
      source_input: path.relative(REPO_ROOT, resolvedInput),
      document_id: documentId,
      document_filename: docFilename,
    },
    parser_output: combinedParserOutput,
  }

  const combinedPath = path.join(resolvedOutDir, 'combined-parser-output.json')
  writeFileSync(combinedPath, JSON.stringify(combinedFile, null, 2), 'utf8')

  // ── Field evidence stats ───────────────────────────────────────
  const allEntities: unknown[] = [
    ...combinedParserOutput.systems,
    ...combinedParserOutput.system_profiles,
    ...combinedParserOutput.components,
  ]
  let totalFieldSources = 0
  let missingEvidence = 0
  for (const entity of allEntities) {
    const e = entity as Record<string, unknown>
    const sources = e.field_sources as unknown[] | undefined
    totalFieldSources += sources?.length ?? 0
    const nonNullFields = Object.entries(e).filter(
      ([k, v]) =>
        v !== null &&
        v !== undefined &&
        !['temp_key', 'field_sources', 'parser_notes', 'uncertain_fields', 'warnings', 'ignored_content_notes', 'sort_order', 'extraction_confidence'].includes(k) &&
        typeof v !== 'object',
    )
    const sourcedFields = new Set((sources ?? []).map((s: unknown) => (s as Record<string, unknown>).field_name))
    missingEvidence += nonNullFields.filter(([k]) => !sourcedFields.has(k)).length
  }

  // ── Summary file ───────────────────────────────────────────────
  const summary = {
    generated_at: new Date().toISOString(),
    fixture_mode: !useAI,
    provider: useAI ? provider : 'fixture',
    model: useAI ? model : null,
    source_input: path.relative(REPO_ROOT, resolvedInput),
    document_id: documentId,
    document_filename: docFilename,
    passes: passesToRun.map(p => ({
      pass: p,
      chunks_used: results[p]?.chunks_used ?? 0,
      chars_used: results[p]?.chars_used ?? 0,
    })),
    entity_counts: {
      systems: combinedParserOutput.systems.length,
      system_profiles: combinedParserOutput.system_profiles.length,
      components: combinedParserOutput.components.length,
      system_components: combinedParserOutput.system_components.length,
      system_colours: combinedParserOutput.system_colours.length,
    },
    field_sources_count: totalFieldSources,
    fields_missing_evidence: missingEvidence,
    image_candidates_count: combinedParserOutput.image_candidates.length,
    warnings_count: combinedParserOutput.warnings.length,
    ignored_content_notes_count: combinedParserOutput.ignored_content_notes.length,
    output_files: [
      'systems.json',
      'profiles.json',
      'components.json',
      'colours.json',
      'relationships.json',
      'combined-parser-output.json',
      'summary.json',
    ],
  }

  const summaryPath = path.join(resolvedOutDir, 'summary.json')
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8')

  // ── Terminal summary ───────────────────────────────────────────
  hr()
  console.log('[docling:parse] Entity counts')
  console.log(`  systems          : ${combinedParserOutput.systems.length}`)
  console.log(`  system_profiles  : ${combinedParserOutput.system_profiles.length}`)
  console.log(`  components       : ${combinedParserOutput.components.length}`)
  console.log(`  system_colours   : ${combinedParserOutput.system_colours.length}`)
  console.log(`  system_components: ${combinedParserOutput.system_components.length}`)
  console.log(`  image_candidates : ${combinedParserOutput.image_candidates.length}`)
  console.log(`  field_sources    : ${totalFieldSources}`)
  console.log(`  missing evidence : ${missingEvidence}`)
  console.log(`  warnings         : ${combinedParserOutput.warnings.length}`)
  console.log(`  ignored notes    : ${combinedParserOutput.ignored_content_notes.length}`)
  hr()
  console.log('[docling:parse] Output files')
  for (const f of summary.output_files) {
    console.log(`  ${path.relative(REPO_ROOT, path.join(resolvedOutDir, f))}`)
  }
  if (!useAI) {
    console.log()
    console.log('  NOTE: Fixture mode. Run with --ai for real extraction.')
    console.log('  combined-parser-output.json is compatible with:')
    console.log('    pnpm parser:dry-run -- --input <bundle.json> --ai-output <combined-parser-output.json>')
  }
  console.log()
  console.log('  No DB writes. No Supabase. Local only.')
  console.log()
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
