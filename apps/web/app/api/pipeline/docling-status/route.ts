import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const documentId = req.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

  const supabase = createStudioServiceClient()

  // Get the most recent docling job for this document
  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .eq('document_id', documentId)
    .eq('job_type', 'docling')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) return NextResponse.json({ status: 'idle' })

  const progress = (job.progress as any) ?? {}
  const result = (job.result as any) ?? {}

  return NextResponse.json({
    status: job.status,
    jobId: job.id,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    error: job.error_message,
    // live progress fields (written by worker during run)
    totalChunks: progress.totalChunks ?? null,
    totalPages: progress.totalPages ?? null,
    completedChunks: progress.completedChunks ?? [],
    currentChunk: progress.currentChunk ?? null,
    log: job.log_lines ?? [],
    // final result fields (written by worker on completion)
    chunks: result.chunks ?? [],
    failedChunks: result.failedChunks ?? [],
    outputDir: result.outputDir ?? null,
  })
}
