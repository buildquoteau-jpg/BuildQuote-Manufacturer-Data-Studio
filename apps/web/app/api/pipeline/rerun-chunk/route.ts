import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

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

  const supabase = createStudioServiceClient()

  // Find the completed docling job to get the output dir
  const { data: doclingJob } = await supabase
    .from('pipeline_jobs')
    .select('result')
    .eq('document_id', documentId)
    .eq('job_type', 'docling')
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const outputDir = (doclingJob?.result as any)?.outputDir
  if (!outputDir) {
    return NextResponse.json({ error: 'Run full Docling first before re-running a chunk' }, { status: 400 })
  }

  const { data: job, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: documentId,
      job_type: 'rerun_chunk',
      status: 'pending',
      payload: {
        manufacturer_id: manufacturerId,
        document_id: documentId,
        output_dir: outputDir,
        start_page: startPage,
        end_page: endPage,
        chunk_index: chunkIndex,
      },
    })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: `Failed to enqueue job: ${error?.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobId: job.id })
}
