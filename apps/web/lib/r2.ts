import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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
    // Disable automatic CRC32 checksums — AWS SDK v3 adds them by default but
    // R2 rejects browser PUT requests that don't include the matching header.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
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
      // ContentLength intentionally omitted: including it adds content-length to
      // X-Amz-SignedHeaders, which browsers treat as a forbidden header and can't
      // set explicitly — R2 then returns 403 on the actual PUT without CORS headers.
      // Size is validated above before the presigned URL is issued.
    })
    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: opts.expiresInSeconds ?? 300,
    })
    return { ok: true, uploadUrl, storageKey: opts.storageKey }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type UploadObjectResult =
  | { ok: true; storageKey: string }
  | { ok: false; error: string }

// Server-side direct PUT — used when the server already holds the bytes
// (e.g. importing an asset from a URL), so no presigned browser upload needed.
export async function uploadObjectToR2(opts: {
  storageKey: string
  body: Uint8Array
  contentType: string
}): Promise<UploadObjectResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) return { ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' }

  try {
    const client = makeR2Client()
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: opts.storageKey,
      Body: opts.body,
      ContentType: opts.contentType,
    }))
    return { ok: true, storageKey: opts.storageKey }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type GetObjectResult =
  | { ok: true; bytes: Uint8Array; contentType: string | null }
  | { ok: false; error: string }

// Server-side GET — used by the package generator to pull asset bytes into
// the ZIP. Not for large files; assets are capped at 25 MB on upload.
export async function getObjectFromR2(storageKey: string): Promise<GetObjectResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) return { ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' }

  try {
    const client = makeR2Client()
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }))
    if (!response.Body) return { ok: false, error: 'Empty object body.' }
    const bytes = await response.Body.transformToByteArray()
    return { ok: true, bytes, contentType: response.ContentType ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type DeleteObjectResult = { ok: true } | { ok: false; error: string }

// Best-effort cleanup — e.g. removing a pre-optimization scratch upload once
// its processed replacement has been stored under a new key. Callers should
// treat failure here as non-fatal; nothing depends on the old object being gone.
export async function deleteObjectFromR2(storageKey: string): Promise<DeleteObjectResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) return { ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' }

  try {
    const client = makeR2Client()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export type PresignedDownloadResult =
  | { ok: true; downloadUrl: string }
  | { ok: false; error: string }

export async function createPresignedDownloadUrl(opts: {
  storageKey: string
  expiresInSeconds?: number
}): Promise<PresignedDownloadResult> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME
  if (!bucket) return { ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' }

  try {
    const client = makeR2Client()
    const command = new GetObjectCommand({ Bucket: bucket, Key: opts.storageKey })
    const downloadUrl = await getSignedUrl(client, command, {
      expiresIn: opts.expiresInSeconds ?? 900,
    })
    return { ok: true, downloadUrl }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
