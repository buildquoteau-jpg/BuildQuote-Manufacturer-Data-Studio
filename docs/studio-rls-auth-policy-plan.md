# Studio RLS / Auth Policy Plan

**Status:** Planning only. No RLS policies have been implemented to match this plan yet.
Do not enable or alter policies until auth is wired and each section is confirmed ready.

---

## 1. Purpose

This document describes the intended Row Level Security (RLS) and authentication policy design
for the BuildQuote Data Studio hosted Supabase project.

It is not active security. The current local development database has:
- Convenience "open read" policies on most tables (all rows visible to anon/authenticated)
- RLS disabled entirely on several tables
- No INSERT/UPDATE/DELETE policies on any table
- The parser insertion RPC fully locked down (EXECUTE revoked from all app roles)

Before Data Studio is deployed to a hosted Supabase project and accessed by real
manufacturer users, every table must have deliberate, scoped RLS policies in place.
This document is the specification for those policies.

**Scope:** Data Studio Supabase project only.
RFQ and MFP are separate projects and are not touched by this plan.

---

## 2. Roles and Identities

### 2.1 Supabase Auth roles

Supabase provides two built-in JWT roles used in policy USING/WITH CHECK clauses:

| Supabase role | Who uses it |
|---|---|
| `anon` | Unauthenticated requests (no session). Should have minimal or zero access in Studio. |
| `authenticated` | Any user with a valid Supabase Auth session. Access is then further scoped by app-level role. |
| `service_role` | Server-side admin key. Bypasses RLS entirely. Must never be exposed to the browser. |

### 2.2 Application roles (on data_studio_user_profiles.global_role)

These mirror the `StudioGlobalRole` type in `apps/web/lib/studio/access.ts`.

| App role | Description |
|---|---|
| `buildquote_admin` | Internal BuildQuote administrator. Universal cross-manufacturer access. Controls production publish. |
| `buildquote_reviewer` | Internal BuildQuote reviewer. Read/review access across all manufacturers. Cannot publish. |
| `manufacturer_user` | Manufacturer-side user. Access scoped to own workspace via `manufacturer_users` membership. |

### 2.3 Workspace membership roles (on manufacturer_users.role)

Only applies to users whose `global_role = 'manufacturer_user'`.

| Membership role | Description |
|---|---|
| `manufacturer_admin` | Manage workspace, upload documents, review/verify staged data, invite members. Cannot publish. |
| `manufacturer_reviewer` | Review and verify staged data, add notes. Cannot manage users or publish. |
| `manufacturer_viewer` | Read-only. Can view staged data and preview. Cannot edit, verify, upload, or publish. |

### 2.4 Identity flow

```
Browser request
  │
  ▼
Supabase Auth session (JWT)
  │  contains: auth.uid()
  ▼
data_studio_user_profiles
  │  auth_user_id = auth.uid()
  │  global_role  = 'buildquote_admin' | 'buildquote_reviewer' | 'manufacturer_user'
  ▼
manufacturer_users (for manufacturer_user only)
     user_profile_id → data_studio_user_profiles.id
     manufacturer_id → which workspace(s) they belong to
     role            → workspace-level permissions
```

RLS policies will use `auth.uid()` to look up the user profile row, then join to
`manufacturer_users` to determine workspace access. This lookup must be efficient —
the indexes added in migration 013 on `auth_user_id` and `user_profile_id` are essential.

---

## 3. Tables to Protect

### 3.1 Current RLS state (local dev as of migration 013)

| Table | RLS enabled | Existing policies | Assessment |
|---|---|---|---|
| `data_studio_manufacturers` | ✅ | SELECT only — `qual: true` (all rows, anon + authenticated) | Open read — needs scoping |
| `data_studio_user_profiles` | ❌ | None | Completely unprotected — high priority |
| `manufacturer_users` | ❌ | None | Completely unprotected — high priority |
| `workspace_invitations` | ❌ | None | Completely unprotected — high priority |
| `source_documents` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `extraction_runs` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `document_pages` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `document_chunks` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `staged_systems` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `staged_system_profiles` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `staged_components` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `staged_system_components` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `staged_system_colours` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `field_verifications` | ✅ | SELECT only — `qual: true` | Open read — needs scoping |
| `parser_field_evidence` | ❌ | None | Completely unprotected |
| `verification_events` | ❌ | None | Completely unprotected |
| `publish_batches` | ❌ | None | Completely unprotected — high priority |
| `publish_batch_items` | ❌ | None | Completely unprotected — high priority |

