# Studio Auth Wiring Plan

**Status:** Planning only. No auth has been wired yet.
**Created:** 2026-05-13
**Branch at time of writing:** `claude/document-upload-shell`

This document is the concrete step-by-step plan for wiring real Supabase Auth into
BuildQuote Data Studio. It supersedes the high-level notes in
`docs/studio-auth-dashboard-schema-plan.md` with implementation detail and
dependency decisions.

Nothing in this document modifies any migration, seed file, or live configuration.
The sections are ordered to be read top-to-bottom. Decisions required from Melia are
called out explicitly in **§14** and in-line where they gate a choice.

---

## 1. Current Auth Shell State

The following exist as of the last commit and are safe shells only — nothing is wired:

| File | What it does now |
|---|---|
| `apps/web/lib/supabase/browser.ts` | Lazy singleton `getBrowserSupabaseClient()` — returns `null` if env vars missing. No throw at module level. |
| `apps/web/lib/supabase/server.ts` | Factory `getServerSupabaseClient()` — returns a plain `createClient` instance. **Does not read Next.js cookies.** Will be replaced with `@supabase/ssr`'s `createServerClient` when auth is wired. |
| `apps/web/lib/studio/session.ts` | `getStudioSession()` — always returns `{ authWired: false, user: null, reason }`. Never reads a real session. |
| `apps/web/lib/studio/access.ts` | Pure access-check functions fully implemented. Route guard stubs return `AUTH_NOT_WIRED`. No redirect happens yet. |
| `apps/web/app/login/page.tsx` | Calls `getStudioSession()` for the reason string. Email/password fields rendered but sign-in button is `disabled`. No form submission wired. |
| `apps/web/app/auth/callback/route.ts` | Stub GET handler — discards any auth code and redirects back to `/login?notice=auth-callback-not-wired`. |
| All Studio pages | Use `StudioShell` which shows a persistent auth-not-wired warning banner. All pages accessible without login. |

**Nothing currently blocks unauthenticated access to any page. This is intentional while
the shell is being built.**

---

## 2. Required Dependency: `@supabase/ssr`

### Is it installed?

**No. `@supabase/ssr` is not installed in this repo.**

Confirmed by inspection of `apps/web/package.json` and `node_modules/@supabase/ssr` —
the package does not exist in either location.

What IS installed:
- `@supabase/supabase-js` v2.105.4 — in `apps/web/package.json` (deployed to `apps/web/node_modules`)
- `supabase` CLI v2.98.2 — in root `package.json` as a devDependency (for local DB management)

### Why is `@supabase/ssr` required?

Next.js 14 App Router uses a server-first model. Session tokens set by Supabase Auth are
stored in **cookies**, not `localStorage`. In server components and Route Handlers, cookies
must be read from the incoming request and written to the outgoing response.

The base `@supabase/supabase-js` `createClient` has no concept of Next.js cookies. It
cannot read the session from the request in a server component — it can only work with
`localStorage` (browser-side) or with an explicit access token you pass manually.

`@supabase/ssr` solves this with `createServerClient`, which accepts a `cookies()` adapter
so the Supabase client reads/writes the session via cookies at every request boundary.

Without `@supabase/ssr`:
- `getStudioSession()` cannot read whether the user is actually logged in
- Session tokens set by the login form will not be readable in server components
- Route guards cannot redirect correctly

### Decision required

> **§14 Q1 — Should `@supabase/ssr` be installed now?**
>
> Recommendation: **Yes, install it as the next step.** The install itself is safe and
> has no effect until `server.ts` is updated to use it. Install command:
> ```
> pnpm --filter web add @supabase/ssr
> ```
> This adds it to `apps/web/package.json`. No code changes follow automatically — the
> existing `server.ts` continues to use the old `createClient` until explicitly updated.

---

## 3. Environment Variables

Required env vars by name — values must never appear in this document or in any
committed file.

| Var | Required | Where | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `apps/web/.env.local` | Public — safe in browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `apps/web/.env.local` | Public — the Supabase anon/publishable key only |

### Service role key rules

- **The Supabase service role key is NOT required for normal login and session reads.**
- Normal auth (sign in, read session, check user) uses the anon key + a valid JWT from
  Supabase Auth. No service role needed.
