import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // No Supabase env (e.g. a fresh clone without .env.local): don't crash every
  // request — pass through. Auth-gated pages will still fail to load data, but
  // static routes like /system-card-preview stay usable for local dev.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: do not add logic between createServerClient and supabase.auth.getUser()
  const { data: { user } } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/widget') &&
    !request.nextUrl.pathname.startsWith('/api/widget') &&
    // Public card data (stockist refresh for travelling cards)
    !request.nextUrl.pathname.startsWith('/api/cards') &&
    // Public permanent asset images embedded in published cards
    !request.nextUrl.pathname.startsWith('/api/assets') &&
    // Public hosted card pages (canonical + versioned URLs)
    !request.nextUrl.pathname.startsWith('/cards') &&
    // Tokenised no-login stockist confirmation links
    !request.nextUrl.pathname.startsWith('/stockist-confirm') &&
    // Static seed-data renderer demo — no auth, no DB by design
    !request.nextUrl.pathname.startsWith('/system-card-preview') &&
    // System Card V2 design experiment — isolated, no auth, no DB by design
    !request.nextUrl.pathname.startsWith('/system-card-v2') &&
    // Sitemap of canonical card URLs
    request.nextUrl.pathname !== '/sitemap.xml' &&
    // Share links, view beacon, share creation, doc click-through tracking
    !request.nextUrl.pathname.startsWith('/s/') &&
    !request.nextUrl.pathname.startsWith('/api/beacon') &&
    !request.nextUrl.pathname.startsWith('/api/share') &&
    !request.nextUrl.pathname.startsWith('/api/doc-click')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: return supabaseResponse so cookies are forwarded
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
