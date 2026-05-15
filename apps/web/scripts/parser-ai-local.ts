#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-ai-local.ts
 *
 * Local-only AI parser command. Reads a parser input bundle produced by
 * parser:bundle, calls the AI provider to extract catalogue data, and
 * writes the raw AI output to .local/parser-ai-outputs/.
 *
 * Usage:
 *   pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json"
 *   pnpm parser:ai-local -- --input "..." --provider openai
 *   pnpm parser:ai-local -- --input "..." --provider anthropic --model claude-opus-4-7
 *   pnpm parser:ai-local -- --input "..." --provider openai --model gpt-4o
 *   pnpm parser:ai-local -- --input "..." --fixture     # skip API call, use mock fixture
 *   pnpm parser:ai-local -- --input "..." --out ".local/parser-ai-outputs/custom.json"
 *   pnpm parser:ai-local -- --check-keys               # print key diagnostics only
 *
 * Flags:
 *   --input      <path>   Parser input bundle (required unless --check-keys)
 *   --provider   <name>   anthropic (default) | openai
 *   --model      <model>  Model ID override
 *   --fixture             Skip API call — write mockNTWAvenueDecking fixture as AI output
 *   --out        <path>   Custom output path (must remain inside .local/)
 *   --check-keys          Print key presence diagnostics and exit. No values printed.
 *
 * SAFETY RULES:
 *   - Reads API keys from env only. Never printed.
 *   - Writes output to .local/parser-ai-outputs/ only (gitignored).
 *   - No Supabase. No DB writes. No service role.
 *   - Raw AI output must be inspected before any future staged write.
 *   - Do not import from app runtime code.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import type { ParserOutput } from '../lib/parser/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ----------------------------------------------------------
// Env loading (mirrors parser-insert-local pattern)
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
loadEnvFile(path.join(REPO_ROOT, 'apps', 'web', '.env.local'))

// ----------------------------------------------------------
// Defaults
// ----------------------------------------------------------

type Provider = 'anthropic' | 'openai'

const DEFAULT_PROVIDER: Provider = 'anthropic'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const DEFAULT_OPENAI_MODEL = 'gpt-5.5'

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
// Path safety
// ----------------------------------------------------------

function isSafeLocalPath(p: string): boolean {
  const resolved = path.resolve(p)
  const safeBase = path.resolve(REPO_ROOT, '.local')
  return resolved.startsWith(safeBase + path.sep) || resolved === safeBase
}

// ----------------------------------------------------------
// Key diagnostics (--check-keys)
// ----------------------------------------------------------

function checkKeys(provider: Provider): void {
  const envFiles = [
    path.join(REPO_ROOT, '.env.local'),
    path.join(REPO_ROOT, 'apps', 'web', '.env.local'),
  ]
  console.log('\n[parser:ai-local] --check-keys diagnostic')
  console.log(`  Provider        : ${provider}`)
  console.log(`  Env files read  : ${envFiles.filter(existsSync).map(f => path.relative(REPO_ROOT, f)).join(', ') || '(none found)'}`)
  if (provider === 'anthropic') {
    const k = process.env.ANTHROPIC_API_KEY
    console.log(`  ANTHROPIC_API_KEY`)
    console.log(`    present       : ${!!k}`)
    if (k) {
      console.log(`    length        : ${k.length}`)
      console.log(`    starts sk-ant-api03-: ${k.startsWith('sk-ant-api03-')}`)
    }
  } else {
    const k = process.env.OPENAI_API_KEY
    console.log(`  OPENAI_API_KEY`)
    console.log(`    present       : ${!!k}`)
    if (k) {
      console.log(`    length        : ${k.length}`)
      console.log(`    starts sk-     : ${k.startsWith('sk-')}`)
    }
  }
  console.log()
}

// ----------------------------------------------------------
// Prompt construction (shared by both providers)
// ----------------------------------------------------------

interface BundleChunk {
  id: string
  page_number: number | null
  chunk_index: number
  chunk_type: string | null
  heading: string | null
  char_count: number
  raw_text: string | null
}

