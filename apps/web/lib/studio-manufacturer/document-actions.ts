'use server'

import { createStudioServerClient } from '@/lib/supabase/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createPresignedUploadUrl } from '@/lib/r2'
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
