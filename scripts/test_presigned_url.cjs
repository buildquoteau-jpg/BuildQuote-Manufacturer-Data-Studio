'use strict'
const path = require('path')
const fs = require('fs')

const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  if (!line.includes('=') || line.startsWith('#')) return
  const i = line.indexOf('=')
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '')
})

const sdkPath = path.join(__dirname, '..', 'node_modules', '.pnpm', '@aws-sdk+client-s3@3.1063.0', 'node_modules', '@aws-sdk', 'client-s3', 'dist-cjs', 'index.js')
const presignerPath = path.join(__dirname, '..', 'node_modules', '.pnpm', '@aws-sdk+s3-request-presigner@3.1063.0', 'node_modules', '@aws-sdk', 's3-request-presigner', 'dist-cjs', 'index.js')

const { S3Client, PutObjectCommand } = require(sdkPath)
const { getSignedUrl } = require(presignerPath)

const { CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME } = process.env

async function main() {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  const command = new PutObjectCommand({
    Bucket: CLOUDFLARE_R2_BUCKET_NAME,
    Key: 'test/presign-test.xlsx',
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ContentLength: 12345,
  })

  const url = await getSignedUrl(client, command, { expiresIn: 300 })
  const parsed = new URL(url)

  console.log('\n=== Presigned URL query params ===')
  for (const [k, v] of parsed.searchParams.entries()) {
    console.log(`  ${k} = ${v}`)
  }

  const hasChecksum = [...parsed.searchParams.keys()].some(k => k.toLowerCase().includes('checksum'))
  console.log('\nhas checksum param:', hasChecksum)
  console.log('\nFull URL:\n', url)
}

main().catch(err => { console.error(err.message); process.exit(1) })
