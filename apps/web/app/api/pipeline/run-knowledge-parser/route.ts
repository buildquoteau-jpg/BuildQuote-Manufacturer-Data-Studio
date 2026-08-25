import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

// Enqueues the second parser pass (design doc §7/§14 step 7) — installation
// methods, fixing requirements, applications, limitations, performance
// claims, standards, certifications — over a source document's already-
// ingested document_chunks. Same shape as /api/pipeline/run-parser, one
// precondition swapped: instead of a completed docling pipeline_jobs row,
// this checks document_chunks actually exist for the document (what
// run_knowledge_parser.py reads from).

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, manufacturerName, stagedSystemId, sourceDocumentId, dryRun } = body ?? {}
  if (!manufacturerId || !stagedSystemId || !sourceDocumentId) {
    return NextResponse.json({ error: 'manufacturerId, stagedSystemId, sourceDocumentId required' }, { status: 400 })
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
      { error: 'No document_chunks found for this document yet. Run Docling first (the catalogue parser pipeline).' },
      { status: 400 },
    )
  }

  const { data: job, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: sourceDocumentId,
      job_type: 'knowledge_parser',
      status: 'pending',
      payload: {
        manufacturer_id: manufacturerId,
        manufacturer_name: manufacturerName ?? '',
        staged_system_id: stagedSystemId,
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
