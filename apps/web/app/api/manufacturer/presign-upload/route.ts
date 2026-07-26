import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { manufacturerMembershipError } from '@/lib/studio-auth/route-guards'
import { makeR2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
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

  const membershipError = manufacturerMembershipError(session, manufacturerId)
  if (membershipError) return membershipError

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
