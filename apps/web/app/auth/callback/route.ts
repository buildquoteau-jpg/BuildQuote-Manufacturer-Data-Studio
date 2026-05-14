import { NextResponse } from 'next/server'
import { createStudioServerClient } from '@/lib/supabase/server'

/**
 * Auth callback route.
 *
 * Handles the redirect from Supabase Auth after:
 *   - Magic link sign-in (PKCE code exchange)
 *   - OAuth provider redirect (future)
 *
 * Not needed for email + password sign-in (V1 default).
 * This route is safe to leave in place — it only activates when Supabase
 * sends a ?code= parameter (i.e. only during magic link or OAuth flows).
 *
 * Security:
 *   - Only internal relative paths are permitted for post-auth redirects.
 *   - The `next` query param is validated to start with "/" before use.
 *   - Auth codes are never reflected back in response URLs.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/dashboard'

  // Validate next — must be a relative path to prevent open redirect
  const next = nextParam.startsWith('/') ? nextParam : '/dashboard'

  if (code) {
    try {
      const supabase = createStudioServerClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        return NextResponse.redirect(
          `${origin}/login?error=invalid-link`,
        )
      }

      // Code exchanged successfully — redirect to intended destination
      return NextResponse.redirect(`${origin}${next}`)
    } catch {
      // createStudioServerClient() throws if env vars are missing
      return NextResponse.redirect(`${origin}/login?error=not-configured`)
    }
  }

  // No code present — redirect to login
  return NextResponse.redirect(`${origin}/login`)
}
