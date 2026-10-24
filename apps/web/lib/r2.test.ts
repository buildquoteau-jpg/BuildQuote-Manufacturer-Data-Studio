import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPresignedUploadUrl, createPresignedDownloadUrl } from './r2'

// Presigning is a local signature computation — no R2 request is made — so
// these tests exercise the real signer with throwaway credentials.
const FAKE_CREDS = {
  CLOUDFLARE_R2_ACCOUNT_ID: 'acct-test',
  CLOUDFLARE_R2_ACCESS_KEY_ID: 'key-test',
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret-test',
  CLOUDFLARE_R2_BUCKET_NAME: 'bucket-test',
}

beforeEach(() => {
  for (const [name, value] of Object.entries(FAKE_CREDS)) vi.stubEnv(name, value)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createPresignedUploadUrl', () => {
  it('signs a PUT URL for the bucket endpoint and key', async () => {
    const result = await createPresignedUploadUrl({
      storageKey: 'documents/doc-1.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 1024,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const url = new URL(result.uploadUrl)
    expect(url.host).toBe('bucket-test.acct-test.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/documents/doc-1.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(result.storageKey).toBe('documents/doc-1.pdf')
  })

  it('honours a custom expiry', async () => {
    const result = await createPresignedUploadUrl({
      storageKey: 'a.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 1,
      expiresInSeconds: 60,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(new URL(result.uploadUrl).searchParams.get('X-Amz-Expires')).toBe('60')
  })

  it('does not sign content-length (browsers cannot set it)', async () => {
    const result = await createPresignedUploadUrl({
      storageKey: 'a.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const signedHeaders = new URL(result.uploadUrl).searchParams.get('X-Amz-SignedHeaders') ?? ''
    expect(signedHeaders).not.toContain('content-length')
  })

  it('rejects a file over the 50 MB limit before signing anything', async () => {
    const result = await createPresignedUploadUrl({
      storageKey: 'big.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 50 * 1024 * 1024 + 1,
    })
    expect(result).toEqual({ ok: false, error: 'File exceeds 50 MB limit.' })
  })

  it('accepts a file exactly at the limit', async () => {
    const result = await createPresignedUploadUrl({
      storageKey: 'big.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 50 * 1024 * 1024,
    })
    expect(result.ok).toBe(true)
  })

  it('reports a missing bucket name', async () => {
    vi.stubEnv('CLOUDFLARE_R2_BUCKET_NAME', '')
    const result = await createPresignedUploadUrl({
      storageKey: 'a.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 1,
    })
    expect(result).toEqual({ ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' })
  })

  it('reports missing credentials as an error rather than throwing', async () => {
    vi.stubEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY', '')
    const result = await createPresignedUploadUrl({
      storageKey: 'a.pdf',
      contentType: 'application/pdf',
      fileSizeBytes: 1,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/R2 credentials not configured/)
  })
})

describe('createPresignedDownloadUrl', () => {
  it('signs a GET URL with a 15 minute default expiry', async () => {
    const result = await createPresignedDownloadUrl({ storageKey: 'assets/hero.jpg' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const url = new URL(result.downloadUrl)
    expect(url.host).toBe('bucket-test.acct-test.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/assets/hero.jpg')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
  })

  it('honours a custom expiry', async () => {
    const result = await createPresignedDownloadUrl({
      storageKey: 'assets/hero.jpg',
      expiresInSeconds: 30,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(new URL(result.downloadUrl).searchParams.get('X-Amz-Expires')).toBe('30')
  })

  it('reports a missing bucket name', async () => {
    vi.stubEnv('CLOUDFLARE_R2_BUCKET_NAME', '')
    const result = await createPresignedDownloadUrl({ storageKey: 'assets/hero.jpg' })
    expect(result).toEqual({ ok: false, error: 'CLOUDFLARE_R2_BUCKET_NAME not configured.' })
  })

  it('reports missing credentials as an error rather than throwing', async () => {
    vi.stubEnv('CLOUDFLARE_R2_ACCOUNT_ID', '')
    const result = await createPresignedDownloadUrl({ storageKey: 'assets/hero.jpg' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/R2 credentials not configured/)
  })
})
