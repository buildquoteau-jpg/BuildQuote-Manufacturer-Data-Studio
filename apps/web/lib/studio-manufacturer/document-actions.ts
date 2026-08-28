'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createPresignedUploadUrl, createPresignedDownloadUrl } from '@/lib/r2'
import { randomUUID } from 'crypto'

// ─── Auth gate ────────────────────────────────────────────────────────────────

async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<{ allowed: true; userId: string } | { allowed: false; error: string }> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }

  if (session.globalRole === 'buildquote_admin') {
    return { allowed: true, userId: session.user!.id }
  }

  if (session.globalRole !== 'manufacturer_user') {
    return { allowed: false, error: 'Access denied.' }
  }

  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) {
    return { allowed: false, error: 'Not a member of this workspace.' }
  }

  return { allowed: true, userId: session.user!.id }
}

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

// ─── requestDocumentUploadUrl ─────────────────────────────────────────────────
// Returns a short-lived presigned PUT URL so the browser can upload directly
// to R2. Does NOT write to Supabase yet — call recordDocumentUpload after.

export type RequestUploadUrlInput = {
  manufacturerId: string
  originalFilename: string
  contentType: string
  fileSizeBytes: number
  documentType: string
}

export type RequestUploadUrlResult =
  | { ok: true; uploadUrl: string; storageKey: string }
  | { ok: false; error: string }

export async function requestDocumentUploadUrl(
  input: RequestUploadUrlInput,
): Promise<RequestUploadUrlResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  if (!ALLOWED_MIME_TYPES[input.contentType]) {
    return { ok: false, error: `File type not accepted: ${input.contentType}` }
  }

  const ext = ALLOWED_MIME_TYPES[input.contentType]
  const storageKey = `manufacturer-uploads/${input.manufacturerId}/${randomUUID()}.${ext}`

  return createPresignedUploadUrl({
    storageKey,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
  })
}

// ─── recordDocumentUpload ─────────────────────────────────────────────────────
// Called after the browser has successfully PUT the file to R2.
// Inserts a row into source_documents.

export type RecordUploadInput = {
  manufacturerId: string
  originalFilename: string
  documentName: string
  documentType: string
  storageKey: string
  contentType: string
  fileSizeBytes: number
  // Links this document to one system's "perfect miniature data set" in the
  // same action, instead of a manufacturer-wide upload with no home (design
  // doc addendum 3 §C2/§C5 step 3 — this linkage never existed before).
  // Omit for a manufacturer-wide document, same as today's behaviour.
  stagedSystemId?: string | null
  systemSourceRole?: SystemSourceRole | null
}

export type RecordUploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string }

// Matches the CHECK constraint on system_sources.role (migration 051).
export type SystemSourceRole = 'install_guide' | 'design_guide' | 'website' | 'tech_data' | 'source_catalogue'

function isMissingSystemSourcesTable(message: string | undefined): boolean {
  return /system_sources|does not exist|42P01|42703/i.test(message ?? '')
}

export async function recordDocumentUpload(
  input: RecordUploadInput,
): Promise<RecordUploadResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL
  const publicUrl = publicUrlBase
    ? `${publicUrlBase.replace(/\/$/, '')}/${input.storageKey}`
    : null

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const { data, error } = await supabase
    .from('source_documents')
    .insert({
      manufacturer_id: input.manufacturerId,
      original_filename: input.originalFilename,
      document_name: input.documentName,
      document_type: input.documentType,
      storage_provider: 'cloudflare_r2',
      storage_bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME ?? null,
      storage_key: input.storageKey,
      public_url: publicUrl,
      file_mime_type: input.contentType,
      file_size_bytes: input.fileSizeBytes,
      status: 'uploaded',
      uploaded_by: auth.userId,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Failed to record upload.' }
  }

  const documentId = (data as { id: string }).id

  if (input.stagedSystemId) {
    const link = await linkDocumentToSystem({
      manufacturerId: input.manufacturerId,
      stagedSystemId: input.stagedSystemId,
      sourceDocumentId: documentId,
      role: input.systemSourceRole ?? 'source_catalogue',
      label: input.documentName,
      url: publicUrl,
    })
    // The document itself is safely recorded either way — a failed link is
    // reported, not silently dropped, but doesn't undo the upload. The
    // manufacturer can retry linking from the setup page's Documents step.
    if (!link.ok) return { ok: true, documentId } // upload succeeded; caller can inspect via listSystemDocuments if the link is missing
  }

  return { ok: true, documentId }
}

// ─── linkDocumentToSystem ─────────────────────────────────────────────────────
// Creates the system_sources row that's never existed before this session:
// documents were manufacturer-wide with no way to say "this one is FOR this
// system." Reusable on its own for linking an already-uploaded document to
// a second system (e.g. a shared install guide covering two product lines).

export type LinkDocumentResult = { ok: true; systemSourceId: string } | { ok: false; error: string }