function buildSystemPrompt(): string {
  return `You are a BuildQuote catalogue extraction parser. You read manufacturer product documents and extract structured catalogue data as strict JSON.

## Output format

Return ONLY a single JSON object. No markdown fences, no prose, no commentary.
The JSON must match the ParserOutput schema below exactly.

## ParserOutput schema

\`\`\`
{
  "source_document_id": "string | null",
  "systems": [ SystemCandidate ],
  "system_profiles": [ SystemProfileCandidate ],
  "components": [ ComponentCandidate ],
  "system_components": [ SystemComponentCandidate ],
  "system_colours": [ SystemColourCandidate ],
  "warnings": [ "string" ],
  "ignored_content_notes": [ "string" ]
}
\`\`\`

### temp_key convention (required on every entity)

Assign sequential keys: "system_0", "system_1" / "profile_0", "profile_1" / "component_0" / "colour_0" / "link_0"

### SystemCandidate

\`\`\`
{
  "temp_key": "system_0",
  "source_document_id": null,
  "source_chunk_id": "uuid | null",
  "source_page_number": number | null,
  "name": "string",                         // required
  "product_code": "string | null",
  "slug": null,
  "category": "string | null",              // e.g. Decking, Cladding, Doors, Membrane
  "subcategory": "string | null",
  "description": "string | null",           // factual only, not marketing
  "bal_rating": "string | null",            // system-wide BAL only; use bal_rating not fire_rating
  "acoustic_rating": null,
  "moisture_resistant": null,
  "structural_grade": null,
  "double_sided": null,
  "sheet_format": null,
  "install_guide_url": null,
  "tech_data_url": null,
  "notes": null,
  "sort_order": 0,
  "extraction_confidence": 0.0-1.0,
  "field_sources": [ FieldSource ],         // one per extracted non-null field
  "parser_notes": [],
  "uncertain_fields": []
}
\`\`\`

### SystemProfileCandidate (main sellable dimensional variants only)

\`\`\`
{
  "temp_key": "profile_0",
  "system_match": { "system_name": "string | null", "product_code": "string | null" },
  "name": "string | null",                  // full descriptive name e.g. "Avenue Grooved Board 5400mm"
  "profile_name": "string | null",          // short label e.g. "Avenue 5400" (preferred)
  "product_code": "string | null",
  "dimensions": "string | null",            // raw text always preserved
  "length_mm": number | null,
  "length_m": number | null,
  "width_mm": number | null,
  "height_mm": number | null,               // only if source labels as height (e.g. door height)
  "thickness_mm": number | null,            // thin third dim of flat products (boards, sheets)
  "depth_mm": null,
  "gauge_mm": null,
  "diameter_mm": null,
  "roll_m": number | null,
  "weight_kg": null,
  "weight_g": null,
  "volume_ml": null,
  "pieces": null,
  "uom": "string | null",                   // sell/quote unit: lm, m2, sheet, roll, ea, piece
  "pack_format": null,
  "supplier_pack_qty": number | null,
  "supplier_pack_uom": "string | null",
  "supplier_pack_note": null,
  "bal_rating": "string | null",            // profile-specific BAL only
  "sort_order": 0,
  "source_page_number": number | null,
  "source_chunk_id": "uuid | null",
  "extraction_confidence": 0.0-1.0,
  "field_sources": [ FieldSource ],
  "parser_notes": [],
  "uncertain_fields": []
}
\`\`\`

### ComponentCandidate (accessories, fixings, trims, etc.)

\`\`\`
{
  "temp_key": "component_0",
  "source_document_id": null,
  "source_chunk_id": "uuid | null",
  "source_page_number": number | null,
  "sku": "string | null",
  "name": "string",                         // required
  "description": "string | null",
  "category": "string | null",              // Fixings, Trims, Adhesives, Sealants, etc.
  "uom": "string | null",                   // ea, piece, roll, box, lm, m2, kg
  "dimensions": "string | null",
  "length_mm": null, "width_mm": null, "height_mm": null, "thickness_mm": null,
  "depth_mm": null, "gauge_mm": null, "diameter_mm": null,
  "roll_m": null, "weight_kg": null, "weight_g": null, "volume_ml": null, "pieces": null,
  "pack_format": "string | null",
  "supplier_pack_qty": number | null,
  "supplier_pack_uom": "string | null",
  "supplier_pack_note": "string | null",
  "material": null, "finish": null, "colour": null, "profile": null, "texture": null,
  "coverage_m2": null,
  "sort_order": 0,
  "extraction_confidence": 0.0-1.0,
  "field_sources": [ FieldSource ],
  "parser_notes": [],
  "uncertain_fields": []
}
\`\`\`

### SystemComponentCandidate

\`\`\`
{
  "temp_key": "link_0",
  "staged_system_match": { "system_name": "string | null", "product_code": "string | null" },
  "component_match": { "sku": "string | null", "name": "string" },
  "role": "required" | "optional" | "accessory",   // only these three values
  "notes": "string | null",
  "sort_order": 0,
  "extraction_confidence": 0.0-1.0,
  "source_page_number": null,
  "source_chunk_id": null
}
\`\`\`

### SystemColourCandidate

\`\`\`
{
  "temp_key": "colour_0",
  "system_match": { "system_name": "string | null", "product_code": "string | null" },
  "colour_name": "string",                  // required
  "sku": "string | null",
  "sku_suffix": "string | null",            // suffix appended to base SKU for this colour
  "image_url": null,
  "is_stocked": null,
  "sort_order": 0,
  "source_page_number": number | null,
  "source_chunk_id": "uuid | null",
  "extraction_confidence": 0.0-1.0
}
\`\`\`

### FieldSource

\`\`\`
{
  "field_name": "name",
  "extracted_value": "string | null",       // always string even if field is numeric
  "source_page_number": number | null,
  "source_chunk_id": "uuid | null",         // use chunk IDs provided in input
  "confidence": 0.0-1.0,
  "is_uncertain": false,
  "parser_note": null
}
\`\`\`

---

## Classification rules (critical — read carefully)

### system_profiles: main sellable dimensional variants
Put in profiles: decking board size variants, cladding size variants, door size variants, roll size variants, sheet size variants, membrane variants, underlay variants, insulation variants. These are the PRIMARY product a builder quantifies and orders.

### components: accessories, fixings, trims, and supporting parts
ALWAYS put in components, NEVER in profiles:
- Edge boards, fascia boards, bullnose boards
- Trims, corner trims, J-trims, starter trims, end caps
- Clips, hidden fix clips, joist clips
- Screws, bolts, fixings, fasteners, nails
- Adhesives, sealants, tapes, joint compounds
- Flashings and accessory membranes
- Brackets, packers, shims, spacers
- Door frames, jambs, hinges, thresholds, seals
- Cleaning and maintenance products
- Any installation accessory

Test: "Is this the thing a builder quantifies and orders as the primary product?" → yes = profile, no = component.

---

## Pack and UOM rules

uom is the sell/quote unit (ea, lm, m2, roll, sheet, box, kg, piece). It is NOT a pack size.
A catalogue "Pack size: 120" means supplier_pack_qty=120. It does not mean uom="pack" or uom="120".
Never set uom to a number. Never set uom to a pack format.
supplier_pack_qty is the manufacturer full-pack quantity. It is never the customer order quantity.

---

## Dimension rules

For flat products (boards, sheets, cladding, panels):
  "5400 x 138 x 29 mm" → length_mm=5400, width_mm=138, thickness_mm=29
  height_mm stays null unless source clearly labels that axis as "height"

For rolls: use roll_m for length in metres.
For doors: height_mm=2040, width_mm=820, thickness_mm=35 (doors use height explicitly).
Always preserve the raw dimensions string in the "dimensions" field.
All *_mm and *_m fields must be numbers, never strings.

---

## Evidence rules (MANDATORY — validation will reject records that violate this)

EVERY non-null field MUST have a corresponding entry in field_sources — no exceptions.
This includes the "name" field on every system, profile, and component.
A record with name="TC28 Timber Fix" MUST have a field_sources entry { "field_name": "name", ... }.
Missing field_sources entries for non-null fields will cause dry-run validation to fail.

Each field_sources entry must include:
- field_name: the exact field name (e.g. "name", "sku", "dimensions")
- extracted_value: always a string, even if the field is numeric
- source_page_number: from the chunk's page_number
- source_chunk_id: exact chunk ID from the input (never invent a chunk ID)
- confidence: 0.0–1.0
- is_uncertain: false (or true if genuinely uncertain)
- parser_note: null (or a string if you need to note something)

---

## General rules

- Return JSON only. No markdown. No prose.
- Do not invent products, SKUs, or values not present in the source.
- If a value is unclear, use null and add to uncertain_fields.
- fire_rating is deprecated — use bal_rating.
- role on system_components must be exactly "required", "optional", or "accessory".
`
}

