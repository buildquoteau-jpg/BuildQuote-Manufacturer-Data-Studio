# Local Auth Test Runbook

**Purpose:** Prove the full login → session → logout round-trip in local development
before any production Supabase or real user accounts are involved.

**Scope:** Local only. No hosted Supabase. No real manufacturer data. No production changes.

---

## Prerequisites

- Local Supabase running (`supabase start` from repo root)
- `.env.local` configured at `apps/web/.env.local` with local URLs and anon key
- Web dev server running or ready to start

Local Supabase Studio URL: **http://localhost:54323**
Local API URL: **http://localhost:54321** (confirm in `supabase start` output)

---

## Step 1 — Start local Supabase

From the repo root:

```bash
supabase start
```

Confirm it prints `Started supabase local development setup.`
Note the **API URL**, **anon key**, and **Studio URL** from the output.

Verify `apps/web/.env.local` contains (values from above output):
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
```

---

## Step 2 — Create the test auth user

1. Open Supabase Studio: **http://localhost:54323**
2. Go to **Authentication → Users**
3. Click **Add user → Create new user**
4. Enter:
   - **Email:** something memorable, e.g. `admin@test.local`
   - **Password:** any strong password you will use to sign in
   - **Auto confirm user:** ✅ check this box (skips email confirmation for local dev)
5. Click **Create user**
6. The new user appears in the list. **Copy the UUID** shown in the ID column.

---

## Step 3 — Run the SQL snippet

1. In Supabase Studio, open **SQL Editor**
2. Open `supabase/snippets/local-auth-test-user.sql` from this repo
3. Replace the two placeholders:
   - `PLACEHOLDER_AUTH_UUID` → the UUID you copied in Step 2
   - `PLACEHOLDER_EMAIL` → the email you used in Step 2
4. Run the snippet (click **Run** or press `Ctrl+Enter`)
5. Confirm the output shows `INSERT 0 1` or `UPDATE 1`

**Verify the profile row:**
```sql
SELECT id, auth_user_id, email, global_role, status
FROM   data_studio_user_profiles
WHERE  email = 'admin@test.local';  -- use your email
```

You should see one row with `global_role = 'buildquote_admin'` and `status = 'active'`.

---

## Step 4 — Start the web dev server

From the repo root (or `apps/web`):

```bash
pnpm dev
```

Dev server starts at **http://localhost:3000**

---

## Step 5 — Visit /login and sign in

1. Open **http://localhost:3000/login**
2. You should see the BuildQuote Data Studio sign-in form (no "auth shell" warning)
3. Enter the email and password from Step 2
4. Click **Sign in**

**Expected:** Redirected to `/dashboard` after successful sign-in.

If you see "Incorrect email or password": double-check the email/password and confirm the
auth user was created with **Auto confirm** ticked.

---

## Step 6 — Visit /auth-check

Navigate to **http://localhost:3000/auth-check**

**Expected:** The page loads (does NOT redirect to `/login`).

You should see:
- **Auth email:** the email you used
- **Auth user ID:** your UUID (truncated)
- **Global role:** `buildquote_admin`
- **Profile status:** `active`
- **Full name:** `Local Test User` (or whatever you set)
- **Memberships:** `none` (admin has global access, no membership row needed)

If you are redirected to `/login` instead:
- The session cookie may not have been set — check `supabase start` output
- Confirm `.env.local` values match the running local Supabase instance

---

## Step 7 — Sign out

On the `/auth-check` page, click **Sign out**.

**Expected:** Redirected to `/login`.

---

## Step 8 — Confirm /auth-check is now protected

Without signing in, navigate to **http://localhost:3000/auth-check** again.

**Expected:** Redirected to `/login` (307 redirect).

This confirms the `(protected)` route group layout is working correctly.

---

## Testing manufacturer_user role (optional)

To test the manufacturer_user path:

1. Create a second auth user in Supabase Studio (e.g. `mfr@test.local`)
2. In the SQL snippet, change `global_role` to `'manufacturer_user'`
3. Uncomment the STEP 2 block in the snippet and set the manufacturer slug
4. Run the snippet with the new user's UUID
5. Sign in as that user and visit `/auth-check`
6. Confirm memberships shows the manufacturer ID and role

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Studio is not configured" error on login | `.env.local` missing or wrong values | Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| "Incorrect email or password" | Auth user not confirmed or wrong password | In Supabase Studio, check the user's confirmed status |
| `/auth-check` redirects to `/login` after sign-in | Session cookie not set — env vars mismatch | Confirm `.env.local` URL matches `supabase start` output exactly |
| Profile shows "no profile" on `/auth-check` | SQL snippet not run, or wrong UUID/email | Re-run snippet with correct `PLACEHOLDER_AUTH_UUID` |
| `data_studio_user_profiles` row missing | Migration 003 not applied | Run `supabase db reset` locally to replay all migrations |
| Unique constraint error on email | Profile row already exists with that email | The snippet uses `ON CONFLICT ... DO UPDATE` — run it again; it will update |

---

## What is NOT tested here

- Production Supabase — not touched in any way
- RLS policies — not active yet; the protected group is app-level only
- Invitation flow — not implemented yet
- Role-based route authorization — `/admin/*` and `/manufacturer/*` are still public
- Password reset — not implemented yet

These are all covered in later chunks.
