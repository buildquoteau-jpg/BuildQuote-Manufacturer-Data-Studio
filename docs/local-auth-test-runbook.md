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

## Manufacturer user test

Tests the full manufacturer_user login path: login → redirect to manufacturer workspace →
role-based nav → admin routes blocked → sign out.

Uses a dedicated snippet: `supabase/snippets/local-manufacturer-user-test.sql`

### Step M1 — Create the manufacturer auth user

1. Open Supabase Studio: **http://localhost:54323**
2. Go to **Authentication → Users → Add user → Create new user**
3. Enter:
   - **Email:** `manufacturer@test.local`
   - **Password:** any password you will remember
   - **Auto confirm user:** ✅ (required for local dev — skips email confirmation)
4. Click **Create user**

> The snippet will look up this user by email — you do **not** need to copy the UUID.

### Step M2 — Run the manufacturer test SQL snippet

1. In Supabase Studio, open **SQL Editor**
2. Open `supabase/snippets/local-manufacturer-user-test.sql`
3. If you used a different email or want a different manufacturer, edit these two lines at
   the top of the `DO $$` block:
   ```sql
   v_email TEXT := 'manufacturer@test.local';
   v_slug  TEXT := 'newtechwood';
   ```
4. Run the entire file (click **Run** or `Ctrl+Enter`)
5. Check the **Messages** tab — you should see:
   ```
   NOTICE:  Done. profile_id=<uuid>, manufacturer_id=<uuid>
   ```
6. The `SELECT` blocks at the bottom also run automatically and show the inserted rows.

**Expected verify output:**

| Column | Expected value |
|---|---|
| `global_role` | `manufacturer_user` |
| `profile_status` | `active` |
| `manufacturer_name` | `NewTechWood` (or the name matching your slug) |
| `role` | `manufacturer_admin` |
| `membership_status` | `active` |

### Step M3 — Sign out of any existing session

If you are signed in as the admin test user, click **Sign out** in the nav (or visit
`/auth-check` and click the sign-out button there).

**Expected:** Redirected to `/login`.

### Step M4 — Sign in as manufacturer user

1. Open **http://localhost:3000/login**
2. Enter `manufacturer@test.local` and the password from Step M1
3. Click **Sign in**

**Expected:** Redirected directly to `/manufacturer/dashboard` — not to `/dashboard`.

### Step M5 — Verify manufacturer nav

On `/manufacturer/dashboard`, confirm:

- ✅ Nav shows: `Dashboard · Documents · Review · Preview · Help · Sign out`
- ✅ Nav does **not** show: `Manufacturers` (admin link is hidden)
- ✅ Shell badge reads "Manufacturer" (not "Admin")
- ✅ Workspace section shows membership role `manufacturer_admin` and status `active`
- ✅ Placeholder counts are visible (not connected to DB yet — that is expected)

### Step M6 — Confirm /admin/manufacturers is blocked

Navigate to **http://localhost:3000/admin/manufacturers**

**Expected:** Redirected to `/dashboard`, which immediately redirects to
`/manufacturer/dashboard` (because the user has an active membership).
The admin page is never displayed.

### Step M7 — Verify session on /auth-check

Navigate to **http://localhost:3000/auth-check**

**Expected:**

| Field | Expected value |
|---|---|
| Email | `manufacturer@test.local` |
| Global role | `manufacturer_user` |
| Profile status | `active` |
| Memberships → Count | `1` |
| Memberships → Role | `manufacturer_admin` |
| Memberships → Status | `active` |

### Step M8 — Sign out

Click **Sign out** on the `/auth-check` page or anywhere in the nav.

**Expected:** Redirected to `/login`.

Visiting `/manufacturer/dashboard` without signing in should now redirect to `/login`.

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
- RLS policies — not active yet; protection is app-level only
- Invitation flow — not implemented yet
- Password reset — not implemented yet

## What IS now tested / active

- App-level route protection via `(protected)` layout group
- Role-based redirect after login (`buildquote_admin` → `/admin/manufacturers`,
  `manufacturer_user` with membership → `/manufacturer/dashboard`)
- Admin routes blocked for `manufacturer_user` role
- Manufacturer routes blocked for signed-out users and users with no active membership
- Role-specific nav (admin links hidden from manufacturer users)
