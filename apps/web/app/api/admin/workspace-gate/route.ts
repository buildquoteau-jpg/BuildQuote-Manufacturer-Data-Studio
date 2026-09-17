import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getStudioSession } from '@/lib/studio-auth/session'

export const runtime = 'nodejs'

const COOKIE_NAME = 'admin_workspace_gate'
const COOKIE_MAX_AGE = 60 * 60 * 8 // 8 hours
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function passwordMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const expected = process.env.ADMIN_WORKSPACE_GATE_PASSWORD
  if (!expected) {
    return NextResponse.json(
      { error: 'Workspace gate is not configured (ADMIN_WORKSPACE_GATE_PASSWORD).' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => null)
  const { manufacturerId, password } = body ?? {}

  if (!manufacturerId || typeof manufacturerId !== 'string' || !UUID_RE.test(manufacturerId)) {
    return NextResponse.json({ error: 'manufacturerId must be a UUID' }, { status: 400 })
  }

  if (typeof password !== 'string' || !passwordMatches(password, expected)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, manufacturerId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
