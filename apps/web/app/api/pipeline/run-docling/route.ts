import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

const repoRoot = path.resolve(process.cwd(), '..', '..')

function statusPath(documentId: string) {
  return path.join(repoRoot, '.local', 'pipeline-status', `${documentId}.json`)
}

async function writeStatus(documentId: string, update: object) {
  const p = statusPath(documentId)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(update, null, 2), 'utf-8')
}

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, documentId } = body ?? {}
  if (!manufacturerId || !documentId) {
    return NextResponse.json({ error: 'manufacturerId and documentId required' }, { status: 400 })
  }

  const supabase = createStudioServiceClient()
  const { data: doc } = await supabase
    .from('source_documents')
    .select('id, storage_key, document_name, manufacturer_id')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Download PDF from R2
  const tempDir = path.join(repoRoot, '.local', 'pipeline-temp')
  await fs.mkdir(tempDir, { recursive: true })

  const { data: signedUrlData } = await supabase.storage
    .from('source-documents')
    .createSignedUrl(doc.storage_key, 300)

  if (!signedUrlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not get download URL for document' }, { status: 500 })
  }

  const pdfPath = path.join(tempDir, `${documentId}.pdf`)
  const pdfRes = await fetch(signedUrlData.signedUrl)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Failed to download PDF' }, { status: 500 })
  await fs.writeFile(pdfPath, Buffer.from(await pdfRes.arrayBuffer()))

  // Write initial status
  const startedAt = new Date().toISOString()
  await writeStatus(documentId, {
    status: 'running',
    startedAt,
    totalChunks: null,
    totalPages: null,
    completedChunks: [],
    currentChunk: null,
    log: [],
  })

  const pythonExe = path.join(repoRoot, '.venv-docling', 'Scripts', 'python.exe')
  const scriptPath = path.join(repoRoot, 'scripts', 'docling', 'extract_docling_chunked.py')

  // Spawn without blocking — update status file from stdout
  const child = spawn(pythonExe, [scriptPath, '--input', pdfPath, '--chunk-size', '7'], {
    cwd: repoRoot,
    env: process.env as NodeJS.ProcessEnv,
  })

  let outputLines: string[] = []
  let totalPages: number | null = null
  let totalChunks: number | null = null
  let completedChunks: { chunkNo: number; startPage: number; endPage: number }[] = []
  let currentChunk: { chunkNo: number; startPage: number; endPage: number } | null = null

  function parseLine(line: string) {
    outputLines.push(line)

    // "[chunked] PDF has 87 pages, extracting p1-p87, chunk size 7"
    const pagesMatch = /PDF has (\d+) pages.*chunk size (\d+)/.exec(line)
    if (pagesMatch) {
      totalPages = parseInt(pagesMatch[1])
      const chunkSize = parseInt(pagesMatch[2])
      totalChunks = Math.ceil(totalPages / chunkSize)
    }

    // "[chunked] Splitting pages 1-7 -> chunk_01_p001-p007.pdf"
    const splitMatch = /Splitting pages (\d+)-(\d+)/.exec(line)
    if (splitMatch) {
      const startPage = parseInt(splitMatch[1])
      const endPage = parseInt(splitMatch[2])
      // figure out chunk number from completedChunks length + 1
      const chunkNo = completedChunks.length + 1
      currentChunk = { chunkNo, startPage, endPage }
    }

    // "[chunked] Running Docling on chunk 1: ..."
    const runMatch = /Running Docling on chunk (\d+)/.exec(line)
    if (runMatch && currentChunk) {
      currentChunk = { ...currentChunk, chunkNo: parseInt(runMatch[1]) }
    }

    // When we see a new "Splitting pages" line (next chunk), the previous one finished
    if (splitMatch && currentChunk && currentChunk.chunkNo > 1) {
      const prev = completedChunks[completedChunks.length - 1]
      if (!prev || prev.chunkNo !== currentChunk.chunkNo - 1) {
        // previous chunk just completed — it's already in completedChunks via the merge step below
      }
    }

    // "Merge complete" means all chunks are done
    if (line.includes('Merge complete')) {
      if (currentChunk) completedChunks.push(currentChunk)
      currentChunk = null
    }

    writeStatus(documentId, {
      status: 'running',
      startedAt,
      totalChunks,
      totalPages,
      completedChunks,
      currentChunk,
      log: outputLines.slice(-40),
    }).catch(() => {})
  }

  // Track when a chunk finishes: next "Splitting" line means previous chunk is done
  let pendingChunk: { chunkNo: number; startPage: number; endPage: number } | null = null

  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString()
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      outputLines.push(trimmed)

      const pagesMatch = /PDF has (\d+) pages.*chunk size (\d+)/.exec(trimmed)
      if (pagesMatch) {
        totalPages = parseInt(pagesMatch[1])
        const chunkSize = parseInt(pagesMatch[2])
        totalChunks = Math.ceil(totalPages / chunkSize)
      }

      const splitMatch = /Splitting pages (\d+)-(\d+)/.exec(trimmed)
      if (splitMatch) {
        // Previous pending chunk is now complete
        if (pendingChunk) completedChunks.push(pendingChunk)
        pendingChunk = {
          chunkNo: completedChunks.length + 1,
          startPage: parseInt(splitMatch[1]),
          endPage: parseInt(splitMatch[2]),
        }
        currentChunk = pendingChunk
      }

      if (trimmed.includes('Merge complete') || trimmed.includes('Merge complete')) {
        if (pendingChunk) { completedChunks.push(pendingChunk); pendingChunk = null }
        currentChunk = null
      }

      writeStatus(documentId, {
        status: 'running',
        startedAt,
        totalChunks,
        totalPages,
        completedChunks: [...completedChunks],
        currentChunk,
        log: outputLines.slice(-40),
      }).catch(() => {})
    }
  })

  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString()
    for (const line of text.split('\n')) {
      if (line.trim()) outputLines.push(`[stderr] ${line.trim()}`)
    }
    writeStatus(documentId, {
      status: 'running', startedAt, totalChunks, totalPages,
      completedChunks: [...completedChunks], currentChunk, log: outputLines.slice(-40),
    }).catch(() => {})
  })

  child.on('close', async (code) => {
    if (pendingChunk) completedChunks.push(pendingChunk)

    if (code !== 0) {
      await writeStatus(documentId, {
        status: 'error',
        startedAt,
        completedAt: new Date().toISOString(),
        totalChunks,
        totalPages,
        completedChunks,
        currentChunk: null,
        log: outputLines.slice(-60),
        error: `Docling exited with code ${code}`,
      })
      return
    }

    // Find output dir (most recent _chunked_ folder for this file stem)
    const stem = path.basename(pdfPath, '.pdf')
    const doclingOutputDir = path.join(repoRoot, '.local', 'docling-output')
    const entries = await fs.readdir(doclingOutputDir).catch(() => [] as string[])
    const matchDirs = entries.filter(e => e.startsWith(stem + '_chunked')).sort().reverse()
    const outputDir = matchDirs[0] ? path.join(doclingOutputDir, matchDirs[0]) : null

    if (!outputDir) {
      await writeStatus(documentId, { status: 'error', error: 'Output dir not found', log: outputLines.slice(-60), startedAt, completedAt: new Date().toISOString(), totalChunks, totalPages, completedChunks, currentChunk: null })
      return
    }

    const outputMd = path.join(outputDir, 'output.md')
    const mdContent = await fs.readFile(outputMd, 'utf-8').catch(() => '')

    // Parse per-chunk detail
    const chunks: { index: number; startPage: number; endPage: number; charCount: number; status: 'ok' | 'empty' | 'short' }[] = []
    for (const section of mdContent.split(/(?=<!-- chunk \d+: pages \d+-\d+ -->)/)) {
      const match = /<!-- chunk (\d+): pages (\d+)-(\d+) -->/.exec(section)
      if (!match) continue
      const body = section.replace(/<!-- chunk \d+: pages \d+-\d+ -->/, '').trim()
      const charCount = body.length
      chunks.push({
        index: parseInt(match[1]),
        startPage: parseInt(match[2]),
        endPage: parseInt(match[3]),
        charCount,
        status: charCount === 0 ? 'empty' : charCount < 200 ? 'short' : 'ok',
      })
    }

    const chunkCount = chunks.length
    const pageCount = chunks.length > 0 ? chunks[chunks.length - 1].endPage : 0
    const failedChunks = chunks.filter(c => c.status !== 'ok')

    // Save to index
    const indexPath = path.join(repoRoot, '.local', 'docling-index.json')
    let index: Record<string, any> = {}
    try { index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) } catch {}
    index[documentId] = { outputDir, outputMdPath: outputMd, chunkCount, pageCount, chunks, extractedAt: new Date().toISOString() }
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')

    supabase.from('source_documents').update({ status: 'extracted' } as any).eq('id', documentId).then(() => {})

    await writeStatus(documentId, {
      status: 'done',
      startedAt,
      completedAt: new Date().toISOString(),
      totalChunks: chunkCount,
      totalPages: pageCount,
      completedChunks: chunks.map(c => ({ chunkNo: c.index, startPage: c.startPage, endPage: c.endPage })),
      currentChunk: null,
      chunks,
      failedChunks,
      outputDir,
      log: outputLines.slice(-60),
    })
  })

  // Return immediately — client will poll for status
  return NextResponse.json({ ok: true, jobStarted: true, documentId })
}
