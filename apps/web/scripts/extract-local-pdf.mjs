#!/usr/bin/env node
/**
 * apps/web/scripts/extract-local-pdf.mjs
 *
 * Local-only PDF extraction harness for BuildQuote Data Studio.
 *
 * SAFETY RULES — read before running:
 *   - Requires LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local.
 *   - Uses the Supabase service role key to bypass RLS for local inserts.
 *   - NEVER import this file from app runtime code.
 *   - NEVER commit PDF files or .local/ extraction artifacts to git.
 *   - NEVER run against production Supabase (point NEXT_PUBLIC_SUPABASE_URL
 *     at your local Supabase instance only).
 *
 * Usage:
 *   pnpm extract:local-pdf -- \
 *     --manufacturer newtechwood \
 *     --file "C:\path\to\guide.pdf" \
 *     --type product_guide \
 *     --name "NewTechWood Product Guide Test"
 *
 * Args:
 *   --manufacturer  Manufacturer slug (required) — must exist in data_studio_manufacturers
 *   --file          Absolute path to the PDF file (required)
 *   --type          Document type: product_guide | installation_guide | brochure |
 *                   spec_sheet | other  (default: product_guide)
 *   --name          Display name for the document (default: filename without extension)
 */

import { readFileSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, parseArgs } from './lib/cli.mjs'

const require = createRequire(import.meta.url)
// pdf-parse v2 exports a class, not a function. The v1 pattern of calling
// pdfParse(buffer) does not work with v2.
const { PDFParse } = require('pdf-parse')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// apps/web/scripts/ → ../../.. → monorepo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ─── Load .env.local ──────────────────────────────────────────────────────────

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ─── Chunking ─────────────────────────────────────────────────────────────────

const CHUNK_TARGET = 2000

function chunkPageText(text, pageNumber) {
  const chunks = []
  if (!text || text.trim().length === 0) return chunks

  let remaining = text.trim()
  let chunkIndex = 0

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_TARGET) {
      chunks.push({ pageNumber, chunkIndex, text: remaining })
      break
    }
    // Find a word boundary at or before CHUNK_TARGET
    let cutAt = CHUNK_TARGET
    const boundary = remaining.lastIndexOf(' ', CHUNK_TARGET)
    if (boundary > Math.floor(CHUNK_TARGET * 0.5)) {
      cutAt = boundary
    }
    const chunkText = remaining.slice(0, cutAt).trim()
    if (chunkText.length > 0) {
      chunks.push({ pageNumber, chunkIndex, text: chunkText })
      chunkIndex++
    }
    remaining = remaining.slice(cutAt).trim()
  }

  return chunks
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
}

// ─── Safe summary (never prints keys or file contents) ───────────────────────