function buildUserPrompt(bundle: Record<string, unknown>, chunks: BundleChunk[]): string {
  const doc = bundle.document as Record<string, unknown>
  const mfr = bundle.manufacturer as Record<string, unknown>
  const extraction = bundle.extraction_run as Record<string, unknown> | null

  const header = [
    `## Document`,
    `Name: ${doc.document_name ?? '(unknown)'}`,
    `Type: ${doc.document_type ?? '(unknown)'}`,
    `Document ID: ${doc.id}`,
    `Manufacturer: ${mfr.name} (${mfr.slug})`,
    extraction ? `Extraction run: ${extraction.id} (${extraction.status})` : '',
    '',
    `## Instructions`,
    `Extract all product catalogue data from the chunks below.`,
    `Set source_document_id to "${doc.id}" on every system and component record.`,
    `Use the chunk IDs provided below as source_chunk_id values in field_sources.`,
    ``,
    `## Source chunks`,
  ].filter(l => l !== undefined).join('\n')

  const chunkLines = chunks.map(c => {
    const lines = [
      `--- Chunk ${c.chunk_index} | page ${c.page_number ?? '?'} | id: ${c.id}${c.heading ? ` | heading: ${c.heading}` : ''}${c.chunk_type ? ` | type: ${c.chunk_type}` : ''} ---`,
      c.raw_text?.trim() ?? '(empty)',
      '',
    ]
    return lines.join('\n')
  })

  return [header, '', ...chunkLines].join('\n')
}

