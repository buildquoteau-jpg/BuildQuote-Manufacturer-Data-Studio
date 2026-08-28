// Self-serve "Set up my System Card" (design doc addendum 3 §C4/§C5 step 4).
//
// The manufacturer has already: named the system, uploaded up to 10 photos,
// added links/resources, and linked this system's source documents (via
// system_sources — see document-actions.ts's linkDocumentToSystem). This
// route is the single button that turns those documents into System Card
// fields + the comprehensive knowledge object, entirely unattended:
//
//   for each linked, chunkable document on this system:
//     - already has document_chunks? -> enqueue system_identity_parser +
//       knowledge_parser directly (chunks already exist, no need to re-run
//       Docling)
//     - not yet chunked, but has a stored file? -> enqueue docling with
//       auto_chain: true, staged_system_id + system_name + manufacturer_id/
//       name in its payload — pipeline_worker.py's handle_docling reads
//       those and enqueues both parser jobs itself once chunking succeeds
//     - not yet fetched (URL source still pending_fetch)? -> skipped, noted
//       in the response; nothing to extract from yet
//
// No staff approval step — matches the user's explicit "manufacturer
// self-serve, no admin needed" decision. The guardrail below is the only
// gate: refuse (not silently no-op) if this system already has a pipeline
// job in flight.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same chunkable-role list as add-source-url/route.ts — 'website' is a plain
// link, never a document to extract facts from.
const CHUNKABLE_ROLES = ['install_guide', 'design_guide', 'tech_data', 'source_catalogue']