- The service role key will only be needed later for server-side admin operations:
  production publish, parser insertion, user management actions that bypass RLS.
- When the service role key is eventually added, it must be stored as a plain (non-`NEXT_PUBLIC_`)
  env var, e.g. `SUPABASE_SERVICE_ROLE_KEY`, accessible only in server-side code.
- **A `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` must never exist.** That would expose the
  key in the browser bundle and defeat all RLS.

---

## 4. Login Method Decision for V1

### Options considered

| Method | Pros | Cons |
|---|---|---|
| **Email + password** | Simple, universal, works offline, no email deliverability dependency for sign-in | Requires password management; reset flow needed |
| **Magic link (OTP)** | Passwordless, low friction, no stored passwords | Requires working email delivery; OTP expiry edge cases; harder to test locally |
| **OAuth (Google, Microsoft)** | Familiar for business users | SSO dependency; more complex setup; not needed for V1 |
| **Invite-only + email + password** | Safe, no open signup, controlled user creation | Requires admin action to create each user |

### Recommendation: Invite-only email + password for V1

**Why invite-only:**
- Studio is a private application. Open public signup would allow anyone to register
  and potentially probe the API surface.
- BuildQuote controls which manufacturers get access. Users should be created
  deliberately by a BuildQuote admin.
- No `buildquote_admin` user should ever be self-created from a public signup form.

**Why email + password over magic link for V1:**
- Does not depend on email delivery working correctly in local dev.
- Can test sign-in immediately using Supabase Studio's "Add user" without configuring
  SMTP.
- Magic link can be added later as an option (especially for manufacturer users who
  may prefer it) without changing the auth architecture.

**What "invite-only" means in practice:**
- The login page has no "Sign up" link.
- Users are created either:
  - Manually in Supabase Studio's Auth dashboard (local dev: any user; hosted: admin users)
  - Via a future invitation flow (for manufacturer users — deferred to V2)
- The `data_studio_user_profiles` row is created server-side on first sign-in (trigger
  or server action — see §5).

> **§14 Q2 — Confirm: email + password, invite-only, no open signup for V1?**

---

## 5. User / Profile Mapping

### How `auth.users` maps to `data_studio_user_profiles`

```
auth.users (Supabase internal)
  id          → referenced by data_studio_user_profiles.auth_user_id
  email       → copied to data_studio_user_profiles.email

data_studio_user_profiles
  auth_user_id  UNIQUE — the Supabase Auth UUID
  email         display + invitation matching
  global_role   'buildquote_admin' | 'buildquote_reviewer' | 'manufacturer_user'
  status        'active' | 'suspended'
```

### Profile creation — two options

**Option A: Supabase Auth trigger (PostgreSQL function)**

A `AFTER INSERT ON auth.users` trigger function automatically creates the
`data_studio_user_profiles` row when Supabase creates the auth user.

