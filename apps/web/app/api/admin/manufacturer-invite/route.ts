import { NextResponse, type NextRequest } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import {
  buildWorkspaceInviteUrl,
  createWorkspaceInviteCode,
} from '@/lib/studio-auth/inviteToken'

export async function POST(request: NextRequest) {
  const session = await getStudioSession()
  if (!session.profile || session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const manufacturerId =
    typeof body.manufacturerId === 'string' ? body.manufacturerId.trim() : ''
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const ttlDays =
    typeof body.ttlDays === 'number' && Number.isFinite(body.ttlDays)
      ? body.ttlDays
      : 30
  const role: 'manufacturer_admin' | 'manufacturer_reviewer' =
    body.role === 'manufacturer_reviewer'
      ? 'manufacturer_reviewer'
      : 'manufacturer_admin'

  if (!manufacturerId) {
    return NextResponse.json({ error: 'Missing manufacturerId.' }, { status: 400 })
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address, or leave it blank for an open team link.' }, { status: 400 })
  }

  const service = createStudioServiceClient()
  const { data: mfr, error: mfrErr } = await service
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('id', manufacturerId)
    .single()

  if (mfrErr || !mfr) {
    return NextResponse.json({ error: 'Manufacturer not found.' }, { status: 404 })
  }

  const { code, tokenHash, expiresAt } = createWorkspaceInviteCode({
    manufacturerId: mfr.id,
    role,
    ttlDays,
    restrictedEmail: email || null,
    invitedBy: session.user?.id ?? null,
  })

  // Record audit row in workspace_invitations (best-effort — never blocks link generation)
  try {
    await service.from('workspace_invitations').insert({
      manufacturer_id: mfr.id,
      email: email || 'open-team-link',
      role,
      token_hash: tokenHash,
      status: 'pending',
      invited_by: session.user?.id ?? null,
      expires_at: expiresAt,
    })
  } catch {
    // Non-fatal audit insert
  }

  const origin =
    request.headers.get('origin') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin
  const inviteUrl = buildWorkspaceInviteUrl(origin, code)

  return NextResponse.json({
    ok: true,
    manufacturerId: mfr.id,
    manufacturerName: mfr.name,
    code,
    inviteUrl,
    expiresAt,
    restrictedEmail: email || null,
    role,
  })
}