**Summary:** 11 tables have RLS enabled but only open-read convenience policies.
7 tables have RLS disabled entirely. No table has any INSERT/UPDATE/DELETE policy.
The parser insertion RPC is fully locked down (all EXECUTE grants revoked in migration 011).

### 3.2 Tables intentionally excluded from this plan

`document_pages` — page images and text. Same scoping as `document_chunks`.
Any additional tables added by future migrations should be assessed at migration time.

---

## 4. Access Rules by User Type

### buildquote_admin

- SELECT all rows across all manufacturers on all Studio tables
- INSERT/UPDATE on auth/membership tables (manage users, invite, suspend)
- INSERT/UPDATE on staging tables (corrections, reviewer notes, status changes)
- INSERT/UPDATE on `publish_batches` and `publish_batch_items`
- Trigger production publish via server-side flow only (service role, never browser RLS grant)
- Cannot bypass the server-side publish gate — even admin triggers must go through the server action

### buildquote_reviewer

- SELECT all rows across all manufacturers on all staging and review tables
- UPDATE limited to reviewer-facing fields: `verification_status`, `reviewer_notes` on staging tables
- INSERT into `verification_events` (audit rows only, never destructive)
- Cannot INSERT/UPDATE on `publish_batches` or `publish_batch_items`
- Cannot DELETE any row
- Cannot manage users or invitations without explicit future grant

### manufacturer_admin

- SELECT rows only for their own `manufacturer_id` on all staging tables
- INSERT `source_documents` for own manufacturer (once upload is wired)
- UPDATE limited fields on staged rows for own manufacturer (corrections, notes)
- INSERT into `verification_events` for own manufacturer rows
- INSERT/UPDATE `manufacturer_users` for own manufacturer (member management — deferred to V2)
- INSERT `workspace_invitations` for own manufacturer (deferred to V2)
- Cannot SELECT rows for other manufacturers
- Cannot SELECT `data_studio_user_profiles` other than their own row
- Cannot INSERT/UPDATE `publish_batches`
- Cannot DELETE any row

### manufacturer_reviewer

- SELECT rows only for own `manufacturer_id` on staging tables
- UPDATE `reviewer_notes` and add `verification_events` rows for own manufacturer data
- Cannot INSERT `source_documents`
- Cannot manage users or invitations
- Cannot INSERT/UPDATE `publish_batches`
- Cannot DELETE any row

### manufacturer_viewer

- SELECT only on own manufacturer staging rows
- No INSERT or UPDATE on any table
- No DELETE on any table

### Unauthenticated (anon)

- SELECT `data_studio_manufacturers` for the login page to resolve a workspace name if needed (optional — can be removed)
- No other access on any table
- The current open-read anon policies on staging tables must be removed before hosted deployment

---

## 5. Table-Level Policy Intent

The following uses shorthand for the scoping conditions that will appear in `USING` clauses:

- **is_bq_internal** — `global_role IN ('buildquote_admin','buildquote_reviewer')`
- **is_bq_admin** — `global_role = 'buildquote_admin'`
- **has_membership(manufacturer_id)** — active `manufacturer_users` row exists for `auth.uid()` and the given `manufacturer_id`
- **mfr_id_match** — row's `manufacturer_id` is in the set of `manufacturer_id` values the user has active membership for

Policies will reference `data_studio_user_profiles` via `auth.uid()` in a subquery or security-definer helper function.

---

### 5.1 `data_studio_user_profiles`

| Op | Who | Condition |
|---|---|---|
| SELECT | User | Own row only: `auth_user_id = auth.uid()` |
| SELECT | buildquote_admin/reviewer | All rows |
| INSERT | None (browser) | Profile created only via server-side auth trigger on signup |
| UPDATE | User | Own row only (display name, no role self-edit) |
| UPDATE | buildquote_admin | Any row (role, status) |
| DELETE | buildquote_admin | Only (rare — prefer suspend) |

**Note:** `global_role` must not be self-editable. The UPDATE policy for non-admin users
must exclude the `global_role` and `status` columns from the allowed field set,
or use a separate restricted policy.

---

### 5.2 `manufacturer_users`

| Op | Who | Condition |
|---|---|---|
| SELECT | User | Own row(s): `user_profile_id` matches their profile |
| SELECT | manufacturer_admin | All rows for own `manufacturer_id` |
| SELECT | buildquote_admin/reviewer | All rows |
| INSERT | buildquote_admin | Any |
| INSERT | manufacturer_admin | Own `manufacturer_id` only (deferred to V2) |
| UPDATE | buildquote_admin | Any |
| UPDATE | manufacturer_admin | Own `manufacturer_id` rows only — limited fields (deferred to V2) |
| DELETE | buildquote_admin | Only |

