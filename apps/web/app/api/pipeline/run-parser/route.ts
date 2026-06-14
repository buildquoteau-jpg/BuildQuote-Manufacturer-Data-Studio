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
  const { manufacturerId, manufacturerName, slug, documentId, targetSystemId, dryRun } = body ?? {}
  if (!manufacturerId || !manufacturerName || !slug || !documentId) {
    return NextResponse.json({ error: 'manufacturerId, manufacturerName, slug, documentId required' }, { status: 400 })
  }

  const supabase = await createStudioServiceClient()
  const repoRoot = path.resolve(process.cwd(), '..', '..')

  // Find docling output path from sidecar index
  const indexPath = path.join(repoRoot, '.local', 'docling-index.json')
  let index: Record<string, any> = {}
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf-8')) } catch {}
  const outputDir = index[documentId]?.outputDir
  if (!outputDir) {
    return NextResponse.json({ error: 'Docling output not found for this document. Run Docling first.' }, { status: 400 })
  }

  const outputMd = path.join(outputDir, 'output.md')
  const hintsPath = path.join(repoRoot, 'prompts', 'manufacturer-hints', `${slug}.md`)

  const hintsExist = await fs.access(hintsPath).then(() => true).catch(() => false)
  if (!hintsExist) {
    return NextResponse.json({ error: `Hints file not found at ${hintsPath}. Generate or create it first.` }, { status: 400 })
  }

  const pythonExe = path.join(repoRoot, 'scripts', 'parser', 'venv', 'Scripts', 'python.exe')
  const pythonFallback = 'python'
  const scriptPath = path.join(repoRoot, 'scripts', 'parser', 'run_parser.py')

  const args = [
    scriptPath,
    '--input', outputMd,
    '--manufacturer-id', manufacturerId,
    '--manufacturer-name', manufacturerName,
    '--hints', hintsPath,
  ]

  if (targetSystemId) {
    args.push('--target-system-id', targetSystemId)
  }

  if (dryRun) {
    args.push('--dry-run')
  }

  let stdout = ''
  let stderr = ''

  try {
    const python = await fs.access(pythonExe).then(() => pythonExe).catch(() => pythonFallback)
    const result = await execFileAsync(python, args, {
      cwd: repoRoot,
      timeout: 900_000, // 15 minutes
      env: { ...process.env },
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (err: any) {
    return NextResponse.json({
      error: `Parser failed: ${err.message}`,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }, { status: 500 })
  }

  // Read counts from staging tables
  const { data: sysList } = await supabase.from('staged_systems').select('id').eq('manufacturer_id', manufacturerId)
  const sysIds = sysList?.map(s => s.id) ?? []
  const [
    { count: systemCount },
    { count: profileCount },
    { count: componentCount },
  ] = await Promise.all([
    supabase.from('staged_systems').select('*', { count: 'exact', head: true }).eq('manufacturer_id', manufacturerId),
    sysIds.length > 0
      ? supabase.from('staged_system_profiles').select('*', { count: 'exact', head: true }).in('staged_system_id', sysIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('staged_components').select('*', { count: 'exact', head: true }).eq('manufacturer_id', manufacturerId),
  ])

  await supabase
    .from('source_documents')
    .update({ status: dryRun ? 'extracted' : 'parsed' } as any)
    .eq('id', documentId)

  return NextResponse.json({
    ok: true,
    systemCount: systemCount ?? 0,
    profileCount: profileCount ?? 0,
    componentCount: componentCount ?? 0,
    stdout: stdout.slice(-2000),
    dryRun: !!dryRun,
  })
}
