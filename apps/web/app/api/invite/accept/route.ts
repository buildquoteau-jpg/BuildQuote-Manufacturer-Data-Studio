import { NextResponse, type NextRequest } from 'next/server'
import { createStudioServerClient } from '@/lib/supabase/server'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { verifyWorkspaceInviteCode } from '@/lib/studio-auth/inviteToken'

const GATE_COOKIE = 'admin_workspace_gate'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const rawCode = typeof body.code === 'string' ? body.code : ''
  const mode: 'signup' | 'signin' | 'current' =
    body.mode === 'signin'
      ? 'signin'
      : body.mode === 'current'
        ? 'current'
        : 'signup'

  const verified = verifyWorkspaceInviteCode(rawCode)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 400 })
  }

  const { payload, tokenHash } = verified
  const service = createStudioServiceClient()
  const serverSupabase = createStudioServerClient()

  // Verify manufacturer still exists
  const { data: mfr, error: mfrErr } = await service
    .from('data_studio_manufacturers')
    .select('id, name, slug')
    .eq('id', payload.mid)
    .single()

  if (mfrErr || !mfr) {
    return NextResponse.json({ error: 'This manufacturer workspace no longer exists.' }, { status: 404 })
  }

  let authUserId: string
  let resolvedEmail: string
  let resolvedFullName: string | null =
    typeof body.fullName === 'string' && body.fullName.trim()
      ? body.fullName.trim().slice(0, 120)
      : null

  if (mode === 'current') {
    const {
      data: { user },
      error: userErr,
    } = await serverSupabase.auth.getUser()
    if (userErr || !user || !user.email) {
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in or create an account below.' },
        { status: 401 },
      )
    }
    if (payload.email && user.email.toLowerCase() !== payload.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: `This invitation is restricted to ${payload.email}. Sign out first or enter that email to continue.`,
        },
        { status: 403 },
      )
    }
    authUserId = user.id
    resolvedEmail = user.email.toLowerCase()
    resolvedFullName =
      resolvedFullName ||
      (typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
        : null)
  } else {
    const email = (
      payload.email ||
      (typeof body.email === 'string' ? body.email : '')
    )
      .trim()
      .toLowerCase()
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid work email address.' }, { status: 400 })
    }
    if (payload.email && email !== payload.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation is reserved for ${payload.email}.` },
        { status: 403 },
      )
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Please enter a password of at least 8 characters.' },
        { status: 400 },
      )
    }

    if (mode === 'signup') {
      if (!resolvedFullName) {
        return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 })
      }
      const { data: created, error: createErr } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: resolvedFullName },
      })

      if (createErr) {
        if (/already|registered|exists/i.test(createErr.message ?? '')) {
          return NextResponse.json(
            {
              error: 'An account with this email already exists. Switch to "Already have an account? Sign in" below.',
              code: 'ACCOUNT_EXISTS',
            },
            { status: 409 },
          )
        }
        return NextResponse.json(
          { error: createErr.message || 'Could not create account.' },
          { status: 400 },
        )
      }

      if (!created.user) {
        return NextResponse.json({ error: 'Could not create account.' }, { status: 500 })
      }

      // Sign the brand-new user into the browser session right away
      const { error: signInErr } = await serverSupabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInErr) {
        return NextResponse.json(
          { error: 'Account created, but automatic sign-in failed. Please sign in on the login page.' },
          { status: 500 },
        )
      }

      authUserId = created.user.id
      resolvedEmail = email
    } else {
      // mode === 'signin'
      const { data: signedIn, error: signInErr } =
        await serverSupabase.auth.signInWithPassword({ email, password })

      if (signInErr || !signedIn.user) {
        return NextResponse.json(
          { error: 'Invalid email or password. Double-check your details or create a new account.' },
          { status: 401 },
        )
      }
      authUserId = signedIn.user.id
      resolvedEmail = email
      resolvedFullName =
        resolvedFullName ||
        (typeof signedIn.user.user_metadata?.full_name === 'string'
          ? signedIn.user.user_metadata.full_name
          : null)
    }
  }

  // Ensure data_studio_user_profiles row exists (never downgrade an existing buildquote_admin)
  const { data: existingProfile } = await service
    .from('data_studio_user_profiles')
    .select('id, global_role, status, full_name')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  let userProfileId: string
  let isBuildquoteAdmin = false

  if (existingProfile) {
    userProfileId = existingProfile.id
    isBuildquoteAdmin = existingProfile.global_role === 'buildquote_admin'
    if (existingProfile.status !== 'active' || (!existingProfile.full_name && resolvedFullName)) {
      await service
        .from('data_studio_user_profiles')
        .update({
          status: 'active',
          ...(resolvedFullName && !existingProfile.full_name ? { full_name: resolvedFullName } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id)
    }
  } else {
    const { data: newProfile, error: profErr } = await service
      .from('data_studio_user_profiles')
      .insert({
        auth_user_id: authUserId,
        email: resolvedEmail,
        full_name: resolvedFullName,
        global_role: 'manufacturer_user',
        status: 'active',
      })
      .select('id')
      .single()

    if (profErr || !newProfile) {
      return NextResponse.json(
        { error: `Could not create studio profile: ${profErr?.message ?? 'unknown error'}` },
        { status: 500 },
      )
    }
    userProfileId = newProfile.id
  }

  // Grant active workspace membership for this manufacturer
  const nowIso = new Date().toISOString()
  const { data: existingMembership } = await service
    .from('manufacturer_users')
    .select('id')
    .eq('manufacturer_id', mfr.id)
    .eq('user_profile_id', userProfileId)
    .maybeSingle()

  if (existingMembership) {
    await service
      .from('manufacturer_users')
      .update({
        auth_user_id: authUserId,
        email: resolvedEmail,
        role: payload.role,
        status: 'active',
        accepted_at: nowIso,
        last_active_at: nowIso,
      })
      .eq('id', existingMembership.id)
  } else {
    const { error: memErr } = await service.from('manufacturer_users').insert({
      manufacturer_id: mfr.id,
      auth_user_id: authUserId,
      user_profile_id: userProfileId,
      email: resolvedEmail,
      role: payload.role,
      status: 'active',
      invited_by: payload.by ?? null,
      accepted_at: nowIso,
      last_active_at: nowIso,
    })

    if (memErr) {
      return NextResponse.json(
        { error: `Could not activate workspace membership: ${memErr.message}` },
        { status: 500 },
      )
    }
  }

  // Mark audit record in workspace_invitations as accepted (best-effort)
  try {
    await service
      .from('workspace_invitations')
      .update({ status: 'accepted', accepted_at: nowIso })
      .eq('token_hash', tokenHash)
  } catch {
    // Non-fatal
  }

  const response = NextResponse.json({
    ok: true,
    manufacturerId: mfr.id,
    manufacturerName: mfr.name,
    redirectTo: '/manufacturer/start-here',
  })

  // If a buildquote_admin opens/accepts an invite link to test it, set their
  // workspace gate cookie so /manufacturer/start-here lands directly in that workspace.
  if (isBuildquoteAdmin) {
    response.cookies.set(GATE_COOKIE, mfr.id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    })
  }

  return response
}
