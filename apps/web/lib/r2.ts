import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function makeR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 credentials not configured (CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY)')
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export type PresignedUploadResult =
  | { ok: true; uploadUrl: string; storageKey: string }
  | { ok: false; error: string }

export async function createPresignedUploadUrl(opts: {
  storageKey: string
  contentType: string
  fileSizeBytes: number
  expiresInSeconds?: number
}): Promise<PresignedUploadResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) {
    return { ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' }
  }

  const maxBytes = 50 * 1024 * 1024
  if (opts.fileSizeBytes > maxBytes) {
    return { ok: false, error: 'File exceeds 50 MB limit.' }
  }

  try {
    const client = makeR2Client()
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: opts.storageKey,
      ContentType: opts.contentType,
      ContentLength: opts.fileSizeBytes,
    })
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: opts.expiresInSeconds ?? 300,
    })
    return { ok: true, uploadUrl, storageKey: opts.storageKey }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
