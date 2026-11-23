import { createHash, createHmac, timingSafeEqual } from 'crypto'

const DEFAULT_TTL_DAYS = 30
const MAX_TTL_DAYS = 90

export type WorkspaceInvitePayload = {
  v: 1
  /** data_studio_manufacturers.id */
  mid: string
  /** manufacturer_users.role granted upon redemption */
  role: 'manufacturer_admin' | 'manufacturer_reviewer'
  /** Unix timestamp (seconds) after which the invite expires */
  exp: number
  /** Optional lowercase email restriction; omit for an open team invite link */
  email?: string
  /** Optional auth_user_id of inviting admin */
  by?: string
}

function signingSecret(): string {
  return (
    process.env.INVITE_TOKEN_SECRET ||
    process.env.AGENT_REVIEW_SECRET ||
    process.env.REVALIDATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'buildquote-dev-workspace-invite-secret'
  )
}

function signBody(bodyB64: string): string {
  return createHmac('sha256', signingSecret())
    .update(`workspace-invite:v1:${bodyB64}`)
    .digest('base64url')
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

export function createWorkspaceInviteCode(params: {
  manufacturerId: string
  role?: 'manufacturer_admin' | 'manufacturer_reviewer'
  ttlDays?: number
  restrictedEmail?: string | null
  invitedBy?: string | null
}): { code: string; tokenHash: string; expiresAt: string } {
  const days = Math.min(
    MAX_TTL_DAYS,
    Math.max(1, Math.round(params.ttlDays ?? DEFAULT_TTL_DAYS)),
  )
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60
  const cleanEmail = params.restrictedEmail?.trim().toLowerCase() || undefined

  const payload: WorkspaceInvitePayload = {
    v: 1,
    mid: params.manufacturerId,
    role: params.role ?? 'manufacturer_admin',
    exp,
    ...(cleanEmail ? { email: cleanEmail } : {}),
    ...(params.invitedBy ? { by: params.invitedBy } : {}),
  }

  const bodyB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = signBody(bodyB64)
  const code = `${bodyB64}.${sig}`

  return {
    code,
    tokenHash: hashInviteCode(code),
    expiresAt: new Date(exp * 1000).toISOString(),
  }
}

export function verifyWorkspaceInviteCode(
  rawCode: string | null | undefined,
):
  | { ok: true; payload: WorkspaceInvitePayload; code: string; tokenHash: string }
  | { ok: false; reason: string } {
  const code = (rawCode ?? '').trim()
  if (!code) return { ok: false, reason: 'Missing invitation code.' }

  const dot = code.indexOf('.')
  if (dot <= 0 || dot !== code.lastIndexOf('.')) {
    return { ok: false, reason: 'That invitation code is not valid.' }
  }

  const bodyB64 = code.slice(0, dot)
  const providedSig = code.slice(dot + 1)
  const expectedSig = signBody(bodyB64)

  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'This invitation link is invalid or has been modified.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'Malformed invitation code.' }
  }

  const p = parsed as Partial<WorkspaceInvitePayload>
  if (
    p.v !== 1 ||
    typeof p.mid !== 'string' ||
    !p.mid ||
    typeof p.exp !== 'number' ||
    (p.role !== 'manufacturer_admin' && p.role !== 'manufacturer_reviewer')
  ) {
    return { ok: false, reason: 'Malformed invitation payload.' }
  }

  if (Math.floor(Date.now() / 1000) > p.exp) {
    return {
      ok: false,
      reason: 'This invitation link has expired. Ask BuildQuote for a fresh workspace invite link.',
    }
  }

  return {
    ok: true,
    payload: p as WorkspaceInvitePayload,
    code,
    tokenHash: hashInviteCode(code),
  }
}

export function buildWorkspaceInviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/invite/${encodeURIComponent(code)}`
}
