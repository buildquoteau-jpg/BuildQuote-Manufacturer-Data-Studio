import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

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
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 credentials not configured')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (!session.profile) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { manufacturerId, mimeType } = await req.json() as {
    manufacturerId?: string
    mimeType?: string
  }

  if (!manufacturerId) {
    return NextResponse.json({ error: 'manufacturerId required.' }, { status: 400 })
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

  const normalizedMime = (mimeType ?? '').split(';')[0].trim()
  const ext = ALLOWED_MIME_TYPES[normalizedMime]
  if (!ext) {
    return NextResponse.json({ error: `File type not accepted: ${normalizedMime}` }, { status: 400 })
  }

  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured.' }, { status: 500 })
  }

  const storageKey = `manufacturer-uploads/${manufacturerId}/${randomUUID()}.${ext}`

  try {
    const client = makeR2Client()
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      ContentType: normalizedMime,
    })
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 })
    return NextResponse.json({ uploadUrl, storageKey })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to generate upload URL: ${msg}` }, { status: 500 })
  }
}
