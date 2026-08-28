import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

// Admin-triggerable enqueue for the system-identity parser (design doc
// addendum 3 §C3/§C4) — mirrors /api/pipeline/run-knowledge-parser exactly.
// The manufacturer self-serve path is /api/manufacturer/systems/[systemId]/
// initiate-extraction, which enqueues Docling with auto_chain: true and lets
// the worker chain into both this job type and knowledge_parser — this
// route exists alongside it for admin/staff manual re-runs, same as every
// other pipeline stage.

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, manufacturerName, stagedSystemId, systemName, sourceDocumentId, dryRun } = body ?? {}
  if (!manufacturerId || !stagedSystemId || !systemName || !sourceDocumentId) {
    return NextResponse.json(
      { error: 'manufacturerId, stagedSystemId, systemName, sourceDocumentId required' },
      { status: 400 },
    )
  }

  const supabase = createStudioServiceClient()

  const { count, error: chunksError } = await supabase
    .from('document_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source_document_id', sourceDocumentId)

  if (chunksError) {
    return NextResponse.json({ error: `Could not check document_chunks: ${chunksError.message}` }, { status: 500 })
  }
  if (!count) {
    return NextResponse.json(
      { error: 'No document_chunks found for this document yet. Run Docling first.' },
      { status: 400 },
    )
  }

  const { data: job, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: sourceDocumentId,
      job_type: 'system_identity_parser',
      status: 'pending',
      payload: {
        manufacturer_id: manufacturerId,
        manufacturer_name: manufacturerName ?? '',
        staged_system_id: stagedSystemId,
        system_name: systemName,
        source_document_id: sourceDocumentId,
        dry_run: dryRun ?? false,
      },
    })
    .select('id')
    .single()

  if (error || !job) {
    if (/pipeline_jobs|does not exist/i.test(error?.message ?? '')) {
      return NextResponse.json({ error: 'Pipeline jobs table not available in this environment.' }, { status: 500 })
    }
    return NextResponse.json({ error: `Failed to enqueue job: ${error?.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobStarted: true, jobId: job.id })
}