function printSummary({ manufacturerName, slug, sourceDocumentId, extractionRunId, pageCount, chunkCount, artifactPath }) {
  console.log('\n' + '─'.repeat(62))
  console.log('  Local Extraction Complete')
  console.log('─'.repeat(62))
  console.log(`  Manufacturer:   ${manufacturerName} (${slug})`)
  console.log(`  Pages:          ${pageCount}`)
  console.log(`  Chunks:         ${chunkCount}`)
  console.log(`  Status:         extracted`)
  console.log(`  Source doc ID:  ${sourceDocumentId}`)
  console.log(`  Extraction run: ${extractionRunId}`)
  console.log(`  Artifact:       ${artifactPath}`)
  console.log('─'.repeat(62))
  console.log('  To view in admin:')
  console.log('  /admin/manufacturers/[manufacturerId]/documents/' + sourceDocumentId)
  console.log('─'.repeat(62) + '\n')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Safety flag ──────────────────────────────────────────────────────────
  if (process.env.LOCAL_ONLY_ALLOW_SERVICE_ROLE !== 'true') {
    console.error(`
ERROR: Service role safety flag not set.

This script writes extraction rows to the local Supabase database using the
service role key (RLS has no INSERT policies for the anon role).

To confirm this is intentional on your local machine only, add this to your
.env.local file:

  LOCAL_ONLY_ALLOW_SERVICE_ROLE=true

Do NOT set this flag in any production environment or shared CI.
`)
    process.exit(1)
  }

  // ── Args ──────────────────────────────────────────────────────────────────
  const args = parseArgs(process.argv.slice(2))

  if (!args.manufacturer || !args.file) {
    console.error(`
Usage:
  pnpm extract:local-pdf -- \\
    --manufacturer <slug> \\
    --file "<path/to/file.pdf>" \\
    --type <product_guide|installation_guide|brochure|spec_sheet|other> \\
    --name "<Display Name>"

Required:
  --manufacturer   Manufacturer slug (e.g. newtechwood)
  --file           Path to PDF file on this machine

Optional:
  --type           Document type (default: product_guide)
  --name           Display name (default: filename without extension)
`)
    process.exit(1)
  }

  const manufacturerSlug = String(args.manufacturer)
  const filePath = String(args.file)
  const documentType = args.type ? String(args.type) : 'product_guide'
  const documentName = args.name
    ? String(args.name)
    : path.basename(filePath, path.extname(filePath))

  // ── Env validation (never print values) ───────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error('ERROR: Missing env var: NEXT_PUBLIC_SUPABASE_URL')
    process.exit(1)
  }
  if (!serviceRoleKey) {
    console.error('ERROR: Missing env var: SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log('\n[extract-local-pdf] Starting...')
  console.log(`  manufacturer:   ${manufacturerSlug}`)
  console.log(`  file:           ${filePath}`)
  console.log(`  type:           ${documentType}`)
  console.log(`  name:           ${documentName}`)

  // ── Supabase client (service role — local only) ────────────────────────────
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 1. Validate manufacturer slug ──────────────────────────────────────────
  const { data: mfr, error: mfrErr } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('slug', manufacturerSlug)
    .single()

  if (mfrErr || !mfr) {
    console.error(`ERROR: Manufacturer slug "${manufacturerSlug}" not found in data_studio_manufacturers.`)
    if (mfrErr) console.error(`  DB: ${mfrErr.message}`)
    console.error('  Check the slug matches a seeded manufacturer and local Supabase is running.')
    process.exit(1)
  }
  console.log(`\n  ✓ Manufacturer: ${mfr.name} (${mfr.id})`)

  // ── 2. Read PDF file ───────────────────────────────────────────────────────
  let pdfBuffer
  let fileSize
  try {
    const stats = statSync(filePath)
    fileSize = stats.size
    pdfBuffer = readFileSync(filePath)
  } catch (err) {
    console.error(`ERROR: Could not read PDF file at: ${filePath}`)
    console.error(`  ${err.message}`)
    process.exit(1)
  }
  console.log(`  ✓ PDF loaded (${Math.round(fileSize / 1024)} KB)`)

  const originalFilename = path.basename(filePath)

  // ── 3a. Clean up any stuck rows from a previously interrupted run ─────────
  // If the process was killed before error-handling ran, source_documents rows
  // can be left in 'extracting' status forever. Mark them failed before inserting
  // a fresh row so the admin UI doesn't show stuck documents.
  const { data: stuckRows } = await supabase
    .from('source_documents')
    .select('id')
    .eq('manufacturer_id', mfr.id)
    .eq('original_filename', originalFilename)
    .eq('document_name', documentName)
    .in('status', ['extracting', 'parsing'])

  if (stuckRows && stuckRows.length > 0) {
    const stuckIds = stuckRows.map((r) => r.id)
    await supabase
      .from('source_documents')
      .update({ status: 'failed', notes: 'Superseded by a later extraction run.' })
      .in('id', stuckIds)
    console.log(`  ℹ Marked ${stuckIds.length} stuck document row(s) as failed`)
  }

  // ── 3. Insert source_documents row ────────────────────────────────────────
  const { data: srcDoc, error: srcDocErr } = await supabase
    .from('source_documents')
    .insert({
      manufacturer_id: mfr.id,
      original_filename: originalFilename,
      document_name: documentName,
      document_type: documentType,
      storage_provider: 'local_only',
      file_mime_type: 'application/pdf',
      file_size_bytes: fileSize,
      status: 'extracting',
      notes: 'Local extraction test — no storage provider connected. Not a real upload.',
    })
    .select('id')
    .single()

  if (srcDocErr || !srcDoc) {
    console.error('ERROR: Failed to insert source_documents row.')
    console.error(`  ${srcDocErr?.message ?? 'Unknown error'}`)
    console.error('  Check that SUPABASE_SERVICE_ROLE_KEY is correct and local Supabase is running.')
    process.exit(1)
  }
  const sourceDocumentId = srcDoc.id
  console.log(`  ✓ source_documents created (${sourceDocumentId})`)

  // ── 4. Insert extraction_runs row ──────────────────────────────────────────
  const { data: runRow, error: runErr } = await supabase
    .from('extraction_runs')
    .insert({
      source_document_id: sourceDocumentId,
      run_type: 'chunk_document',
      status: 'running',
      tool_name: 'pdf-parse',
      tool_version: 'local-script-v1',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (runErr || !runRow) {
    console.error('ERROR: Failed to insert extraction_runs row.')
    console.error(`  ${runErr?.message ?? 'Unknown error'}`)
    await supabase.from('source_documents').update({ status: 'failed' }).eq('id', sourceDocumentId)
    process.exit(1)
  }
  const extractionRunId = runRow.id
  console.log(`  ✓ extraction_runs created (${extractionRunId})`)

  // ── 5. Extract PDF text per page ───────────────────────────────────────────
  // pdf-parse v2: new PDFParse({ data }) → getText() → { pages: [{ text, num }] }
  let extractedPages = []
  try {
    const parser = new PDFParse({ data: pdfBuffer })
    const result = await parser.getText()
    extractedPages = result.pages.map((p) => ({
      pageNumber: p.num,
      text: typeof p.text === 'string' ? p.text.replace(/\s+/g, ' ').trim() : '',
    }))
  } catch (err) {
    console.error(`ERROR: PDF extraction failed — ${err.message}`)
    await Promise.all([
      supabase.from('source_documents').update({ status: 'failed' }).eq('id', sourceDocumentId),
      supabase.from('extraction_runs').update({
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString(),
      }).eq('id', extractionRunId),
    ])
    process.exit(1)
  }

  const nonEmptyPages = extractedPages.filter((p) => p.text.length > 0)
  console.log(
    `  ✓ Extracted ${extractedPages.length} pages (${nonEmptyPages.length} with text)`
  )

  // ── 6. Insert document_pages rows ──────────────────────────────────────────
  const pageIdMap = new Map() // pageNumber → page row id

  for (const page of extractedPages) {
    const { data: pageRow, error: pageErr } = await supabase
      .from('document_pages')
      .insert({
        source_document_id: sourceDocumentId,
        page_number: page.pageNumber,
        page_text: page.text || null,
      })
      .select('id')
      .single()

    if (pageErr) {
      console.warn(`  WARN: Failed to insert page ${page.pageNumber}: ${pageErr.message}`)
    } else if (pageRow) {
      pageIdMap.set(page.pageNumber, pageRow.id)
    }
  }
  console.log(`  ✓ Inserted ${pageIdMap.size}/${extractedPages.length} document_pages rows`)

  // ── 7. Chunk and insert document_chunks ────────────────────────────────────
  const allPageChunks = []
  for (const page of extractedPages) {
    const chunks = chunkPageText(page.text, page.pageNumber)
    for (const chunk of chunks) {
      allPageChunks.push({
        ...chunk,
        pageId: pageIdMap.get(page.pageNumber) ?? null,
      })
    }
  }

  // Assign global chunk_index across all pages
  const chunkRowsToInsert = allPageChunks.map((chunk, globalIdx) => ({
    source_document_id: sourceDocumentId,
    document_page_id: chunk.pageId,
    extraction_run_id: extractionRunId,
    page_number: chunk.pageNumber,
    chunk_index: globalIdx,
    raw_text: chunk.text,
  }))

  let insertedChunkCount = 0
  const BATCH_SIZE = 50
  for (let i = 0; i < chunkRowsToInsert.length; i += BATCH_SIZE) {
    const batch = chunkRowsToInsert.slice(i, i + BATCH_SIZE)
    const { data: inserted, error: chunkErr } = await supabase
      .from('document_chunks')
      .insert(batch)
      .select('id')

    if (chunkErr) {
      console.warn(`  WARN: Chunk batch ${Math.floor(i / BATCH_SIZE) + 1} insert error: ${chunkErr.message}`)
    } else {
      insertedChunkCount += inserted?.length ?? 0
    }
  }
  console.log(`  ✓ Inserted ${insertedChunkCount}/${chunkRowsToInsert.length} document_chunks rows`)

  // ── 8. Update statuses ────────────────────────────────────────────────────
  const completedAt = new Date().toISOString()
  await Promise.all([
    supabase
      .from('source_documents')
      .update({ status: 'extracted' })
      .eq('id', sourceDocumentId),
    supabase
      .from('extraction_runs')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', extractionRunId),
  ])
  console.log('  ✓ Statuses updated: source_documents → extracted, extraction_runs → completed')

  // ── 9. Write local artifact (gitignored) ──────────────────────────────────
  const artifactDir = path.join(REPO_ROOT, '.local', 'extractions')
  mkdirSync(artifactDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')
  const artifactFilename = `${manufacturerSlug}-${timestamp}.json`
  const artifactPath = path.join(artifactDir, artifactFilename)

  const artifact = {
    _note: 'Local extraction artifact — gitignored. Do not commit.',
    manufacturer_slug: manufacturerSlug,
    manufacturer_name: mfr.name,
    document_name: documentName,
    document_type: documentType,
    source_file_name: originalFilename,
    source_document_id: sourceDocumentId,
    extraction_run_id: extractionRunId,
    extracted_at: completedAt,
    page_count: extractedPages.length,
    chunk_count: insertedChunkCount,
    pages: extractedPages.map((p) => ({
      page_number: p.pageNumber,
      char_count: p.text.length,
      text_hash: hashText(p.text),
      text: p.text,
    })),
    chunks: chunkRowsToInsert.map((c) => ({
      page_number: c.page_number,
      chunk_index: c.chunk_index,
      char_count: c.raw_text?.length ?? 0,
      text_hash: c.raw_text ? hashText(c.raw_text) : null,
      text: c.raw_text,
    })),
  }

  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8')

  printSummary({
    manufacturerName: mfr.name,
    slug: manufacturerSlug,
    sourceDocumentId,
    extractionRunId,
    pageCount: extractedPages.length,
    chunkCount: insertedChunkCount,
    artifactPath,
  })
}

main().catch((err) => {
  console.error('\nUnhandled error:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