// ----------------------------------------------------------
// Parse & validate AI JSON response (shared)
// ----------------------------------------------------------

function parseAndValidateResponse(
  rawContent: string,
  outPath: string,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const jsonStr = rawContent
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parserOutput: any
  try {
    parserOutput = JSON.parse(jsonStr)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] AI response is not valid JSON: ${msg}`)
    console.error('  Raw response saved for inspection.')
    writeFileSync(outPath, JSON.stringify({ _meta: { ...meta, parse_error: msg }, raw_response: rawContent, parser_output: null }, null, 2), 'utf8')
    console.error(`  Saved to: ${outPath}`)
    process.exit(1)
  }

  const topLevelKeys = ['systems', 'system_profiles', 'components', 'system_components', 'system_colours']
  const missing = topLevelKeys.filter(k => !Array.isArray(parserOutput[k]))
  if (missing.length > 0) {
    console.warn(`[WARN] AI output missing expected top-level arrays: ${missing.join(', ')}`)
    console.warn('  Output saved anyway — run parser:dry-run to validate fully.')
  }

  return parserOutput
}

// ----------------------------------------------------------
// Anthropic extraction
// ----------------------------------------------------------

async function runAnthropicExtraction(
  bundle: Record<string, unknown>,
  chunks: BundleChunk[],
  outPath: string,
  model: string,
  docId: string,
  docName: string,
  resolvedInput: string,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error(
      '\n[ERROR] Missing ANTHROPIC_API_KEY.\n' +
      '        Set it in .env.local or your shell environment.\n' +
      '        No output written.\n' +
      '        To use OpenAI instead: --provider openai\n' +
      '        To test without an API key: --fixture\n'
    )
    process.exit(1)
  }

  console.log(`  Provider      : anthropic`)
  console.log(`  Model         : ${model}`)

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(bundle, chunks)

  let rawContent: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usage: any = null

  try {
    // Use streaming to avoid the 10-minute non-streaming timeout on large outputs.
    const stream = client.messages.stream({
      model,
      max_tokens: 64000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const response = await stream.finalMessage()
    usage = response.usage
    // Detect truncation before attempting to parse — truncated JSON is always invalid.
    if (response.stop_reason === 'max_tokens') {
      console.error(
        `[ERROR] Anthropic response was truncated (stop_reason=max_tokens, output_tokens=${usage?.output_tokens ?? '?'}).\n` +
        '  The output JSON is incomplete and cannot be parsed.\n' +
        '  Reduce the document size or split into smaller bundles.'
      )
      process.exit(1)
    }
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[ERROR] Anthropic API returned no text block. No output written.')
      process.exit(1)
    }
    rawContent = textBlock.text.trim()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Anthropic API call failed: ${msg}`)
    console.error('  No output written.')
    process.exit(1)
  }

  const metaBase = { generated_at: new Date().toISOString(), generator: 'parser-ai-local.ts', fixture_mode: false, provider: 'anthropic', model, source_bundle: resolvedInput, bundle_document_id: docId, bundle_document_name: docName }
  const parserOutput = parseAndValidateResponse(rawContent, outPath, metaBase)

  const file = {
    _meta: {
      ...metaBase,
      usage: usage ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens } : null,
    },
    parser_output: parserOutput,
  }
  writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8')
  printCounts(parserOutput, usage ? `${usage.input_tokens} in / ${usage.output_tokens} out` : null, outPath)
}