---

### 5.3 `workspace_invitations`

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_admin | Own `manufacturer_id` |
| SELECT | buildquote_admin/reviewer | All |
| INSERT | buildquote_admin | Any |
| INSERT | manufacturer_admin | Own `manufacturer_id` (deferred to V2) |
| UPDATE | Server-side only | Invitation acceptance handled by server-side function |
| DELETE | buildquote_admin | Only |

**Note:** The raw invitation token is never stored — only a hash. Acceptance must be
validated server-side with the plain token before any UPDATE to `status = 'accepted'`.

---

### 5.4 `data_studio_manufacturers`

| Op | Who | Condition |
|---|---|---|
| SELECT | authenticated | If buildquote internal → all rows. If manufacturer_user → own manufacturer only. |
| SELECT | anon | Remove current open policy. Restrict to zero or only name/slug lookup if needed for login flow. |
| INSERT | buildquote_admin | Only |
| UPDATE | buildquote_admin | Any |
| DELETE | buildquote_admin | Only |

---

### 5.5 `source_documents`, `extraction_runs`, `document_pages`, `document_chunks`

These tables are scoped to a `manufacturer_id` via `source_documents` (extraction_runs, pages, and chunks join back through `source_document_id`).

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_user | `mfr_id_match` on `source_documents.manufacturer_id`; for related tables, via JOIN |
| SELECT | buildquote_admin/reviewer | All |
| INSERT (`source_documents`) | manufacturer_admin/reviewer | Own `manufacturer_id` — when upload is wired |
| INSERT (`extraction_runs`, `document_pages`, `document_chunks`) | Server-side only | No browser INSERT |
| UPDATE | buildquote_admin | Any |
| DELETE | buildquote_admin | Only |

**Note:** Extraction pipeline writes (extraction_runs, document_pages, document_chunks)
should remain server-side only. No browser client should INSERT these rows directly.

---

### 5.6 `staged_systems`, `staged_system_profiles`, `staged_components`, `staged_system_components`, `staged_system_colours`

All scoped by `manufacturer_id` (direct on `staged_systems`/`staged_components`; via
join on `staged_system_profiles`/`staged_system_components`/`staged_system_colours`).

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_user | `mfr_id_match` |
| SELECT | buildquote_admin/reviewer | All |
| INSERT | Server-side only (parser RPC) | No direct browser INSERT |
| UPDATE | manufacturer_admin/reviewer | Own `manufacturer_id` — limited fields: `reviewer_notes`, `verification_status` |
| UPDATE | buildquote_admin/reviewer | Any row, any reviewer field |
| DELETE | buildquote_admin | Only |

**Correction model:** Staged data is corrected by updating `verification_status` and
`reviewer_notes` and appending a `verification_events` row, not by silent overwrite.
Direct field value edits (e.g. correcting a wrong name) should be logged in
`verification_events` with `old_value`/`new_value`. This preserves the audit trail.

---

### 5.7 `field_verifications`, `parser_field_evidence`

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_user | Via staged row JOIN to manufacturer_id |
| SELECT | buildquote_admin/reviewer | All |
| INSERT | Server-side only | No browser INSERT for `parser_field_evidence` |
| INSERT | manufacturer_admin/reviewer | `field_verifications` only — for own manufacturer staged rows |
| UPDATE | buildquote_admin/reviewer | Any |
| DELETE | None | Append-only; no delete |

---

### 5.8 `verification_events`

Append-only audit log. Every verification action (approve, reject, flag, edit) appends a row.

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_user | Rows where entity belongs to own manufacturer |
| SELECT | buildquote_admin/reviewer | All |
| INSERT | authenticated user | Must be writing an event for an entity in their accessible manufacturer(s) |
| UPDATE | None | Append-only. No updates ever. |
| DELETE | None | Append-only. No deletes ever. |

**Note:** A `CHECK` constraint should enforce that the entity referenced actually exists
and belongs to the correct manufacturer. Alternatively, validate server-side before
allowing browser INSERT.

---

### 5.9 `publish_batches`, `publish_batch_items`

