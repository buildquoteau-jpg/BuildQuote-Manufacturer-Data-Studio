import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { manufacturerMembershipError } from '@/lib/studio-auth/route-guards'
import { createStudioServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (!session.profile) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { manufacturerId, storageKey, mimeType, originalFilename, documentType, fileSizeBytes } =
    await req.json() as {
      manufacturerId?: string
      storageKey?: string
      mimeType?: string
      originalFilename?: string
      documentType?: string
      fileSizeBytes?: number
    }

  if (!manufacturerId || !storageKey || !mimeType || !originalFilename) {
    return NextResponse.json({ error: 'manufacturerId, storageKey, mimeType and originalFilename are required.' }, { status: 400 })
  }

  if (session.globalRole !== 'buildquote_admin') {
    const membershipError = manufacturerMembershipError(session, manufacturerId)
    if (membershipError) return membershipError
    // Ensure the storageKey belongs to this manufacturer to prevent cross-tenant registration
    if (!storageKey.startsWith(`manufacturer-uploads/${manufacturerId}/`)) {
      return NextResponse.json({ error: 'Invalid storage key.' }, { status: 403 })
    }
  }

  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL
  const publicUrl = publicUrlBase
    ? `${publicUrlBase.replace(/\/$/, '')}/${storageKey}`
    : null

  let supabase: ReturnType<typeof createStudioServerClient>
  try {
    supabase = createStudioServerClient()
  } catch {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 500 })
  }

  const documentName = originalFilename.replace(/\.[^.]+$/, '')
  const { data, error } = await supabase
    .from('source_documents')
    .insert({
      manufacturer_id: manufacturerId,
      original_filename: originalFilename,
      document_name: documentName,
      document_type: documentType ?? 'other',
      storage_provider: 'cloudflare_r2',
      storage_bucket: bucket,
      storage_key: storageKey,
      public_url: publicUrl,
      file_mime_type: mimeType,
      file_size_bytes: fileSizeBytes ?? null,
      status: 'uploaded',
      uploaded_by: session.user!.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: `Failed to register document: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, documentId: (data as { id: string }).id })
}