// ----------------------------------------------------------
// OpenAI extraction
// ----------------------------------------------------------

async function runOpenAIExtraction(
  bundle: Record<string, unknown>,
  chunks: BundleChunk[],
  outPath: string,
  model: string,
  docId: string,
  docName: string,
  resolvedInput: string,
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error(
      '\n[ERROR] Missing OPENAI_API_KEY.\n' +
      '        Set it in .env.local or your shell environment.\n' +
      '        No output written.\n' +
      '        To use Anthropic instead: --provider anthropic\n' +
      '        To test without an API key: --fixture\n'
    )
    process.exit(1)
  }

  console.log(`  Provider      : openai`)
  console.log(`  Model         : ${model}`)

  const client = new OpenAI({ apiKey, timeout: 600_000 })
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(bundle, chunks)

  let rawContent: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usage: any = null

  try {
    // gpt-5.5 supports up to 65536; older gpt-4.x models cap at 32768
    const maxCompletionTokens = model.startsWith('gpt-5') ? 65536 : 32768
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: maxCompletionTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    usage = response.usage
    const choice = response.choices[0]
    if (choice?.finish_reason === 'length') {
      console.error(
        `[ERROR] OpenAI response was truncated (finish_reason=length, completion_tokens=${usage?.completion_tokens ?? '?'}).\n` +
        '  The output JSON is incomplete and cannot be parsed.\n' +
        '  Increase max_completion_tokens or reduce the document size.'
      )
      process.exit(1)
    }
    rawContent = choice?.message?.content?.trim() ?? ''
    if (!rawContent) {
      console.error('[ERROR] OpenAI API returned empty content. No output written.')
      process.exit(1)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] OpenAI API call failed: ${msg}`)
    console.error('  No output written.')
    process.exit(1)
  }

  const metaBase = { generated_at: new Date().toISOString(), generator: 'parser-ai-local.ts', fixture_mode: false, provider: 'openai', model, source_bundle: resolvedInput, bundle_document_id: docId, bundle_document_name: docName }
  const parserOutput = parseAndValidateResponse(rawContent, outPath, metaBase)

  const file = {
    _meta: {
      ...metaBase,
      usage: usage ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens } : null,
    },
    parser_output: parserOutput,
  }
  writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8')
  printCounts(parserOutput, usage ? `${usage.prompt_tokens} in / ${usage.completion_tokens} out` : null, outPath)
}

// ----------------------------------------------------------
// Shared output summary
// ----------------------------------------------------------

function printCounts(parserOutput: Record<string, unknown>, tokenSummary: string | null, outPath: string): void {
  console.log(`  Systems       : ${Array.isArray(parserOutput.systems) ? parserOutput.systems.length : '?'}`)
  console.log(`  Profiles      : ${Array.isArray(parserOutput.system_profiles) ? parserOutput.system_profiles.length : '?'}`)
  console.log(`  Components    : ${Array.isArray(parserOutput.components) ? parserOutput.components.length : '?'}`)
  console.log(`  Colours       : ${Array.isArray(parserOutput.system_colours) ? parserOutput.system_colours.length : '?'}`)
  if (tokenSummary) console.log(`  Tokens        : ${tokenSummary}`)
  console.log(`  Output        : ${outPath}`)
  console.log()
  console.log('  Raw AI output saved. Run parser:dry-run --ai-output to validate.')
  console.log('  No DB writes performed.')
  console.log()
}

// ----------------------------------------------------------
// Main
// ----------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const providerArg = typeof args.provider === 'string' ? args.provider.toLowerCase() : DEFAULT_PROVIDER
  const provider: Provider = providerArg === 'openai' ? 'openai' : 'anthropic'

  const defaultModel = provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL
  const model = typeof args.model === 'string' ? args.model : defaultModel

  // ── --check-keys mode ──────────────────────────────────────────
  if (args['check-keys']) {
    checkKeys(provider)
    return
  }

  // ── Validate --input ──────────────────────────────────────────
  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <path> is required')
    console.error('  Example: pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json"')
    process.exit(1)
  }

  const resolvedInput = inputArg.startsWith('.local/')
    ? path.join(REPO_ROOT, inputArg)
    : path.resolve(inputArg)

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

  const docId: string = bundle.document?.id ?? null
  const docName: string = bundle.document?.document_name ?? 'unknown'
  const chunks: BundleChunk[] = bundle.chunks ?? []

  // ── Resolve output path (includes provider in filename) ───────
  const outDir = path.join(REPO_ROOT, '.local', 'parser-ai-outputs')
  const docSlug = docName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultOut = path.join(outDir, `${docSlug}-${provider}-${timestamp}.json`)

  let outPath: string
  if (args.out && typeof args.out === 'string') {
    outPath = args.out.startsWith('.local/')
      ? path.join(REPO_ROOT, args.out)
      : path.resolve(args.out)
    if (!isSafeLocalPath(outPath)) {
      console.error(`[ERROR] --out path must be inside .local/ — got: ${args.out}`)
      process.exit(1)
    }
  } else {
    outPath = defaultOut
  }

  mkdirSync(path.dirname(outPath), { recursive: true })

  console.log('\n[parser:ai-local] Running AI extraction')
  console.log(`  Document      : ${docName}`)
  console.log(`  Chunks        : ${chunks.length}`)

  // ── Fixture mode ───────────────────────────────────────────────
  if (args.fixture === true) {
    console.log('  Mode          : fixture (no API call)')

    const fixtureOutput: ParserOutput = {
      ...mockNTWAvenueDecking,
      source_document_id: docId ?? null,
    }

    const file = {
      _meta: {
        generated_at: new Date().toISOString(),
        generator: 'parser-ai-local.ts',
        fixture_mode: true,
        fixture_label: 'mockNTWAvenueDecking',
        provider: 'fixture',
        model: 'fixture (no API call)',
        source_bundle: resolvedInput,
        bundle_document_id: docId,
        bundle_document_name: docName,
        usage: null,
      },
      parser_output: fixtureOutput,
    }

    writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8')
    printCounts(fixtureOutput as unknown as Record<string, unknown>, null, outPath)
    return
  }

  // ── Live API mode ──────────────────────────────────────────────
  if (provider === 'openai') {
    await runOpenAIExtraction(bundle, chunks, outPath, model, docId, docName, resolvedInput)
  } else {
    await runAnthropicExtraction(bundle, chunks, outPath, model, docId, docName, resolvedInput)
  }
}

main()
