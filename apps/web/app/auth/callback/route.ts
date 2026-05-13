import { NextResponse } from 'next/server'

/**
 * Auth callback route — stub only.
 *
 * This route exists to handle the redirect from Supabase Auth after OAuth or
 * magic-link sign-in. It is not functional yet.
 *
 * When real auth is wired:
 *   1. Install @supabase/ssr
 *   2. Exchange the `code` query param for a session:
 *        const { code } = url.searchParams
 *        const supabase = createServerClient(...)
 *        await supabase.auth.exchangeCodeForSession(code)
 *   3. Redirect to /dashboard on success, /login?error=... on failure.
 *
 * Do not implement real code exchange until @supabase/ssr is installed and
 * the session model is confirmed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const next = url.searchParams.get('next') ?? '/login'

  // Stub: ignore any auth code and redirect back to login with a shell notice.
  const redirectUrl = new URL('/login', url.origin)
  redirectUrl.searchParams.set('notice', 'auth-callback-not-wired')

  void next // will be used by real implementation
  return NextResponse.redirect(redirectUrl)
}
