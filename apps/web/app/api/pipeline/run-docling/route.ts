import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

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

  const supabase = createStudioServiceClient()

  // Verify document belongs to this manufacturer
  const { data: doc } = await supabase
    .from('source_documents')
    .select('id, storage_key, document_name')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Cancel any existing pending/running docling job for this document
  await supabase
    .from('pipeline_jobs')
    .update({ status: 'cancelled' } as any)
    .eq('document_id', documentId)
    .eq('job_type', 'docling')
    .in('status', ['pending', 'running'])

  // Enqueue new job
  const { data: job, error } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: documentId,
      job_type: 'docling',
      status: 'pending',
      payload: {
        document_id: documentId,
        manufacturer_id: manufacturerId,
        storage_key: doc.storage_key,
        document_name: doc.document_name,
        chunk_size: 7,
      },
    })
    .select('id')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: `Failed to enqueue job: ${error?.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobStarted: true, jobId: job.id, documentId })
}
