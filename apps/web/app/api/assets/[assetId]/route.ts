import { NextResponse } from 'next/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { getObjectFromR2 } from '@/lib/r2'

// Public, permanent image URL for a manufacturer asset:
//   https://studio.buildquote.com.au/api/assets/<assetId>
//
// Hybrid publishing embeds asset URLs inside published card snapshots that
// live forever on buildquote.com.au — presigned R2 links expire after an
// hour, so published cards must reference this stable route instead
// (see lib/publishing/buildCardSnapshot.ts). Responses are immutable-cached:
// asset bytes never change under an id (replacing an image creates a new
// asset row), so CDNs and browsers can cache indefinitely.
//
// Gate: the asset must exist and not be archived. These are manufacturer
// marketing images actively placed on cards — not sensitive documents
// (source PDFs live under a different table/prefix and are never served here).

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: { assetId: string } },
) {
  const { assetId } = params
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) {
    return NextResponse.json({ error: 'Invalid asset id.' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createStudioServiceClient>
  try {
    supabase = createStudioServiceClient()
  } catch {
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('manufacturer_assets')
    .select('storage_key, mime_type, archived')
    .eq('id', assetId)
    .maybeSingle()

  const row = data as { storage_key: string | null; mime_type: string | null; archived: boolean } | null
  if (error || !row || row.archived || !row.storage_key) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 })
  }
  if (!(row.mime_type ?? '').startsWith('image/')) {
    return NextResponse.json({ error: 'Not an image asset.' }, { status: 404 })
  }

  const obj = await getObjectFromR2(row.storage_key)
  if (!obj.ok) {
    return NextResponse.json({ error: 'Asset unavailable.' }, { status: 502 })
  }

  return new NextResponse(Buffer.from(obj.bytes), {
    status: 200,
    headers: {
      'Content-Type': row.mime_type ?? obj.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
