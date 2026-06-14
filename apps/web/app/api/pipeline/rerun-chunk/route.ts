import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execFileAsync = promisify(execFile)

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, documentId, startPage, endPage, chunkIndex } = body ?? {}
  if (!manufacturerId || !documentId || !startPage || !endPage) {
    return NextResponse.json({ error: 'manufacturerId, documentId, startPage, endPage required' }, { status: 400 })
  }

  const supabase = await createStudioServiceClient()
  const { data: doc } = await supabase
    .from('source_documents')
    .select('id, storage_key')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const repoRoot = path.resolve(process.cwd(), '..', '..')

  // Read index to find existing output dir and PDF
  const indexPath = path.join(repoRoot, '.local', 'docling-index.json')
  let index: Record<string, any> = {}
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) } catch {}

  const outputDir = index[documentId]?.outputDir
  if (!outputDir) return NextResponse.json({ error: 'Run full Docling first before re-running a chunk' }, { status: 400 })

  const pdfPath = path.join(repoRoot, '.local', 'pipeline-temp', `${documentId}.pdf`)
  const pdfExists = await fs.access(pdfPath).then(() => true).catch(() => false)
  if (!pdfExists) {
    // Re-download
    const { data: signedUrl } = await supabase.storage.from('source-documents').createSignedUrl(doc.storage_key, 300)
    if (!signedUrl?.signedUrl) return NextResponse.json({ error: 'Could not get download URL' }, { status: 500 })
    const response = await fetch(signedUrl.signedUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.mkdir(path.dirname(pdfPath), { recursive: true })
    await fs.writeFile(pdfPath, buffer)
  }

  // Run single-chunk extraction with page range
  const pythonExe = path.join(repoRoot, '.venv-docling', 'Scripts', 'python.exe')
  const scriptPath = path.join(repoRoot, 'scripts', 'docling', 'extract_docling.py')

  const chunkOutputPath = path.join(outputDir, `chunk_rerun_${chunkIndex ?? startPage}.md`)

  try {
    await execFileAsync(pythonExe, [
      scriptPath,
      '--input', pdfPath,
      '--start-page', String(startPage),
      '--end-page', String(endPage),
      '--output', chunkOutputPath,
    ], {
      cwd: repoRoot,
      timeout: 300_000,
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Docling re-run failed: ${err.message}` }, { status: 500 })
  }

  const rerunContent = await fs.readFile(chunkOutputPath, 'utf-8').catch(() => '')
  const charCount = rerunContent.trim().length
  const status = charCount === 0 ? 'empty' : charCount < 200 ? 'short' : 'ok'

  // Patch the main output.md — replace the old chunk section with the new content
  const outputMd = path.join(outputDir, 'output.md')
  const existing = await fs.readFile(outputMd, 'utf-8').catch(() => '')

  // Replace the matching chunk block in output.md
  const chunkMarker = `<!-- chunk ${chunkIndex}: pages ${startPage}-${endPage} -->`
  const nextChunkPattern = /<!-- chunk \d+: pages \d+-\d+ -->/
  const markerIdx = existing.indexOf(chunkMarker)
  if (markerIdx !== -1) {
    const afterMarker = existing.slice(markerIdx + chunkMarker.length)
    const nextMatch = nextChunkPattern.exec(afterMarker)
    const chunkEnd = nextMatch ? markerIdx + chunkMarker.length + nextMatch.index : existing.length
    const patched = existing.slice(0, markerIdx) + chunkMarker + '\n' + rerunContent + '\n' + existing.slice(chunkEnd)
    await fs.writeFile(outputMd, patched, 'utf-8')
  }

  return NextResponse.json({
    ok: true,
    chunkIndex,
    startPage,
    endPage,
    charCount,
    status,
    preview: rerunContent.slice(0, 400),
  })
}
