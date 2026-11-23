import { createHmac, timingSafeEqual } from 'crypto'

const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60 // 14 days

function signingSecret(): string {
  return (
    process.env.AGENT_REVIEW_SECRET ||
    process.env.REVALIDATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'buildquote-dev-agent-review-secret'
  )
}

function signPayload(systemId: string, exp: number): string {
  return createHmac('sha256', signingSecret())
    .update(`agent-review:v1:${systemId}:${exp}`)
    .digest('base64url')
}

export function createAgentReviewToken(
  systemId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const token = signPayload(systemId, exp)
  return { token, exp }
}

export function verifyAgentReviewToken(
  systemId: string,
  token: string | null,
  expParam: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!token || !expParam) return { ok: false, reason: 'Missing review token or expiry.' }
  const exp = Number.parseInt(expParam, 10)
  if (!Number.isFinite(exp)) return { ok: false, reason: 'Invalid expiry parameter.' }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: 'This agent review link has expired. Open Agent Ready in Data Studio to copy a fresh link.' }

  const expected = signPayload(systemId, exp)
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Invalid review token.' }
  }
  return { ok: true }
}

export function buildAgentReviewUrl(
  origin: string,
  systemId: string,
  format: 'jsonld' | 'markdown' = 'jsonld',
): string {
  const { token, exp } = createAgentReviewToken(systemId)
  const base = origin.replace(/\/$/, '')
  const params = new URLSearchParams({ token, exp: String(exp) })
  if (format === 'markdown') params.set('format', 'markdown')
  return `${base}/api/agent-review/${encodeURIComponent(systemId)}?${params.toString()}`
}
