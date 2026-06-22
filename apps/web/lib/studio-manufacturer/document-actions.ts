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
}

export type RecordUploadResult =
  | { ok: true; documentId: string }
  | { ok: false; error: string }

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

  return { ok: true, documentId: (data as { id: string }).id }
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