- Pros: atomic, cannot be forgotten
- Cons: trigger logic lives in the DB, harder to add conditional logic,
  harder to test in isolation; role must be baked in at creation time
  (requires passing metadata through Supabase's `user_metadata` at signup)

**Option B: Server action on first sign-in**

After the user signs in for the first time, a server action checks whether a
`data_studio_user_profiles` row exists for `auth_user_id = user.id`. If not,
it creates one (with the service role key, server-side only).

- Pros: full TypeScript control; role can be passed explicitly; easier to test
- Cons: requires a service role call on every first sign-in; profile creation
  could fail if the server action errors

**Recommendation for V1:** Option B (server action) because it gives TypeScript
control over `global_role` assignment and is easier to reason about during
development. The trigger approach can be added later for robustness.

> **§14 Q3 — Option A (DB trigger) or Option B (server action on first sign-in)?**

### Role assignment

`global_role` is never self-assignable. It must be set server-side (service role) at
the moment the profile row is created. In V1, BuildQuote admin creates users manually
and sets the role explicitly.

The `status` column defaults to `'active'` on creation. Suspension is a BuildQuote
admin action only.

---

## 6. Manufacturer Membership Mapping

### How access flows

```
auth.users.id
  └── data_studio_user_profiles.auth_user_id
        └── global_role = 'manufacturer_user'
              └── manufacturer_users.user_profile_id
                    └── manufacturer_id  (which workspace)
                    └── role             (manufacturer_admin / reviewer / viewer)
                    └── status           (must be 'active')
```

### Access rules (mirrors `access.ts`)

| Global role | Manufacturer access |
|---|---|
| `buildquote_admin` | All manufacturers — no membership row needed |
| `buildquote_reviewer` | All manufacturers — no membership row needed |
| `manufacturer_user` | Only manufacturers where an `active` `manufacturer_users` row exists |

### Membership creation for V1

Manufacturer `manufacturer_users` rows are created by a BuildQuote admin manually
(via Supabase Studio or a future admin UI). No self-serve membership joining in V1.

The `workspace_invitations` table is planned but the full invitation flow (email sending,
token redemption, `accept-invitation` page) is deferred to V2.

> **§14 Q4 — Can manufacturer_admin invite users in V1, or is it BuildQuote-admin-only?**
> (Recommendation: BuildQuote-admin-only for V1. Simplifies RLS.)

---

## 7. Session Helper Implementation Plan

**File:** `apps/web/lib/studio/session.ts`

### Current state
Always returns `{ authWired: false, user: null, reason: 'NOT_IMPLEMENTED' }`.

### Target state (after `@supabase/ssr` is installed)

```typescript
// Pseudocode — not yet implemented
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getStudioSession(): Promise<StudioSession | null> {
  const cookieStore = cookies()

  // 1. Create SSR-aware Supabase client
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
      // set/remove handled in middleware or route handlers, not here
    },
  })

  // 2. Read the authenticated user from the JWT (server-verified, not localStorage)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  // 3. Look up data_studio_user_profiles by auth_user_id
  const { data: profile } = await supabase
    .from('data_studio_user_profiles')
    .select('id, email, full_name, global_role, status')
    .eq('auth_user_id', user.id)
    .single()
  if (!profile || profile.status !== 'active') return null

  // 4. For manufacturer_user: load active memberships
  let memberships: ManufacturerMembership[] = []
  if (profile.global_role === 'manufacturer_user') {
    const { data: rows } = await supabase
      .from('manufacturer_users')
      .select('manufacturer_id, role, status')
      .eq('user_profile_id', profile.id)
      .eq('status', 'active')
    memberships = rows ?? []
  }

  // 5. Return StudioAccessContext compatible with access.ts
  return {
    authWired: true,        // literal true when real — widens the type union
    user: { id: profile.id, email: profile.email, ... },
    memberships,
  }
}
```

### Key design notes

- Use `supabase.auth.getUser()`, **not** `getSession()`. `getUser()` re-validates
  the JWT with the Supabase server on every call — it cannot be spoofed with a
  tampered cookie. `getSession()` reads only from the cookie without server verification.
- The session helper must stay **server-side only**. Never import from a client component.
- When `getStudioSession()` returns `null`, the page/layout should redirect to `/login`
  using Next.js `redirect()` — not return a 401 JSON response.
- The `authWired` discriminant on `StudioAccessContext` must be updated from
  `readonly isAuthWired: false` to a union when the real implementation lands.

---

## 8. Login Page Implementation Plan

**File:** `apps/web/app/login/page.tsx` (currently a shell)

### Target behaviour

1. **Form submission:** The login form POSTs to a Next.js Server Action (or Route Handler).
   No client-side `supabase.auth.signInWithPassword()` — the sign-in call goes through
   a server action so errors and redirects are handled server-side.

2. **Server action pseudocode:**
   ```typescript
   'use server'
   async function signIn(formData: FormData) {
     const email = formData.get('email') as string
     const password = formData.get('password') as string
     const supabase = createServerActionClient(...)
     const { error } = await supabase.auth.signInWithPassword({ email, password })
     if (error) return { error: 'Invalid credentials' }
     // redirect() based on role
     const session = await getStudioSession()
     if (!session) return { error: 'Account not set up — contact BuildQuote.' }
     if (session.user.globalRole === 'buildquote_admin' ||
         session.user.globalRole === 'buildquote_reviewer') {
       redirect('/admin/manufacturers')
     }
     redirect('/manufacturer/dashboard')
   }
   ```

3. **No open signup.** The login page must never include a "Create account" link or
   route. The only auth action available is sign-in.

4. **Error handling:**
   - Invalid credentials → "Incorrect email or password."
   - Account not found in `data_studio_user_profiles` → "Your account is not set up yet. Contact BuildQuote."
   - Account suspended → "Your account has been suspended. Contact BuildQuote."
   - Env vars missing → current shell behaviour (show config warning, form disabled)

5. **Post-login redirect by role:**
   - `buildquote_admin` / `buildquote_reviewer` → `/admin/manufacturers`
   - `manufacturer_user` (with active memberships) → `/manufacturer/dashboard`
   - `manufacturer_user` (no active memberships) → `/manufacturer/dashboard` with a
     "no workspaces" info notice

6. **Email field enabled** (already done in current shell). Password field enabled.
   Sign-in button enabled when env vars are present.

7. **No fake `localStorage` auth.** No storing of user info in `localStorage` or
   `sessionStorage`. All session state lives in the Supabase Auth cookie.

---

## 9. Auth Callback Route Plan

**File:** `apps/web/app/auth/callback/route.ts` (currently a stub)

The callback route is needed if magic link or OAuth is used — both redirect back to
this URL with a `code` query parameter that must be exchanged for a session.

For **email + password V1**, this route is not needed for sign-in. It should still
exist (as now) for future magic link support.

### When magic link is added

```typescript
// Target implementation (not now)
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing-code`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(url, anonKey, {
    cookies: { get: ..., set: ..., remove: ... },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid-link`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

Safety rules:
- Never reflect the raw `code` or `access_token` back in a redirect URL.
- Validate `next` to ensure it stays within the Studio origin — do not blindly
  redirect to an external URL from a `next` param.
- Handle expired/invalid links gracefully with a user-facing error on `/login`.

---

## 10. Route Protection Plan

### Current state
No route protection is active. All pages are accessible without login.
`StudioShell` shows a persistent warning banner communicating this honestly.

### Target state

Route protection should be implemented **server-side**, in layouts or at the top of
page server components — not in client components.

Preferred approach: **Next.js Route Groups with shared layouts**.

```
apps/web/app/
  login/                    ← public (no protection)
  auth/callback/            ← public (handles redirect)
  (studio)/                 ← protected layout group
    layout.tsx              ← calls getStudioSession(); redirects to /login if null
    dashboard/
    (admin)/
      layout.tsx            ← additionally calls requireBuildQuoteAdmin()
      admin/manufacturers/
    (manufacturer)/
      layout.tsx            ← additionally calls requireManufacturerAccess()
      manufacturer/
```

### Activation sequence

1. **Do not activate protection until** `getStudioSession()` returns real data.
   Activating a redirect guard that always redirects would lock everyone out.
2. Once `getStudioSession()` is working, add the `(studio)/layout.tsx` redirect first —
   test with a real signed-in user before adding role guards.
3. Then add admin and manufacturer sub-layout guards.
4. Update `access.ts` guard stubs to use `redirect()` instead of returning `AUTH_NOT_WIRED`.
5. Update the `StudioShell` notice to drop the auth-not-wired banner once protection is live.

### `buildquote_reviewer` access

The current `access.ts` type includes `buildquote_reviewer` as a global role but the
route protection plan above does not have a dedicated reviewer route group. In V1:
- `buildquote_reviewer` lands at `/admin/manufacturers` (same as admin, but without
  publish/manage actions being available)
- Reviewer-gating at the action level (disable publish button, hide invite actions)
  is sufficient in V1 without a separate route group.

> **§14 Q5 — Should `buildquote_reviewer` be able to edit staged fields, or only add
> notes and verification events?**

---

## 11. RLS Relationship

**Auth wiring alone is not enough for production safety.**

When `@supabase/ssr` is installed and `getStudioSession()` reads real user data, the
application will know who is signed in. But if RLS policies have not been applied:

- An authenticated browser client using the anon key can still query any table it has
  a `USING (true)` policy for — which is currently all staging tables.
- A signed-in `manufacturer_user` could read other manufacturers' staged data.
- An authenticated `buildquote_reviewer` has the same read access as an admin because
  the distinction only exists at the application layer, not the database layer.

**The current convenience policies (anon SELECT all) must be replaced with scoped
policies before Studio is used with real manufacturer data — even in local testing.**

Order of dependency:
```
auth wiring → test with one admin user (no sensitive data yet)
           → add scoped RLS policies
           → test with manufacturer user (can only see own data)
           → only then connect real manufacturer documents
```

Parser insertion remains locked (`EXECUTE` revoked from all roles). This does not
change when auth is wired.

---

## 12. Implementation Order (Post This Doc)

Each step gates the next. Do not skip ahead.

| Step | Action | Safety note |
|---|---|---|
| 1 | Approve and install `@supabase/ssr` in `apps/web` | No code changes needed immediately after install |
| 2 | Update `apps/web/lib/supabase/server.ts` to export a `createStudioServerClient(cookieStore)` factory using `createServerClient` from `@supabase/ssr` | No route protection yet; session.ts still returns stub |
| 3 | Update `getStudioSession()` to call `supabase.auth.getUser()` and look up `data_studio_user_profiles` | Route protection remains off; test by logging the result in a server component |
| 4 | Create one `buildquote_admin` test user manually in local Supabase Studio (not via code) | No seed file changes; user is ephemeral to local dev |
| 5 | Create the corresponding `data_studio_user_profiles` row manually for that test user | Confirms the schema join works before adding automation |
| 6 | Wire the login form — enable sign-in Server Action with email + password | Test a real sign-in round-trip; confirm session cookie is set |
| 7 | Confirm `getStudioSession()` returns the test admin's profile after sign-in | Log result; no redirect guard yet |
| 8 | Add logout Server Action | Simple: `supabase.auth.signOut()` then `redirect('/login')` |
| 9 | Add `(studio)/layout.tsx` route group — redirect to `/login` if session is null | First real protection gate; test with signed-out browser |
| 10 | Add admin sub-layout guard using `requireBuildQuoteAdmin()` | Test that manufacturer_user cannot reach `/admin/*` |
| 11 | Add manufacturer sub-layout guard using `requireManufacturerAccess()` | Test that admin cannot accidentally use manufacturer routes (they can, but let's confirm redirect logic) |
| 12 | Replace open-read RLS convenience policies with scoped policies (separate migration) | Do not ship real data until this step is done |
| 13 | Create one `manufacturer_user` test user + `manufacturer_users` membership row manually | Test manufacturer-scoped access end-to-end |
| 14 | Multi-user local test: sign in as admin, sign in as manufacturer, confirm data isolation | Required before any hosted deployment |
| 15 | Only after local test passes: deploy to hosted Supabase Studio project | Not the production RFQ/MFP project — Studio only |
| 16 | Enable parser insertion server route (separate chunk, much later) | After hosted auth + RLS confirmed |

---

## 13. Risks and Gotchas

**Open signup must never be enabled**
If Supabase Auth's email signup is enabled without restriction, anyone who knows the
Studio URL can create an account. Disable email signup at the Supabase project level
(`Auth > Settings > Disable email signup`) and rely on admin-created users only.

**`NEXT_PUBLIC_` service role key is forbidden**
Any env var prefixed `NEXT_PUBLIC_` is bundled into the browser JavaScript. A service
role key in a `NEXT_PUBLIC_` var would be visible to anyone with browser dev tools.
The service role key goes in a plain env var (`SUPABASE_SERVICE_ROLE_KEY`) and is
only imported in server-side files.

**Client-only route protection is not real security**
Hiding a link in the nav, or checking a cookie in a `useEffect`, does not prevent
a user from directly navigating to a protected URL. Protection must be server-side —
in `layout.tsx` or `page.tsx` server components using `redirect()`.

**`getSession()` vs `getUser()` — use `getUser()`**
`supabase.auth.getSession()` reads the session from the cookie without re-validating
it with Supabase's server. A tampered or expired cookie could return a stale session.
`supabase.auth.getUser()` re-validates the JWT on every call. Always use `getUser()`
in server-side session checks. `getSession()` is acceptable on the client side where
you are not making security decisions.

**RLS policies with `USING (true)` are open to all rows**
All current staging tables have `USING (true)` — every authenticated (and in some
cases anon) user can read every row. These are dev-convenience policies only and must
be replaced with scoped policies before any real manufacturer data is processed.

**Enabling RLS without policies blocks everything**
`ALTER TABLE t ENABLE ROW LEVEL SECURITY` without adding any policy denies all access
by default. Always pair: enable RLS + add the required policies in the same migration.
Never enable RLS in one migration and add policies in a later one — the gap blocks access.

**Local vs hosted Supabase auth differences**
Local Supabase (running via Docker) uses a local GoTrue server. Email delivery (for
password reset or magic link) does not work in local dev unless configured with a
local SMTP service or the Inbucket test mailer that ships with `supabase start`.
Test sign-in locally using admin-created users; test email flows in a hosted
Supabase preview project, not production.

**OneDrive path characters on Windows**
The repo lives on OneDrive. Some tools handle spaces/special characters in paths
poorly. If `pnpm dev` fails with path errors, use the local Windows drive copy
or a symlink as a workaround. This is unrelated to auth but worth noting.

**Do not run Studio migrations against production RFQ/MFP Supabase**
Studio migrations add tables (`data_studio_user_profiles`, `manufacturer_users`, etc.)
that do not belong in the production RFQ/MFP schema. The Studio Supabase project is
a **separate, dedicated project** from the RFQ/MFP production project.

---

## 14. Decisions Needed from Melia

The following must be answered before implementation begins. They are gating decisions —
each blocks a specific step in §12.

| # | Question | Gates step | Recommendation |
|---|---|---|---|
| Q1 | Should `@supabase/ssr` be installed now (next chunk)? | Step 1 | **Yes — safe to install, no immediate code change** |
| Q2 | Confirm V1 login method: email + password, invite-only, no open signup? | Step 6 | **Yes — email + password, no signup page** |
| Q3 | Profile creation: DB trigger (Option A) or server action on first sign-in (Option B)? | Step 5 | **Option B (server action) for V1 — easier to control** |
| Q4 | Can `manufacturer_admin` invite users in V1, or is it BuildQuote-admin-only? | Step 13 | **BuildQuote-admin-only for V1** |
| Q5 | Can `buildquote_reviewer` edit staged field values directly, or only add notes + verification events? | Step 12 (RLS) | **Notes + events only for V1 — simpler RLS** |
| Q6 | Should `buildquote_reviewer` role be seeded for local dev testing, or only `buildquote_admin`? | Step 4 | **Admin only for V1 local test; add reviewer when RLS is ready** |
| Q7 | Should login redirect differ by role (admin → `/admin/manufacturers`, mfr → `/manufacturer/dashboard`)? | Step 8 | **Yes — role-based redirect on sign-in** |
| Q8 | Should local test users be created manually in Supabase Studio, or via a local dev seed script? | Step 4 | **Manually — no credentials in any file** |
| Q9 | Is magic link wanted as an alternative to password in V1, or password-only first? | Step 6 | **Password-only first; magic link later** |
| Q10 | When should the auth-not-wired banner be removed from `StudioShell`? | Step 9 | **After route group protection is live and tested** |

---

## Appendix: File Change Map (When Auth Is Wired)

This maps each implementation step to the exact files it touches:

| Step | Files changed |
|---|---|
| 1 — install `@supabase/ssr` | `apps/web/package.json`, `pnpm-lock.yaml` |
| 2 — update server client | `apps/web/lib/supabase/server.ts` |
| 3 — implement `getStudioSession()` | `apps/web/lib/studio/session.ts` |
| 6 — login form server action | `apps/web/app/login/page.tsx`, new `apps/web/app/login/actions.ts` |
| 8 — logout action | new `apps/web/app/actions/auth.ts` or `apps/web/app/login/actions.ts` |
| 9 — studio route group | new `apps/web/app/(studio)/layout.tsx` |
| 10 — admin guard | new `apps/web/app/(studio)/(admin)/layout.tsx` |
| 11 — manufacturer guard | new `apps/web/app/(studio)/(manufacturer)/layout.tsx` |
| 12 — RLS policies | new `supabase/migrations/014_studio_rls_policies.sql` |
| Step 9 complete — remove shell banner | `apps/web/components/studio/StudioShell.tsx` (remove default notice) |