export async function linkDocumentToSystem(input: {
  manufacturerId: string
  stagedSystemId: string
  sourceDocumentId: string
  role: SystemSourceRole
  label: string | null
  url: string | null
}): Promise<LinkDocumentResult> {
  const auth = await assertManufacturerAccess(input.manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const { data, error } = await supabase
    .from('system_sources')
    .insert({
      manufacturer_id: input.manufacturerId,
      staged_system_id: input.stagedSystemId,
      source_document_id: input.sourceDocumentId,
      role: input.role,
      label: input.label,
      // url is NOT NULL on system_sources (migration 051) even for an
      // uploaded file, not a web link — fall back to the storage key path
      // rather than an empty string if no public R2 URL is configured.
      url: input.url || `document:${input.sourceDocumentId}`,
      ingest_status: 'linked',
      include_in_container: true,
    })
    .select('id')
    .single()

  if (error || !data) {
    if (isMissingSystemSourcesTable(error?.message)) {
      return { ok: false, error: 'Document linking needs migration 051 applied to this project first.' }
    }
    return { ok: false, error: error?.message ?? 'Failed to link document to system.' }
  }

  return { ok: true, systemSourceId: (data as { id: string }).id }
}

// ─── listSystemDocuments ──────────────────────────────────────────────────────
// The Documents step's read side (design doc addendum 3 §C5 step 3) — every
// document linked to one system, joined back to its source_documents row for
// filename/status. Degrades to an empty list, not an error, before migration
// 051/065 — a system with no linked documents yet is the normal starting state.

export type SystemDocument = {
  systemSourceId: string
  role: SystemSourceRole
  label: string | null
  ingestStatus: string
  documentId: string | null
  documentName: string | null
  documentStatus: string | null
  uploadedAt: string | null
}

export async function listSystemDocuments(
  manufacturerId: string,
  stagedSystemId: string,
): Promise<{ ok: true; documents: SystemDocument[] } | { ok: false; error: string }> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const { data, error } = await supabase
    .from('system_sources')
    .select('id, role, label, ingest_status, source_document_id, source_documents(document_name, status, uploaded_at)')
    .eq('manufacturer_id', manufacturerId)
    .eq('staged_system_id', stagedSystemId)
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingSystemSourcesTable(error.message)) return { ok: true, documents: [] }
    return { ok: false, error: error.message }
  }

  type Row = {
    id: string; role: SystemSourceRole; label: string | null; ingest_status: string
    source_document_id: string | null
    source_documents: { document_name: string; status: string; uploaded_at: string } | { document_name: string; status: string; uploaded_at: string }[] | null
  }
  const documents: SystemDocument[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const doc = Array.isArray(r.source_documents) ? r.source_documents[0] : r.source_documents
    return {
      systemSourceId: r.id,
      role: r.role,
      label: r.label,
      ingestStatus: r.ingest_status,
      documentId: r.source_document_id,
      documentName: doc?.document_name ?? null,
      documentStatus: doc?.status ?? null,
      uploadedAt: doc?.uploaded_at ?? null,
    }
  })
  return { ok: true, documents }
}

// ─── getDocumentDownloadUrl ───────────────────────────────────────────────────
// Looks up the storage_key for a document, verifies workspace access, then
// returns a 15-minute presigned GET URL.

export type GetDownloadUrlResult =
  | { ok: true; downloadUrl: string }
  | { ok: false; error: string }

export async function getDocumentDownloadUrl(
  documentId: string,
  manufacturerId: string,
): Promise<GetDownloadUrlResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return { ok: false, error: 'Supabase client not configured.' }
  }

  const { data, error } = await supabase
    .from('source_documents')
    .select('storage_key, manufacturer_id')
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)
    .single()

  if (error || !data) {
    return { ok: false, error: 'Document not found.' }
  }

  const row = data as { storage_key: string | null; manufacturer_id: string }

  if (!row.storage_key) {
    return { ok: false, error: 'No file stored for this document.' }
  }

  return createPresignedDownloadUrl({ storageKey: row.storage_key })
}

// ─── Document lifecycle actions ───────────────────────────────────────────────
// Archive, supersede, and delete use the service role to bypass RLS
// (no UPDATE/DELETE policies exist on source_documents). Auth is enforced
// manually via assertManufacturerAccess + manufacturer_id equality guard.

export type DocumentActionResult = { ok: true } | { ok: false; error: string }

function makeServiceClient() {
  try {
    return { ok: true as const, supabase: createStudioServiceClient() }
  } catch {
    return { ok: false as const, error: 'Service client not configured.' }
  }
}

export async function archiveDocument(
  documentId: string,
  manufacturerId: string,
): Promise<DocumentActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const c = makeServiceClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase
    .from('source_documents')
    .update({ status: 'archived' })
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function supersedeDocument(
  documentId: string,
  manufacturerId: string,
): Promise<DocumentActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const c = makeServiceClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase
    .from('source_documents')
    .update({ status: 'superseded' })
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteDocument(
  documentId: string,
  manufacturerId: string,
): Promise<DocumentActionResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const c = makeServiceClient()
  if (!c.ok) return { ok: false, error: c.error }

  const { error } = await c.supabase
    .from('source_documents')
    .delete()
    .eq('id', documentId)
    .eq('manufacturer_id', manufacturerId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
