import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServerClient } from '@/lib/supabase/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// Increase body size limit to 50 MB (Vercel Pro supports this)
export const maxDuration = 60

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

function makeR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  console.log('[r2] accountId:', accountId ?? 'MISSING')
  console.log('[r2] accessKeyId:', accessKeyId ? accessKeyId.slice(0, 6) + '...' : 'MISSING')
  console.log('[r2] secretKey:', secretAccessKey ? secretAccessKey.slice(0, 4) + '...' : 'MISSING')
  console.log('[r2] bucket:', process.env.CLOUDFLARE_R2_BUCKET_NAME ?? 'MISSING')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getStudioSession()
  if (!session.profile) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const manufacturerId = req.headers.get('x-manufacturer-id')
  const documentType = req.headers.get('x-document-type') ?? 'other'
  const originalFilename = req.headers.get('x-original-filename') ?? 'upload'
  const contentType = req.headers.get('content-type') ?? ''

  if (!manufacturerId) {
    return NextResponse.json({ error: 'x-manufacturer-id header required.' }, { status: 400 })
  }

  // Verify membership
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

  // ── Validate file type ────────────────────────────────────────────────────
  // content-type header may include charset/boundary — strip parameters
  const mimeType = contentType.split(';')[0].trim()
  const ext = ALLOWED_MIME_TYPES[mimeType]
  if (!ext) {
    return NextResponse.json({ error: `File type not accepted: ${mimeType}` }, { status: 400 })
  }

  // ── Read body ─────────────────────────────────────────────────────────────
  const MAX_BYTES = 50 * 1024 * 1024
  let fileBuffer: Buffer
  try {
    const arrayBuffer = await req.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 50 MB limit.' }, { status: 413 })
    }
    fileBuffer = Buffer.from(arrayBuffer)
  } catch {
    return NextResponse.json({ error: 'Failed to read file body.' }, { status: 400 })
  }

  // ── Upload to R2 ──────────────────────────────────────────────────────────
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 500 })
  }

  const storageKey = `manufacturer-uploads/${manufacturerId}/${randomUUID()}.${ext}`

  try {
    const client = makeR2Client()
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: mimeType,
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 })
  }

  // ── Record in Supabase ────────────────────────────────────────────────────
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
      document_type: documentType,
      storage_provider: 'cloudflare_r2',
      storage_bucket: bucket,
      storage_key: storageKey,
      public_url: publicUrl,
      file_mime_type: mimeType,
      file_size_bytes: fileBuffer.byteLength,
      status: 'uploaded',
      uploaded_by: session.user!.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: `File uploaded but record failed: ${error?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, documentId: (data as { id: string }).id, storageKey })
}
