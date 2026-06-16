// Run with: node scripts/set_r2_cors.mjs
// Sets CORS on the studio-buildquote R2 bucket to allow presigned PUT uploads
// from studio.buildquote.com.au (and localhost for dev).

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '../apps/web/node_modules/@aws-sdk/client-s3/dist-es/index.js'
import { readFileSync } from 'fs'

// Parse .env.local manually (no dotenv needed)
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
)
Object.assign(process.env, env)

const { CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME } = process.env

if (!CLOUDFLARE_R2_ACCOUNT_ID || !CLOUDFLARE_R2_ACCESS_KEY_ID || !CLOUDFLARE_R2_SECRET_ACCESS_KEY || !CLOUDFLARE_R2_BUCKET_NAME) {
  console.error('Missing R2 env vars — check .env.local')
  process.exit(1)
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY },
})

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: [
        'https://studio.buildquote.com.au',
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ],
}

async function main() {
  console.log(`Setting CORS on bucket: ${CLOUDFLARE_R2_BUCKET_NAME}`)
  console.log('Rules:', JSON.stringify(corsConfig, null, 2))

  await client.send(new PutBucketCorsCommand({
    Bucket: CLOUDFLARE_R2_BUCKET_NAME,
    CORSConfiguration: corsConfig,
  }))

  console.log('\nCORS applied. Verifying...')

  const result = await client.send(new GetBucketCorsCommand({ Bucket: CLOUDFLARE_R2_BUCKET_NAME }))
  console.log('Current CORS rules:', JSON.stringify(result.CORSRules, null, 2))
  console.log('\nDone.')
}

main().catch(err => {
  console.error('Failed:', err.message)
  process.exit(1)
})
