// URL ingestion — register a document from a URL instead of download+reupload.
//
// Thin enqueue endpoint (see docs/sourced-system-card-architecture.md §4):
//   1. validate URL + auth/membership
//   2. insert a source_documents row (ingest_kind='url_fetch', status='pending_fetch')
//   3. optionally insert a system_sources row (when stagedSystemId + role given) —
//      the url is the card's LIVE LINK immediately; source_document_id links now,
//      ingested content fills in after the worker runs
//   4. enqueue a `fetch_url` pipeline job — the worker fetches the PDF to R2 and
//      (for PDF roles) chains into docling. No bytes ever flow through this route.
//
// Auth mirrors register-document: buildquote_admin, or a manufacturer_user with
// an active membership for the workspace.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { manufacturerMembershipError } from '@/lib/studio-auth/route-guards'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const SYSTEM_SOURCE_ROLES = [
  'install_guide',
  'design_guide',
  'website',
  'tech_data',
  'source_catalogue',
] as const
type SystemSourceRole = (typeof SYSTEM_SOURCE_ROLES)[number]

// Roles whose content is a PDF we want chunked into the container. `website`
// is link-only by default (rendered on the card, not fetched for parsing).
const CHUNKABLE_ROLES: SystemSourceRole[] = [
  'install_guide',
  'design_guide',
  'tech_data',
  'source_catalogue',
]

function deriveDocumentName(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    const base = (last ?? u.hostname).replace(/\.[^.]+$/, '')
    return decodeURIComponent(base).slice(0, 200) || u.hostname
  } catch {
    return url.slice(0, 200)
  }
}

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (!session.profile || !session.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as {
    manufacturerId?: string
    url?: string
    documentType?: string
    stagedSystemId?: string
    role?: string
    label?: string
  } | null

  const manufacturerId = body?.manufacturerId
  const rawUrl = body?.url?.trim()
  const stagedSystemId = body?.stagedSystemId?.trim() || null
  const label = body?.label?.trim() || null

  if (!manufacturerId || !rawUrl) {
    return NextResponse.json({ error: 'manufacturerId and url are required.' }, { status: 400 })
  }

  // Validate the URL — http(s) only.
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'Enter a valid URL.' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'URL must start with http:// or https://.' }, { status: 400 })
  }

  // Role is required only when attaching to a specific system.
  let role: SystemSourceRole | null = null
  if (stagedSystemId) {
    if (!body?.role || !SYSTEM_SOURCE_ROLES.includes(body.role as SystemSourceRole)) {
      return NextResponse.json(
        { error: `role is required when attaching to a system and must be one of: ${SYSTEM_SOURCE_ROLES.join(', ')}` },
        { status: 400 },
      )
    }
    role = body.role as SystemSourceRole
  }

  // Authz: admin passes; manufacturer_user needs an active membership here.
  const membershipError = manufacturerMembershipError(session, manufacturerId)
  if (membershipError) return membershipError

  let supabase: ReturnType<typeof createStudioServiceClient>
  try {
    supabase = createStudioServiceClient()
  } catch {
    return NextResponse.json({ error: 'Service role not configured.' }, { status: 500 })
  }

  // If attaching to a system, verify it belongs to this manufacturer (prevents
  // cross-tenant linkage).
  if (stagedSystemId) {
    const { data: sys } = await supabase
      .from('staged_systems')
      .select('id')
      .eq('id', stagedSystemId)
      .eq('manufacturer_id', manufacturerId)
      .maybeSingle()
    if (!sys) {
      return NextResponse.json({ error: 'System not found in this workspace.' }, { status: 404 })
    }
  }

  const documentName = deriveDocumentName(rawUrl)

  // 1) Register the source document (no bytes yet — worker fetches to R2).
  const { data: doc, error: docErr } = await supabase
    .from('source_documents')
    .insert({
      manufacturer_id: manufacturerId,
      original_filename: documentName,
      document_name: documentName,
      document_type: body?.documentType ?? (role ?? 'other'),
      storage_provider: 'cloudflare_r2',
      source_url: rawUrl,
      ingest_kind: 'url_fetch',
      status: 'pending_fetch',
      uploaded_by: session.user.id,
    })
    .select('id')
    .single()

  if (docErr || !doc) {
    return NextResponse.json(
      { error: `Failed to register source: ${docErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }
  const documentId = (doc as { id: string }).id

  // 2) Optionally attach to a system as a typed source (doubles as live link).
  let systemSourceId: string | null = null
  if (stagedSystemId && role) {
    const includeInContainer = CHUNKABLE_ROLES.includes(role)
    const { data: srcRow, error: srcErr } = await supabase
      .from('system_sources')
      .upsert(
        {
          manufacturer_id: manufacturerId,
          staged_system_id: stagedSystemId,
          role,
          label,
          url: rawUrl,
          source_document_id: documentId,
          ingest_status: 'queued',
          include_in_container: includeInContainer,
        },
        { onConflict: 'staged_system_id,role,url' },
      )
      .select('id')
      .single()

    if (srcErr) {
      // Non-fatal: the document + fetch job still proceed. Surface for logs.
      console.error('system_sources upsert failed:', srcErr.message)
    } else {
      systemSourceId = (srcRow as { id: string }).id
    }
  }

  // 3) Enqueue the fetch job. Chain into docling for chunkable (PDF) roles, or
  //    for a plain document-library add (no system role).
  const thenDocling = role ? CHUNKABLE_ROLES.includes(role) : true
  const { data: job, error: jobErr } = await supabase
    .from('pipeline_jobs')
    .insert({
      manufacturer_id: manufacturerId,
      document_id: documentId,
      job_type: 'fetch_url',
      status: 'pending',
      payload: {
        document_id: documentId,
        manufacturer_id: manufacturerId,
        source_url: rawUrl,
        system_source_id: systemSourceId,
        then_docling: thenDocling,
        chunk_size: 7,
      },
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json(
      { error: `Registered source but failed to enqueue fetch: ${jobErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    documentId,
    systemSourceId,
    jobId: (job as { id: string }).id,
  })
}
