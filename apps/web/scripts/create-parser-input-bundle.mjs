#!/usr/bin/env node
/**
 * apps/web/scripts/create-parser-input-bundle.mjs
 *
 * Local-only script. Reads document_chunks and metadata from local Supabase
 * for a given document ID and writes a parser input bundle JSON file.
 *
 * SAFETY RULES — read before running:
 *   - Requires LOCAL_ONLY_ALLOW_SERVICE_ROLE=true in .env.local.
 *   - Uses the Supabase service role key to bypass RLS (read-only queries only).
 *   - NEVER run against production Supabase.
 *   - NEVER import this file from app runtime code.
 *   - Output goes to .local/ which is gitignored — never commit it.
 *   - Chunk text content is written to the JSON file only, never printed to terminal.
 *
 * Usage:
 *   pnpm parser:bundle -- --document <documentId>
 *   pnpm parser:bundle -- --document <documentId> --out .local/parser-inputs/custom.json
 */

import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvFile, parseArgs } from './lib/cli.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// apps/web/scripts/ → ../../.. → monorepo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

// ─── Load .env.local ──────────────────────────────────────────────────────────

loadEnvFile(path.join(REPO_ROOT, '.env.local'))

// ─── Safety check ────────────────────────────────────────────────────────────

if (process.env.LOCAL_ONLY_ALLOW_SERVICE_ROLE !== 'true') {
  console.error(
    '\n[ERROR] LOCAL_ONLY_ALLOW_SERVICE_ROLE is not set to "true" in .env.local.\n' +
    '        This script uses the Supabase service role key to bypass RLS.\n' +
    '        It must only run against your local Supabase instance.\n' +
    '        Add this to .env.local:\n' +
    '          LOCAL_ONLY_ALLOW_SERVICE_ROLE=true\n'
  )
  process.exit(1)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const documentId = args.document
  if (!documentId) {
    console.error('[ERROR] --document <documentId> is required')
    console.error('  Example: pnpm parser:bundle -- --document b576c341-bbb1-4124-ad41-9cc90c4816fc')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error(
      '[ERROR] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from .env.local'
    )
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Fetch source document
  const { data: doc, error: docErr } = await supabase
    .from('source_documents')
    .select('id, manufacturer_id, document_name, document_type, storage_provider, status, uploaded_at, notes')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) {
    console.error(
      `[ERROR] Could not fetch source_document ${documentId}: ${docErr?.message ?? 'not found'}`
    )
    process.exit(1)
  }

  // 2. Fetch manufacturer
  const { data: mfr, error: mfrErr } = await supabase
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('id', doc.manufacturer_id)
    .single()

  if (mfrErr || !mfr) {
    console.error(
      `[ERROR] Could not fetch manufacturer ${doc.manufacturer_id}: ${mfrErr?.message ?? 'not found'}`
    )
    process.exit(1)
  }

  // 3. Fetch extraction runs (most recent first)
  const { data: runs, error: runsErr } = await supabase
    .from('extraction_runs')
    .select('id, run_type, tool_name, status, started_at, completed_at, error_message')
    .eq('source_document_id', documentId)
    .order('started_at', { ascending: false })

  if (runsErr) {
    console.warn(`[WARN] Could not fetch extraction_runs: ${runsErr.message}`)
  }

  const latestRun = runs?.[0] ?? null

  // 4. Fetch document chunks in order
  const { data: chunks, error: chunksErr } = await supabase
    .from('document_chunks')
    .select('id, page_number, chunk_index, raw_text, heading, chunk_type')
    .eq('source_document_id', documentId)
    .order('chunk_index', { ascending: true })

  if (chunksErr) {
    console.error(`[ERROR] Could not fetch document_chunks: ${chunksErr.message}`)
    process.exit(1)
  }

  const safeChunks = chunks ?? []
  const totalChars = safeChunks.reduce((sum, c) => sum + (c.raw_text?.length ?? 0), 0)
  const uniquePages = new Set(
    safeChunks.map(c => c.page_number).filter(p => p != null)
  ).size

  // 5. Build bundle
  const bundle = {
    _meta: {
      generated_at: new Date().toISOString(),
      generator: 'create-parser-input-bundle.mjs',
      local_only: true,
    },
    manufacturer: {
      id: mfr.id,
      name: mfr.name,
      slug: mfr.slug,
    },
    document: {
      id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      status: doc.status,
      storage_provider: doc.storage_provider,
      uploaded_at: doc.uploaded_at,
      notes: doc.notes ?? null,
    },
    extraction_run: latestRun
      ? {
          id: latestRun.id,
          run_type: latestRun.run_type,
          tool_name: latestRun.tool_name ?? null,
          status: latestRun.status,
          started_at: latestRun.started_at,
          completed_at: latestRun.completed_at ?? null,
        }
      : null,
    combined_text_metadata: {
      chunk_count: safeChunks.length,
      page_count: uniquePages,
      total_chars: totalChars,
    },
    chunks: safeChunks.map(c => ({
      id: c.id,
      page_number: c.page_number,
      chunk_index: c.chunk_index,
      chunk_type: c.chunk_type ?? null,
      heading: c.heading ?? null,
      char_count: c.raw_text?.length ?? 0,
      raw_text: c.raw_text ?? null,
    })),
  }

  // 6. Resolve output path
  const outputBase = path.join(REPO_ROOT, '.local', 'parser-inputs')
  const docSlug = (doc.document_name ?? documentId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultFilename = `${docSlug}-${timestamp}.json`

  const outPath = args.out
    ? path.resolve(String(args.out))
    : path.join(outputBase, defaultFilename)

  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8')

  // 7. Safe summary — no chunk text printed to terminal
  console.log('\n[parser:bundle] Bundle created successfully')
  console.log(`  Manufacturer  : ${mfr.name} (${mfr.slug})`)
  console.log(`  Document      : ${doc.document_name}`)
  console.log(`  Doc status    : ${doc.status}`)
  console.log(`  Chunks        : ${safeChunks.length}`)
  console.log(`  Pages         : ${uniquePages}`)
  console.log(`  Total chars   : ${totalChars.toLocaleString()} (text content not printed)`)
  console.log(`  Tool          : ${latestRun?.tool_name ?? '—'}`)
  console.log(`  Extraction ID : ${latestRun ? `${latestRun.id} (${latestRun.status})` : 'none'}`)
  console.log(`  Output        : ${outPath}`)
  console.log()
}

main().catch(err => {
  console.error('[FATAL]', err.message ?? err)
  process.exit(1)
})