export async function POST(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  if (!UUID_RE.test(systemId)) {
    return NextResponse.json({ error: 'Invalid system id.' }, { status: 400 })
  }

  const session = await getStudioSession()
  if (!session.profile || !session.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { manufacturerId?: string; dryRun?: boolean } | null
  const manufacturerId = body?.manufacturerId
  const dryRun = body?.dryRun === true
  if (!manufacturerId || !UUID_RE.test(manufacturerId)) {
    return NextResponse.json({ error: 'manufacturerId is required.' }, { status: 400 })
  }

  if (session.globalRole !== 'buildquote_admin') {
    if (session.globalRole !== 'manufacturer_user') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }
    const hasMembership = session.memberships.some(
      (m) => m.manufacturerId === manufacturerId && m.status === 'active',
    )
    if (!hasMembership) {
      return NextResponse.json({ error: 'Not a member of this workspace.' }, { status: 403 })
    }
  }

  let supabase: ReturnType<typeof createStudioServiceClient>
  try {
    supabase = createStudioServiceClient()
  } catch {
    return NextResponse.json({ error: 'Service role not configured.' }, { status: 500 })
  }

  const { data: system, error: sysErr } = await supabase
    .from('staged_systems')
    .select('id, name')
    .eq('id', systemId)
    .eq('manufacturer_id', manufacturerId)
    .maybeSingle()

  if (sysErr && /does not exist|42P01|42703/i.test(sysErr.message)) {
    return NextResponse.json({ error: 'Migration for staged_systems not applied yet.' }, { status: 500 })
  }
  if (!system) {
    return NextResponse.json({ error: 'System not found in this workspace.' }, { status: 404 })
  }
  const systemName = (system as { name: string | null }).name ?? ''

  const { data: mfr } = await supabase
    .from('data_studio_manufacturers')
    .select('name')
    .eq('id', manufacturerId)
    .maybeSingle()
  const manufacturerName = (mfr as { name: string | null } | null)?.name ?? ''

  // Guardrail: refuse if a job for this system is already pending/running —
  // never a silent no-op (design doc's explicit requirement).
  const { data: inFlight, error: inFlightErr } = await supabase
    .from('pipeline_jobs')
    .select('id, job_type, status')
    .eq('manufacturer_id', manufacturerId)
    .in('status', ['pending', 'running'])
    .filter('payload->>staged_system_id', 'eq', systemId)
    .limit(1)

  if (inFlightErr && /does not exist|42P01|42703/i.test(inFlightErr.message)) {
    return NextResponse.json({ error: 'Pipeline jobs table not available in this environment.' }, { status: 500 })
  }
  if (inFlight && inFlight.length > 0) {
    return NextResponse.json(
      { error: 'Extraction is already in progress for this system. Please wait for it to finish.' },
      { status: 409 },
    )
  }

  // Every document linked to this system, joined to its file/status.
  const { data: sources, error: sourcesErr } = await supabase
    .from('system_sources')
    .select('id, role, source_document_id, source_documents(id, storage_key, document_name, status)')
    .eq('manufacturer_id', manufacturerId)
    .eq('staged_system_id', systemId)

  if (sourcesErr) {
    if (/system_sources|does not exist|42P01|42703/i.test(sourcesErr.message)) {
      return NextResponse.json(
        { error: 'Document linking needs migration 051 applied to this project first.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: sourcesErr.message }, { status: 500 })
  }

  type SourceDoc = { id: string; storage_key: string | null; document_name: string | null; status: string | null }
  type SourceRow = { id: string; role: string; source_document_id: string | null; source_documents: SourceDoc | SourceDoc[] | null }

  const chunkableDocs = ((sources ?? []) as unknown as SourceRow[])
    .filter((r) => CHUNKABLE_ROLES.includes(r.role) && r.source_document_id)
    .map((r) => ({
      documentId: r.source_document_id as string,
      doc: Array.isArray(r.source_documents) ? r.source_documents[0] : r.source_documents,
    }))
    .filter((r) => r.doc)

  if (chunkableDocs.length === 0) {
    return NextResponse.json(
      { error: 'No source documents linked to this system yet. Upload or link a document first.' },
      { status: 400 },
    )
  }

  const enqueuedJobIds: string[] = []
  const skipped: { documentId: string; reason: string }[] = []

  for (const { documentId, doc } of chunkableDocs) {
    const { count: chunkCount } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', documentId)

    const chainPayload = {
      manufacturer_id: manufacturerId,
      manufacturer_name: manufacturerName,
      staged_system_id: systemId,
      source_document_id: documentId,
      dry_run: dryRun,
    }

    if (chunkCount && chunkCount > 0) {
      // Already chunked (a prior extraction ran on this document) — go
      // straight to both parser passes, no need to re-run Docling.
      const { data: rows, error } = await supabase
        .from('pipeline_jobs')
        .insert([
          {
            manufacturer_id: manufacturerId,
            document_id: documentId,
            job_type: 'system_identity_parser',
            status: 'pending',
            payload: { ...chainPayload, system_name: systemName },
          },
          {
            manufacturer_id: manufacturerId,
            document_id: documentId,
            job_type: 'knowledge_parser',
            status: 'pending',
            payload: chainPayload,
          },
        ])
        .select('id')
      if (error) {
        skipped.push({ documentId, reason: `Failed to enqueue parser jobs: ${error.message}` })
        continue
      }
      for (const r of (rows ?? []) as { id: string }[]) enqueuedJobIds.push(r.id)
      continue
    }

    if (!doc?.storage_key) {
      skipped.push({ documentId, reason: doc?.status === 'pending_fetch' ? 'Still being fetched from its URL.' : 'No file stored yet.' })
      continue
    }

    // Not yet chunked — enqueue Docling with auto_chain so the worker
    // enqueues both parser jobs itself once chunks exist (pipeline_worker.py
    // handle_docling's auto_chain block).
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
          auto_chain: true,
          manufacturer_name: manufacturerName,
          staged_system_id: systemId,
          system_name: systemName,
          dry_run: dryRun,
        },
      })
      .select('id')
      .single()

    if (error || !job) {
      skipped.push({ documentId, reason: `Failed to enqueue extraction: ${error?.message ?? 'unknown'}` })
      continue
    }
    enqueuedJobIds.push((job as { id: string }).id)
  }

  if (enqueuedJobIds.length === 0) {
    return NextResponse.json(
      { error: 'Nothing could be enqueued — every linked document is still pending or failed.', skipped },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true, jobStarted: true, jobIds: enqueuedJobIds, skipped })
}
