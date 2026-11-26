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
  if (!session.profile) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, manufacturerName, stagedSystemId, sourceDocumentId, dryRun, includeIdentity } = body ?? {}
  if (!manufacturerId || !stagedSystemId) {
    return NextResponse.json({ error: 'manufacturerId and stagedSystemId required' }, { status: 400 })
  }

  const isAdmin = session.globalRole === 'buildquote_admin'
  const isMember =
    session.globalRole === 'manufacturer_user' &&
    session.memberships.some((m) => m.manufacturerId === manufacturerId && m.status === 'active')
  if (!isAdmin && !isMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createStudioServiceClient()

  // Resolve exact system_name so both parsers enforce strict single-product isolation
  const { data: sysRow } = await supabase
    .from('staged_systems')
    .select('name, source_document_id')
    .eq('id', stagedSystemId)
    .maybeSingle()
  const systemName = (sysRow as { name?: string | null; source_document_id?: string | null } | null)?.name ?? ''

  // Collect ALL linked source_document_ids (system_sources + legacy source_document_id)
  const docIdSet = new Set<string>()
  if (sourceDocumentId) docIdSet.add(String(sourceDocumentId))
  if ((sysRow as { source_document_id?: string | null } | null)?.source_document_id) {
    docIdSet.add(String((sysRow as { source_document_id?: string | null }).source_document_id))
  }
  const { data: linkedSources } = await supabase
    .from('system_sources')
    .select('source_document_id')
    .eq('staged_system_id', stagedSystemId)
    .not('source_document_id', 'is', null)
  for (const s of (linkedSources ?? []) as { source_document_id: string | null }[]) {
    if (s.source_document_id) docIdSet.add(s.source_document_id)
  }

  const candidateDocIds = Array.from(docIdSet)
  if (candidateDocIds.length === 0) {
    return NextResponse.json(
      { error: 'No source documents linked to this system yet. Add PDFs or run Auto-Fill in Setup first.' },
      { status: 400 },
    )
  }

  // Keep only documents that actually have document_chunks ready
  const readyDocIds: string[] = []
  for (const docId of candidateDocIds) {
    const { count } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', docId)
    if (count && count > 0) readyDocIds.push(docId)
  }

  if (readyDocIds.length === 0) {
    return NextResponse.json(
      { error: 'No document_chunks found for the linked documents yet. Wait for PDF extraction to finish first.' },
      { status: 400 },
    )
  }

  const shouldRunIdentity = includeIdentity !== false
  const jobsToInsert: Array<Record<string, unknown>> = []
  for (const docId of readyDocIds) {
    const payload = {
      manufacturer_id: manufacturerId,
      manufacturer_name: manufacturerName ?? '',
      staged_system_id: stagedSystemId,
      source_document_id: docId,
      system_name: systemName,
      dry_run: dryRun ?? false,
    }
    if (shouldRunIdentity) {
      jobsToInsert.push({
        manufacturer_id: manufacturerId,
        document_id: docId,
        job_type: 'system_identity_parser',
        status: 'pending',
        payload,
      })
    }
    jobsToInsert.push({
      manufacturer_id: manufacturerId,
      document_id: docId,
      job_type: 'knowledge_parser',
      status: 'pending',
      payload,
    })
  }

  const { data: jobs, error } = await supabase
    .from('pipeline_jobs')
    .insert(jobsToInsert)
    .select('id')

  if (error || !jobs || jobs.length === 0) {
    if (/pipeline_jobs|does not exist/i.test(error?.message ?? '')) {
      return NextResponse.json({ error: 'Pipeline jobs table not available in this environment.' }, { status: 500 })
    }
    return NextResponse.json({ error: `Failed to enqueue job: ${error?.message}` }, { status: 500 })
  }

  const jobIds = (jobs as { id: string }[]).map((j) => j.id)
  return NextResponse.json({
    ok: true,
    jobStarted: true,
    jobId: jobIds[0],
    jobIds,
    documentsQueued: readyDocIds.length,
  })
}
