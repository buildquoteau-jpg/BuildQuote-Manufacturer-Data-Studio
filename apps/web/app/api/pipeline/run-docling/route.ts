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
  const { manufacturerId, documentId } = body ?? {}
  if (!manufacturerId || !documentId) {
    return NextResponse.json({ error: 'manufacturerId and documentId required' }, { status: 400 })
  }

  const supabase = await createStudioServiceClient()
  const { data: doc } = await supabase
    .from('source_documents')
    .select('id, storage_key, document_name, manufacturer_id')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Download the PDF from R2 to a temp location
  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const tempDir = path.join(repoRoot, '.local', 'pipeline-temp')
  await fs.mkdir(tempDir, { recursive: true })

  // Get a signed URL from Supabase storage (assuming R2 via supabase storage integration)
  const { data: signedUrl } = await supabase.storage
    .from('source-documents')
    .createSignedUrl(doc.storage_key, 300)

  if (!signedUrl?.signedUrl) {
    return NextResponse.json({ error: 'Could not get download URL for document' }, { status: 500 })
  }

  // Download the PDF
  const pdfPath = path.join(tempDir, `${documentId}.pdf`)
  const response = await fetch(signedUrl.signedUrl)
  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to download PDF from storage' }, { status: 500 })
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(pdfPath, buffer)

  // Run Docling chunked extraction
  const pythonExe = path.join(repoRoot, '.venv-docling', 'Scripts', 'python.exe')
  const scriptPath = path.join(repoRoot, 'scripts', 'docling', 'extract_docling_chunked.py')

  try {
    await execFileAsync(pythonExe, [scriptPath, '--input', pdfPath, '--chunk-size', '7'], {
      cwd: repoRoot,
      timeout: 600_000, // 10 minutes
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Docling failed: ${err.message}` }, { status: 500 })
  }

  // Find the output directory (most recent _chunked_ folder for this file stem)
  const stem = path.basename(pdfPath, '.pdf')
  const doclingOutputDir = path.join(repoRoot, '.local', 'docling-output')
  const entries = await fs.readdir(doclingOutputDir).catch(() => [] as string[])
  const matchDirs = entries
    .filter(e => e.startsWith(stem + '_chunked_'))
    .sort()
    .reverse()
  const outputDir = matchDirs[0] ? path.join(doclingOutputDir, matchDirs[0]) : null

  if (!outputDir) {
    return NextResponse.json({ error: 'Docling output not found after extraction' }, { status: 500 })
  }

  const outputMd = path.join(outputDir, 'output.md')
  const mdContent = await fs.readFile(outputMd, 'utf-8').catch(() => '')

  // Count chunks from markers
  const chunkMatches = mdContent.match(/<!-- chunk \d+:/g) ?? []
  const chunkCount = chunkMatches.length
  const pageMatches = mdContent.match(/pages (\d+)-(\d+)/g) ?? []
  const pageCount = pageMatches.length > 0
    ? parseInt(pageMatches[pageMatches.length - 1].split('-')[1])
    : 0

  // Store output path in a sidecar index file for the parser to pick up
  const indexPath = path.join(repoRoot, '.local', 'docling-index.json')
  let index: Record<string, any> = {}
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) } catch {}
  index[documentId] = { outputDir, outputMdPath: outputMd, chunkCount, pageCount, extractedAt: new Date().toISOString() }
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')

  // Update document status
  await supabase
    .from('source_documents')
    .update({ status: 'extracted' } as any)
    .eq('id', documentId)

  return NextResponse.json({
    ok: true,
    outputDir,
    outputMdPath: outputMd,
    chunkCount,
    pageCount,
    preview: mdContent.slice(0, 800),
  })
}
