import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const { name, slug, website_url, status } = body ?? {}

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, numbers, and hyphens (no leading/trailing hyphens)' },
      { status: 400 },
    )
  }
  if (website_url && typeof website_url === 'string' && website_url.trim()) {
    try {
      new URL(website_url.trim())
    } catch {
      return NextResponse.json({ error: 'website_url must be a valid URL' }, { status: 400 })
    }
  }

  const supabase = createStudioServiceClient()
  const { data, error } = await supabase
    .from('data_studio_manufacturers')
    .insert({
      name: name.trim(),
      slug: slug.trim(),
      website_url: website_url?.trim() || null,
      status: status === 'active' ? 'active' : 'draft',
    })
    .select('id, name, slug, status')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A manufacturer with that slug already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, manufacturer: data }, { status: 201 })
}
