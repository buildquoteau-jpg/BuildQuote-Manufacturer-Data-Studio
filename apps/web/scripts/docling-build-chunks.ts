#!/usr/bin/env tsx
/**
 * apps/web/scripts/docling-build-chunks.ts
 *
 * Local-only. Reads a Docling output directory (output.md + summary.json)
 * and splits the markdown into parser-ready chunks tagged by type.
 *
 * SAFETY RULES — read before running:
 *   - Local only. No Supabase. No AI calls. No DB writes. No secrets.
 *   - Input must be under .local/docling-output/ (gitignored).
 *   - Output goes to .local/parser-inputs/docling/ (gitignored).
 *   - Chunk text is written to the output file only, never printed to terminal.
 *
 * Usage:
 *   pnpm docling:chunks -- --input ".local/docling-output/<folder>"
 *   pnpm docling:chunks -- --input ".local/docling-output/<folder>" --dry-run
 *   pnpm docling:chunks -- --input ".local/docling-output/<folder>" --out ".local/parser-inputs/docling/custom.json"
 *
 * --input    Path to Docling output directory (required)
 * --dry-run  Preview stats without writing output file
 * --out      Custom output path (optional, must be under .local/)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ─── Types ────────────────────────────────────────────────────────────────────

type ChunkType = 'text' | 'table' | 'spec_table'

interface DoclingChunk {
  chunk_index: number
  page_number: number | null
  chunk_type: ChunkType
  heading: string | null
  char_count: number
  raw_text: string
}

interface DoclingSummary {
  input_filename: string
  document_id: string | null
  page_count: number | null
  extracted_pages_count?: number | null
  extracted_pages_max?: number | null
  extraction_complete?: boolean | null
  character_count: number | null
  table_count: number | null
  output_files: Record<string, string>
  timestamp: string
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function hr() {
  console.log('─'.repeat(60))
}

// ─── Spec-table detection ─────────────────────────────────────────────────────
//
// Three routes to spec_table classification:
//   1. Single CORE keyword match (e.g. "profile code", "dimensions")
//   2. Two or more SECONDARY keyword matches (e.g. "coverage" + "max span")
//   3. A PRODUCT_ID column header + two or more SPEC_COLUMN headers
//      — catches James Hardie-style tables that use "Product Code",
//        "Length (mm)", "Thickness (mm)", etc. rather than NewTechWood vocabulary.

const CORE_SPEC_KEYWORDS = [
  'profile code',
  'dimensions',
  'qty/pack',
  'qty/ pack',
]

const SECONDARY_SPEC_KEYWORDS = [
  'max span',
  'slip rating',
  'secret fix',
  'double sided',
  'boards p/m',
  'lm p/m',
  'coverage',
  'secret',
]

// Product-identifier column headers — trigger route 3 when paired with spec columns.
const PRODUCT_ID_KEYWORDS = [
  'product code',
  'surface texture', // Axon tables list "Surface Texture | Product Code | …"
]

// Technical/dimensional column headers counted in route 3 (need ≥ 2).
const SPEC_COLUMN_KEYWORDS = [
  'length (mm)',
  'width (mm)',
  'thickness (mm)',
  'weight per unit',
  'coverage per panel',
  'groove spacing',
  'joint design',
  'steel reinforcement',
]

function isSpecTable(tableText: string): boolean {
  const lower = tableText.toLowerCase()
  if (CORE_SPEC_KEYWORDS.some(kw => lower.includes(kw))) return true
  if (SECONDARY_SPEC_KEYWORDS.filter(kw => lower.includes(kw)).length >= 2) return true
  // Route 3: product identifier column + at least two spec/dimension columns.
  const hasProductId = PRODUCT_ID_KEYWORDS.some(kw => lower.includes(kw))
  if (hasProductId && SPEC_COLUMN_KEYWORDS.filter(kw => lower.includes(kw)).length >= 2) return true
  return false
}

// ─── Ghost-table detection ────────────────────────────────────────────────────
//
// Docling sometimes emits degenerate table blocks that contain only a bare "|"
// (image borders, layout rules, empty cells). Strip pipes, dashes and whitespace:
// if nothing alphanumeric remains the table carries no extractable information.

function isGhostTable(tableText: string): boolean {
  return tableText.replace(/[|\s\-]/g, '').length === 0
}

// ─── Markdown chunker ─────────────────────────────────────────────────────────

interface ChunkResult {
  chunks: DoclingChunk[]
  ghostsFiltered: number
}

function splitMarkdownIntoChunks(markdown: string): ChunkResult {
  const lines = markdown.split('\n')
  const chunks: DoclingChunk[] = []
  let chunkIndex = 0
  let currentHeading: string | null = null
  let pendingLines: string[] = []
  let ghostsFiltered = 0

  function flushText(): void {
    while (pendingLines.length > 0 && !pendingLines[pendingLines.length - 1].trim()) {
      pendingLines.pop()
    }
    const text = pendingLines.join('\n').trim()
    pendingLines = []
    if (!text) return
    chunks.push({
      chunk_index: chunkIndex++,
      page_number: null,
      chunk_type: 'text',
      heading: currentHeading,
      raw_text: text,
      char_count: text.length,
    })
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // ── Heading ────────────────────────────────────────────────────
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushText()
      currentHeading = headingMatch[2].trim()
      i++
      continue
    }

    // ── Table block ────────────────────────────────────────────────
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushText()
      const tableLines: string[] = []
      while (
        i < lines.length &&
        lines[i].trim().startsWith('|') &&
        lines[i].trim().endsWith('|')
      ) {
        tableLines.push(lines[i])
        i++
      }
      const tableText = tableLines.join('\n').trim()
      if (tableText) {
        if (isGhostTable(tableText)) {
          ghostsFiltered++
        } else {
          const chunkType: ChunkType = isSpecTable(tableText) ? 'spec_table' : 'table'
          chunks.push({
            chunk_index: chunkIndex++,
            page_number: null,
            chunk_type: chunkType,
            heading: currentHeading,
            raw_text: tableText,
            char_count: tableText.length,
          })
        }
      }
      continue
    }

    // ── Image placeholder — discard silently ───────────────────────
    if (trimmed === '<!-- image -->') {
      i++
      continue
    }

    // ── Regular content ────────────────────────────────────────────
    if (trimmed) {
      pendingLines.push(line)
    } else if (pendingLines.length > 0) {
      pendingLines.push('')
    }
    i++
  }

  flushText()
  return { chunks, ghostsFiltered }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const isDryRun = args['dry-run'] === true
  const allowPartial = args['allow-partial'] === true

  hr()
  console.log('[docling:chunks] Docling markdown → parser chunks')
  if (isDryRun) console.log('[docling:chunks] DRY-RUN — no file will be written')
  if (allowPartial) console.log('[docling:chunks] --allow-partial: page-coverage guard disabled')

  // ── Validate input ─────────────────────────────────────────────
  const inputArg = args.input
  if (!inputArg || typeof inputArg !== 'string') {
    console.error('[ERROR] --input <docling-output-dir> is required')
    console.error(
      '  Example: pnpm docling:chunks -- --input ".local/docling-output/NewTechWood-..._20260514T122534Z"'
    )
    process.exit(1)
  }

  const resolvedInput = resolveDotLocal(inputArg)
  requireUnderLocal(resolvedInput, '--input')

  if (!existsSync(resolvedInput)) {
    console.error(`[ERROR] Docling output directory not found: ${resolvedInput}`)
    console.error('  Run: python scripts/docling/extract_docling.py --input <pdf>')
    process.exit(1)
  }

  const mdPath = path.join(resolvedInput, 'output.md')
  const summaryPath = path.join(resolvedInput, 'summary.json')

  if (!existsSync(mdPath)) {
    console.error(`[ERROR] output.md not found in: ${resolvedInput}`)
    process.exit(1)
  }
  if (!existsSync(summaryPath)) {
    console.error(`[ERROR] summary.json not found in: ${resolvedInput}`)
    process.exit(1)
  }

  // ── Read inputs ────────────────────────────────────────────────
  let summary: DoclingSummary
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as DoclingSummary
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ERROR] Could not parse summary.json: ${msg}`)
    process.exit(1)
  }

  // ── Page-coverage guard ────────────────────────────────────────
  // Docling sometimes silently stops extracting partway through a PDF. Detect
  // this by reading extracted_pages_max written by extract_docling.py and
  // comparing against page_count. Fail fast before spending API credits.
  if (!allowPartial) {
    const pageCount = summary.page_count
    const extractedMax = summary.extracted_pages_max ?? null
    const extractionComplete = summary.extraction_complete ?? null

    const incomplete =
      extractionComplete === false ||
      (extractionComplete === null && pageCount != null && extractedMax != null && extractedMax / pageCount < 0.9)

    if (incomplete) {
      const maxPage = extractedMax ?? '?'
      const pct = pageCount && extractedMax ? `${Math.round((extractedMax / pageCount) * 100)}%` : '?'
      console.error(`[ERROR] Incomplete Docling extraction — cannot build chunks.`)
      console.error(`  PDF pages declared : ${pageCount ?? '?'}`)
      console.error(`  Highest page found : ${maxPage}`)
      console.error(`  Coverage           : ${pct}`)
      console.error(``)
      console.error(`  Pages ${typeof extractedMax === 'number' ? extractedMax + 1 : '?'}–${pageCount ?? '?'} are missing from the Docling output.`)
      console.error(`  The parser will produce incorrect results from incomplete chunks.`)
      console.error(``)
      console.error(`  Fix: re-run Docling extraction with a complete PDF:`)
      console.error(`    python scripts/docling/extract_docling.py --input <path/to/full.pdf>`)
      console.error(``)
      console.error(`  To skip this guard (only if missing pages have no product data):`)
      console.error(`    pnpm docling:chunks -- --input <dir> --allow-partial`)
      process.exit(1)
    }
  }

  const markdownText = readFileSync(mdPath, 'utf8')

  // ── Split ──────────────────────────────────────────────────────
  const { chunks, ghostsFiltered } = splitMarkdownIntoChunks(markdownText)

  // ── Stats ──────────────────────────────────────────────────────
  const typeCounts: Record<string, number> = {}
  let totalChars = 0
  let missingPageProvenance = 0
  for (const chunk of chunks) {
    typeCounts[chunk.chunk_type] = (typeCounts[chunk.chunk_type] ?? 0) + 1
    totalChars += chunk.char_count
    if (chunk.page_number === null) missingPageProvenance++
  }

  const inputDirBasename = path.basename(resolvedInput)

  // ── Resolve output path ────────────────────────────────────────
  const defaultOutPath = path.join(
    REPO_ROOT, '.local', 'parser-inputs', 'docling', inputDirBasename, 'parser_chunks.json'
  )
  let resolvedOut: string
  if (args.out && typeof args.out === 'string') {
    resolvedOut = resolveDotLocal(args.out)
    requireUnderLocal(resolvedOut, '--out')
  } else {
    resolvedOut = defaultOutPath
  }

  // ── Print summary ──────────────────────────────────────────────
  hr()
  console.log('[docling:chunks] Input')
  console.log(`  Directory     : ${path.relative(REPO_ROOT, resolvedInput)}`)
  console.log(`  Document      : ${summary.input_filename}`)
  if (summary.document_id) {
    console.log(`  Document ID   : ${summary.document_id}`)
  }
  console.log(`  PDF pages     : ${summary.page_count ?? '?'}`)
  console.log(`  Docling chars : ${summary.character_count?.toLocaleString() ?? '?'}`)
  console.log(`  Docling tables: ${summary.table_count ?? '?'}`)
  hr()
  console.log('[docling:chunks] Chunk result')
  console.log(`  Total chunks  : ${chunks.length}`)
  console.log(`  Total chars   : ${totalChars.toLocaleString()}`)
  for (const [type, count] of Object.entries(typeCounts).sort()) {
    console.log(`  ${type.padEnd(14)}: ${count}`)
  }
  console.log(`  ghosts removed: ${ghostsFiltered}`)
  if (missingPageProvenance > 0) {
    console.log(`  ⚠ page provenance missing: ${missingPageProvenance}/${chunks.length} chunks (page_number null)`)
  }
  hr()
  console.log('[docling:chunks] First 5 chunks (heading | type | chars)')
  for (const chunk of chunks.slice(0, 5)) {
    const idx = String(chunk.chunk_index).padStart(2, '0')
    const heading = (chunk.heading ?? '(no heading)').slice(0, 48)
    const type = chunk.chunk_type.padEnd(12)
    console.log(`  [${idx}] ${type} | ${heading} | ${chunk.char_count} chars`)
  }
  hr()

  if (isDryRun) {
    console.log('[docling:chunks] DRY-RUN complete. No file written.')
    console.log(`  Would write to: ${path.relative(REPO_ROOT, resolvedOut)}`)
    console.log()
    return
  }

  // ── Build and write output bundle ──────────────────────────────
  const bundle = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'docling-build-chunks.ts',
      local_only: true,
      source_tool: 'docling',
    },
    document: {
      input_filename: summary.input_filename,
      document_id: summary.document_id ?? null,
      page_count: summary.page_count ?? null,
      docling_output_dir: inputDirBasename,
    },
    combined_text_metadata: {
      chunk_count: chunks.length,
      total_chars: totalChars,
      chunk_type_counts: typeCounts,
      ghosts_filtered: ghostsFiltered,
      missing_page_provenance: missingPageProvenance,
    },
    chunks,
  }

  mkdirSync(path.dirname(resolvedOut), { recursive: true })
  writeFileSync(resolvedOut, JSON.stringify(bundle, null, 2), 'utf8')

  console.log('[docling:chunks] Written')
  console.log(`  Output        : ${path.relative(REPO_ROOT, resolvedOut)}`)
  console.log('  No DB writes. No API calls. Local only.')
  console.log()
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
