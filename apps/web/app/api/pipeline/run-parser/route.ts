import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

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

  const supabase = createStudioServiceClient()

  // Verify docling completed for this document
  const { data: doclingJob } = await supabase
    .from('pipeline_jobs')
    .select('id, result')
    .eq('document_id', documentId)
    .eq('job_type', 'docling')
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!doclingJob) {
    return NextResponse.json({ error: 'Docling has not completed for this document. Run Docling first.' }, { status: 400 })
  }

  const doclingResult = (doclingJob.result as any) ?? {}
  const outputDir = doclingResult.outputDir
  if (!outputDir) {
    return NextResponse.json({ error: 'Docling result has no outputDir. Re-run Docling.' }, { status: 400 })
  }

  // Enqueue parser job
  const { data: job, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: documentId,
      job_type: 'parser',
      status: 'pending',
      payload: {
        manufacturer_id: manufacturerId,
        manufacturer_name: manufacturerName,
        slug,
        document_id: documentId,
        output_dir: outputDir,
        target_system_id: targetSystemId ?? null,
        dry_run: dryRun ?? false,
      },
    })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: `Failed to enqueue job: ${error?.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobStarted: true, jobId: job.id })
}
