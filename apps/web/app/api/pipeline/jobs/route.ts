import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

// Live feed for the pipeline funnel (2026-07-18 audit): one endpoint that
// returns every recent pipeline_jobs row for a manufacturer — worker jobs AND
// manual terminal runs reported via scripts/lib/pipeline_report.py (those may
// have manufacturer_id null, e.g. standalone docling runs, so they are
// included when recent). The server timestamp lets the client compute
// "stalled" without trusting the browser clock.
export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')
  if (!manufacturerId) {
    return NextResponse.json({ error: 'manufacturerId required' }, { status: 400 })
  }

  const supabase = createStudioServiceClient()
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  const { data: jobs, error } = await supabase
    .from('pipeline_jobs')
    .select('*')
    .or(`manufacturer_id.eq.${manufacturerId},manufacturer_id.is.null`)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    jobs: (jobs ?? []).map((j: any) => ({
      id: j.id,
      jobType: j.job_type,
      status: j.status,
      createdAt: j.created_at,
      startedAt: j.started_at,
      completedAt: j.completed_at,
      // heartbeat_at arrives with migration 059; null until then and the
      // client falls back to started_at for staleness.
      heartbeatAt: j.heartbeat_at ?? null,
      workerId: j.worker_id,
      documentId: j.document_id,
      progress: j.progress ?? {},
      result: j.result ?? {},
      errorMessage: j.error_message,
      logTail: (j.log_lines ?? []).slice(-15),
    })),
  })
}
