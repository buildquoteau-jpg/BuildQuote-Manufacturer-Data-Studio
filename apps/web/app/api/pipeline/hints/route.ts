import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import path from 'path'
import fs from 'fs/promises'

function assertAdmin(session: Awaited<ReturnType<typeof getStudioSession>>) {
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
}

// Manufacturer slugs only: lowercase letters, digits and hyphens. Anything
// else (path separators, dots) would escape the hints directory.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function hintsPath(slug: string): string | null {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null
  const repoRoot = path.resolve(process.cwd(), '..', '..')
  return path.join(repoRoot, 'prompts', 'manufacturer-hints', `${slug}.md`)
}

export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  const denied = assertAdmin(session)
  if (denied) return denied

  const slug = req.nextUrl.searchParams.get('slug') ?? ''
  const filePath = hintsPath(slug)
  if (!filePath) return NextResponse.json({ error: 'A valid slug is required' }, { status: 400 })

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return NextResponse.json({ ok: true, exists: true, content, path: filePath })
  } catch {
    return NextResponse.json({ ok: true, exists: false, content: '', path: filePath })
  }
}

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  const denied = assertAdmin(session)
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const { slug, content } = body ?? {}
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'slug and content required' }, { status: 400 })
  }

  const filePath = hintsPath(slug)
  if (!filePath) return NextResponse.json({ error: 'A valid slug is required' }, { status: 400 })

  try {
    await fs.writeFile(filePath, content, 'utf-8')
    return NextResponse.json({ ok: true, path: filePath })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
