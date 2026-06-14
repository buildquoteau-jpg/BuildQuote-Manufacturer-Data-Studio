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

  const { data: job } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .eq('document_id', documentId)
    .eq('job_type', 'parser')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) return NextResponse.json({ status: 'idle' })

  const result = (job.result as any) ?? {}
  const progress = (job.progress as any) ?? {}

  return NextResponse.json({
    status: job.status,
    jobId: job.id,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    error: job.error_message,
    currentStage: progress.currentStage ?? null,
    log: job.log_lines ?? [],
    systemCount: result.systemCount ?? 0,
    profileCount: result.profileCount ?? 0,
    componentCount: result.componentCount ?? 0,
  })
}