| Op | Who | Condition |
|---|---|---|
| SELECT | manufacturer_user | Own `manufacturer_id` rows — read-only status view |
| SELECT | buildquote_admin/reviewer | All |
| INSERT | buildquote_admin | Only (or server-side action) |
| UPDATE | buildquote_admin | Only |
| UPDATE (status → `migrated_to_production`) | Server-side service_role only | No browser policy ever grants this |
| DELETE | None | No delete |

**Critical:** The status transition to `migrated_to_production` must never be writable
from a browser session regardless of role. Even `buildquote_admin` browser sessions
must trigger this via a server-side action that uses the service role key.

---

## 6. Parser Insertion RPC

`insert_parser_output_plan_v1` is currently locked: EXECUTE revoked from `anon`,
`authenticated`, and `service_role` (migration 011).

This must remain the case. Policy intent:

- Do not grant EXECUTE to `anon`
- Do not grant EXECUTE to `authenticated` (any role)
- Do not grant EXECUTE to `service_role` unless a deliberate server-side action is approved and the full insert logic is validated
- When the real parser insertion is wired, execution must happen via a Next.js server action or API route that holds the service role key server-side — never a client component fetch
- No browser tab should ever be able to call this function directly
- The service role key must never appear in any `NEXT_PUBLIC_*` env var

Future grant sequence when insert logic is ready:
```sql
-- Only after full RLS/auth is in place and insert logic validated:
GRANT EXECUTE ON FUNCTION public.insert_parser_output_plan_v1(jsonb) TO service_role;
-- Execution path: server action → service role client → RPC → staged tables
```

---

## 7. Upload / Storage / R2 Future

Storage policy design is deferred until the upload pipeline is chosen and ready.
This section captures intent only.

**Storage provider:** Cloudflare R2 or Supabase Storage (decision deferred — see docs/storage-architecture.md).

**Path convention intent:**
```
{storage_bucket}/{manufacturer_id}/{source_document_id}/{filename}
```
Including `manufacturer_id` in the path means storage policies can enforce workspace isolation
without complex joins.

**Access intent:**

| Actor | Can do |
|---|---|
| manufacturer_admin/reviewer | Upload to own `manufacturer_id` path only |
| buildquote_admin/reviewer | Read any path |
| manufacturer_viewer | Read own `manufacturer_id` path only |
| anon | No access |

**Signed URL policy:** Source documents are private. Pre-signed URLs with short TTL
(e.g. 15 minutes) should be generated server-side. No long-lived public URLs for
manufacturer source documents.

**Parser output** (extracted page images if any) should follow the same path convention
and be accessible only to users with the correct manufacturer membership.

---

## 8. Public Preview vs Private Data

Studio operates entirely in authenticated/private space:

| Data state | Visibility |
|---|---|
| Draft staged data | Private — authenticated Studio users only, scoped to manufacturer |
| Approved-but-unpublished data | Private — same as draft. Approval changes internal status only. |
| Published data | Copied to production RFQ/MFP Supabase project. Visible publicly on the production site. |

Studio preview pages (`/manufacturer/preview`, `/admin/manufacturers/[id]/preview`) render
staged data inside the authenticated Studio shell. They do not expose data publicly.

The preview UI must clearly display the current state (Draft / Approved / Published) so
manufacturers always understand whether they are looking at private staged data or live
published output.

**No staged or draft data should be accessible to `anon` after the development convenience
policies are removed.** The current open-read anon policies on all staging tables are a
local-dev convenience only.

---

## 9. RLS Implementation Order

Each phase gates the next. Do not skip ahead.

| Phase | Action | Risk if skipped |
|---|---|---|
| 1 | Confirm auth table constraints and roles are correct (migration 013 is done) | Incorrect role/status values reach RLS policies |
| 2 | Wire Supabase Auth in local Studio project — email/password sign-in | Cannot test policies without a real session |
| 3 | Create auth trigger: on `auth.users` INSERT → INSERT into `data_studio_user_profiles` | User profiles won't exist for RLS lookups |
| 4 | Seed one `buildquote_admin` test user in local dev | Cannot test admin-side policies |
| 5 | Enable RLS on `data_studio_user_profiles`, `manufacturer_users`, `workspace_invitations` — add scoped SELECT policies | Auth tables unprotected |
| 6 | Replace all open-read convenience policies on staging tables with manufacturer-scoped equivalents | Cross-manufacturer data leak |
| 7 | Add scoped SELECT policies on `publish_batches`, `publish_batch_items` | Publish data unprotected |
| 8 | Add limited UPDATE policies for reviewer/manufacturer fields on staging tables | No browser verify actions possible |
| 9 | Add INSERT policies for verification_events | Cannot log audit trail from browser |
| 10 | Design and add document upload policies once storage provider is confirmed | Uploads blocked or unscoped |
| 11 | Re-enable parser RPC execute grant for service_role only, wired through server action | Parser inserts blocked in production |
| 12 | Full multi-user test in local Supabase with at least: admin user, manufacturer_admin, manufacturer_viewer | Policy gaps surface only under real role switching |
| 13 | Deploy to hosted Supabase Studio project only after local multi-user test passes | Silent policy gaps in production |

