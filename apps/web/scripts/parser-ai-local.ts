#!/usr/bin/env tsx
/**
 * apps/web/scripts/parser-ai-local.ts
 *
 * Local-only AI parser command. Reads a parser input bundle produced by
 * parser:bundle, calls the Anthropic API to extract catalogue data, and
 * writes the raw AI output to .local/parser-ai-outputs/.
 *
 * Usage:
 *   pnpm parser:ai-local -- --input ".local/parser-inputs/<bundle>.json"
 *   pnpm parser:ai-local -- --input "..." --model claude-opus-4-7
 *   pnpm parser:ai-local -- --input "..." --fixture     # skip API call, use mock fixture
 *   pnpm parser:ai-local -- --input "..." --out ".local/parser-ai-outputs/custom.json"
 *
 * Flags:
 *   --input   <path>   Parser input bundle (required)
 *   --model   <model>  Claude model ID (default: claude-sonnet-4-6)
 *   --fixture          Skip API call — write mockNTWAvenueDecking fixture as AI output
 *   --out     <path>   Custom output path (must remain inside .local/)
 *
 * SAFETY RULES:
 *   - Reads ANTHROPIC_API_KEY from env only. Never printed.
 *   - Writes output to .local/parser-ai-outputs/ only (gitignored).
 *   - No Supabase. No DB writes. No service role.
 *   - Raw AI output must be inspected before any future staged write.
 *   - Do not import from app runtime code.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'
import { mockNTWAvenueDecking } from '../lib/parser/fixtures'
import type { ParserOutput } from '../lib/parser/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

const DEFAULT_MODEL = 'claude-sonnet-4-6'

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
// Prompt construction
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

## Evidence rules

Every non-null extracted field should appear in field_sources with:
- field_name, extracted_value (as string), source_page_number, source_chunk_id (use the chunk IDs from input), confidence

Use source_chunk_id from the input chunk list. Use source_page_number from the chunk's page_number.

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
// Main
// ----------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const useFixture = args.fixture === true
  const model = typeof args.model === 'string' ? args.model : DEFAULT_MODEL

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

  // Resolve output path
  const outDir = path.join(REPO_ROOT, '.local', 'parser-ai-outputs')
  const docSlug = docName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultOut = path.join(outDir, `${docSlug}-${timestamp}.json`)

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

  // ── Fixture mode ───────────────────────────────────────────────
  if (useFixture) {
    console.log('\n[parser:ai-local] Fixture mode — skipping API call')
    console.log(`  Document      : ${docName}`)
    console.log(`  Chunks        : ${chunks.length}`)

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
        model: 'fixture (no API call)',
        source_bundle: resolvedInput,
        bundle_document_id: docId,
        bundle_document_name: docName,
        usage: null,
      },
      parser_output: fixtureOutput,
    }

    writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8')

    console.log(`  Fixture       : mockNTWAvenueDecking`)
    console.log(`  Systems       : ${fixtureOutput.systems.length}`)
    console.log(`  Profiles      : ${fixtureOutput.system_profiles.length}`)
    console.log(`  Components    : ${fixtureOutput.components.length}`)
    console.log(`  Colours       : ${fixtureOutput.system_colours.length}`)
    console.log(`  Output        : ${outPath}`)
    console.log()
    return
  }

  // ── API mode ───────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error(
      '\n[ERROR] Missing required AI API key env var.\n' +
      '        Set ANTHROPIC_API_KEY in .env.local or your shell environment.\n' +
      '        No output written.\n' +
      '        To test without an API key: pnpm parser:ai-local -- --input "..." --fixture\n'
    )
    process.exit(1)
  }

  console.log('\n[parser:ai-local] Running AI extraction')
  console.log(`  Document      : ${docName}`)
  console.log(`  Chunks        : ${chunks.length}`)
  console.log(`  Model         : ${model}`)

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(bundle, chunks)

  let rawContent: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let usage: any = null

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    usage = response.usage

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('[ERROR] API returned no text content block. No output written.')
      process.exit(1)
    }
    rawContent = textBlock.text.trim()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] API call failed: ${msg}`)
    console.error('  No output written.')
    process.exit(1)
  }

  // Strip accidental markdown fences if present
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
    console.error('  Raw response saved to output file for inspection.')
    // Still save the raw response so it can be inspected
    const errorFile = {
      _meta: {
        generated_at: new Date().toISOString(),
        generator: 'parser-ai-local.ts',
        fixture_mode: false,
        model,
        source_bundle: resolvedInput,
        bundle_document_id: docId,
        bundle_document_name: docName,
        usage,
        parse_error: msg,
      },
      raw_response: rawContent,
      parser_output: null,
    }
    writeFileSync(outPath, JSON.stringify(errorFile, null, 2), 'utf8')
    console.error(`  Saved to: ${outPath}`)
    process.exit(1)
  }

  // Basic top-level shape check
  const topLevelKeys = ['systems', 'system_profiles', 'components', 'system_components', 'system_colours']
  const missing = topLevelKeys.filter(k => !Array.isArray(parserOutput[k]))
  if (missing.length > 0) {
    console.warn(`[WARN] AI output missing expected top-level arrays: ${missing.join(', ')}`)
    console.warn('  Output saved anyway — run parser:dry-run to validate fully.')
  }

  const file = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'parser-ai-local.ts',
      fixture_mode: false,
      model,
      source_bundle: resolvedInput,
      bundle_document_id: docId,
      bundle_document_name: docName,
      usage: usage
        ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens }
        : null,
    },
    parser_output: parserOutput,
  }

  writeFileSync(outPath, JSON.stringify(file, null, 2), 'utf8')

  const systemCount = Array.isArray(parserOutput.systems) ? parserOutput.systems.length : '?'
  const profileCount = Array.isArray(parserOutput.system_profiles) ? parserOutput.system_profiles.length : '?'
  const componentCount = Array.isArray(parserOutput.components) ? parserOutput.components.length : '?'
  const colourCount = Array.isArray(parserOutput.system_colours) ? parserOutput.system_colours.length : '?'

  console.log(`  Systems       : ${systemCount}`)
  console.log(`  Profiles      : ${profileCount}`)
  console.log(`  Components    : ${componentCount}`)
  console.log(`  Colours       : ${colourCount}`)
  if (usage) {
    console.log(`  Input tokens  : ${usage.input_tokens}`)
    console.log(`  Output tokens : ${usage.output_tokens}`)
  }
  console.log(`  Output        : ${outPath}`)
  console.log()
  console.log('  Raw AI output saved. Run parser:dry-run --ai-output to validate.')
  console.log('  No DB writes performed.')
  console.log()
}

main()