---

## 10. Risks and Gotchas

### Enabling RLS without policies blocks everything
When `ALTER TABLE t ENABLE ROW LEVEL SECURITY` is run without any policy, **all access
is denied by default** — including selects. Never enable RLS on a table and deploy before
also adding at least the required read policies. Always pair: enable + policies in the
same migration.

### `qual: true` policies are open to all rows
All current policies use `USING (true)`. This is the same as no filter — every row is
visible to the allowed role. These must be replaced with scoped `USING` clauses that
reference `auth.uid()` and join to `data_studio_user_profiles`/`manufacturer_users`.

### Policies can accidentally expose cross-manufacturer data
If a `USING` clause joins incorrectly or uses an OR condition too broadly, manufacturer A's
data could become visible to manufacturer B's users. Each staging table's policy must
explicitly filter by `manufacturer_id` matching the user's active memberships.

### service_role bypasses RLS
The Supabase service role key bypasses all RLS policies. This is intentional for
server-side admin operations, but it means:
- The service role key must only exist in server-side environment variables
- It must never appear in a `NEXT_PUBLIC_*` variable
- It must never be shipped to the browser in any form
- Next.js server actions and API routes that use service role must never return the key itself

### Anon policies on staging tables must be removed before hosted deployment
Migrations 004–006 added `anon can read ...` policies on all staging tables for local dev
convenience. These policies grant unauthenticated read access to all manufacturer source
documents, staged systems, profiles, components, and colours. They must be replaced with
scoped policies before any hosted deployment.

### Browser-side writes to staged/parser tables must remain blocked
No browser client should INSERT or UPDATE extraction_runs, document_pages, document_chunks,
or any row that the parser insertion RPC is responsible for. Even when a manufacturer user
is authenticated, their session must not be able to directly write parser output rows.
These writes go through server-side actions only.

### Production Supabase is separate — do not run Studio migrations against it
Studio migrations target the Studio Supabase project only. Running them against the
production RFQ/MFP Supabase project would create Studio-specific tables in a public schema,
conflict with production RLS policies, and potentially expose manufacturer private data.

### Policy testing requires real session switching
Policies can only be verified by creating test users with each role, signing in, and
confirming the correct access. TypeScript type checks and migration dry-runs do not
validate policy correctness. Plan a deliberate multi-user test session before any hosted
deployment.

---

## 11. Open Decisions

These must be resolved before Phase 5–8 of the implementation order above.

| # | Decision | Impact |
|---|---|---|
| 1 | Can `buildquote_reviewer` UPDATE staged data fields, or only add `reviewer_notes` and `verification_events`? | Determines UPDATE policy scope for reviewer role |
| 2 | Can `manufacturer_admin` invite workspace members in V1, or is invitation BuildQuote-admin-only initially? | Determines INSERT policy on `workspace_invitations` |
| 3 | Can manufacturer users directly edit extracted field values, or only flag/request changes (which a BuildQuote reviewer then applies)? | Determines UPDATE column list on staging tables for manufacturer roles |
| 4 | How are document storage paths structured? (R2 vs Supabase Storage, path convention) | Determines storage RLS policy design |
| 5 | Are `publish_batches` always admin-only for INSERT/UPDATE, or will there be a manufacturer-triggered "submit for review" action? | Determines `publish_batches` INSERT policy |
| 6 | What is the exact auth trigger / profile creation approach? (Supabase trigger function vs server action at sign-up) | Determines Phase 3 of implementation order |
| 7 | Should there be a `buildquote_reviewer` test user seeded in local dev, or only `buildquote_admin`? | Scope of local dev seed |
| 8 | How long should signed URLs for source documents be valid? (15 min / 1 hour?) | Storage policy and server action design |
| 9 | Will manufacturer_viewer ever have access to a read-only API endpoint for embed/widget data, or is that always via the published production tables? | Determines whether any Studio table needs a public/anon policy post-publish |
