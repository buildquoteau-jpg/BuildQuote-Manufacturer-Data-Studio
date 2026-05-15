# Studio Auth, Dashboard & Schema Plan

**Status:** Planning only. No migrations, no UI, no RLS, no uploads, no auth implementation yet.

---

## 1. Studio-Only Auth Architecture

BuildQuote Data Studio is a **private, standalone application**. It has its own dedicated Supabase project (future hosted instance). It does not share auth, sessions, or user tables with RFQ or MFP.

```
┌──────────────────────────────────────────────────────┐
│              BuildQuote Data Studio                  │
│                                                      │
│   Supabase Auth (Studio project only)                │
│   data_studio_user_profiles                          │
│   manufacturer_users (workspace membership)          │
│   workspace_invitations                              │
│                                                      │
│   Manufacturers log in here only.                    │
│   Manufacturers never touch RFQ or MFP directly.    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│   RFQ / MFP (public-facing production projects)      │
│                                                      │
│   Separate Supabase projects.                        │
│   No manufacturer login tables here.                 │
│   Data flows in only via server-side admin publish.  │
└──────────────────────────────────────────────────────┘
```

Key rules:
- Supabase Auth belongs to the **Studio Supabase project** exclusively.
- Manufacturers sign into Studio only. They have no credentials in RFQ or MFP.
- Production publish is a server-side, service-role-only operation. No browser client writes to production.
- RFQ and MFP remain unaware of manufacturer identity at runtime.

---

## 2. Required Studio Tables

### 2.1 `data_studio_user_profiles`

Stores every authenticated Studio user regardless of their role.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `auth_user_id` | uuid unique | Supabase Auth UUID |
| `email` | text unique | For display and invitation matching |
| `full_name` | text | Display name |
| `global_role` | text | `buildquote_admin` or `manufacturer_user` |
| `status` | text | `active` / `suspended` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Notes:
- `global_role` is the system-level role. It is not enough on its own for manufacturer users — they also need an active `manufacturer_users` membership row.
- `buildquote_admin` users do not need a `manufacturer_users` row; their global role grants cross-manufacturer access.

### 2.2 `manufacturer_users`

Links a user profile to a specific manufacturer workspace and defines their role within it.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_profile_id` | uuid FK → `data_studio_user_profiles.id` | |
| `manufacturer_id` | uuid FK → `data_studio_manufacturers.id` | |
| `role` | text | `manufacturer_admin` / `manufacturer_reviewer` / `manufacturer_viewer` |
| `status` | text | `invited` / `active` / `suspended` |
| `invited_at` | timestamptz | |
| `accepted_at` | timestamptz | nullable |
| `created_at` | timestamptz | |

Unique constraint on `(user_profile_id, manufacturer_id)` — one membership row per user per workspace.

A user may hold membership in multiple manufacturer workspaces (e.g. a contractor who handles multiple brands). Each membership is independent.

### 2.3 `workspace_invitations`

Manages the pre-signup invitation flow before a user has a Studio account.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `manufacturer_id` | uuid FK → `data_studio_manufacturers.id` | |
| `invited_email` | text | Target email address |
| `role` | text | Role to assign on acceptance |
| `token_hash` | text | Hashed one-time token sent by email |
| `status` | text | `pending` / `accepted` / `expired` / `revoked` |
| `invited_by` | uuid FK → `data_studio_user_profiles.id` | Who sent the invite |
| `expires_at` | timestamptz | |
| `accepted_at` | timestamptz | nullable |
| `created_at` | timestamptz | |

### 2.4 `data_studio_manufacturers` (already exists or planned)

One row per manufacturer workspace. Referenced by all other tables.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | Display name |
| `slug` | text unique | URL-safe identifier |
| `status` | text | `active` / `inactive` / `archived` |
| `created_at` | timestamptz | |

This table is the anchor for all manufacturer-scoped data. Not a new addition — confirm against existing migrations before writing a new one.

### Decision: no separate workspace table

A "workspace" is just `data_studio_manufacturers`. No separate `workspaces` table is needed because each manufacturer is exactly one workspace. Adding a separate abstraction layer would be premature.

---

## 3. Roles

### 3.1 Global Roles (`data_studio_user_profiles.global_role`)

| Role | Description |
|---|---|
| `buildquote_admin` | Internal BuildQuote administrator. Full read/write access across all manufacturers. Controls production publish. Can manage all workspace members. Can preview and approve all staged data. |
| `manufacturer_user` | Manufacturer-side user. Access is scoped to workspaces they have an active `manufacturer_users` row for. The specific permissions within a workspace are determined by `manufacturer_users.role`. |

### 3.2 Manufacturer Workspace Roles (`manufacturer_users.role`)

| Role | Description |
|---|---|
| `manufacturer_admin` | Manage workspace members. Upload source documents. Trigger extraction runs. Edit staged data. Mark data ready for BuildQuote review. Cannot publish to production. |
| `manufacturer_reviewer` | Upload documents (if workspace allows). Review and verify staged data. Add notes. Cannot manage workspace users. Cannot publish. |
| `manufacturer_viewer` | Read-only access to workspace data. Can view staged systems, review status, preview. Cannot upload, edit, or manage members. |

### 3.3 Role Hierarchy Summary

```
buildquote_admin
  └─ sees all manufacturers
  └─ approves production publish
  └─ can act as any reviewer within Studio

manufacturer_user (global) + manufacturer_admin (workspace)
  └─ manages their workspace
  └─ uploads + reviews
  └─ cannot see other manufacturers
  └─ cannot publish to production

manufacturer_user (global) + manufacturer_reviewer (workspace)
  └─ reviews and verifies staged data
  └─ cannot manage users
  └─ cannot publish

manufacturer_user (global) + manufacturer_viewer (workspace)
  └─ read-only
  └─ can preview public page/widget draft
```

---

## 4. Access Rules

| Actor | Can access | Cannot access |
|---|---|---|
| `buildquote_admin` | All manufacturers, all staged data, all publish batches | — |
| `manufacturer_admin` | Own manufacturer's data only | Other manufacturers' data |
| `manufacturer_reviewer` | Own manufacturer's staged data (read/verify) | User management, other manufacturers |
| `manufacturer_viewer` | Own manufacturer's staged data (read-only), preview | Editing, uploading, user management |
| Any manufacturer user | Studio only | RFQ tables, MFP tables, production Supabase |

Additional access rules:
- Manufacturer users **cannot trigger production publish** under any circumstance.
- Production publish is a server-side operation using the Supabase service role key.
- No browser client holds service role credentials.
- Parser insertion RPC calls are admin/server-side only.
- Manufacturer users can see preview of their staged data but the preview is clearly marked draft/staged — it does not represent live public data.

---

## 5. Dashboard Routes

All routes are within the Studio application only.

### Auth routes

| Route | Description |
|---|---|
| `/login` | Supabase Auth sign-in form. Email + password. Magic link option later. |
| `/accept-invitation` | Handles invitation token redemption on first login. |
| `/forgot-password` | Password reset flow via Supabase Auth. |

### BuildQuote admin routes

| Route | Who | Description |
|---|---|---|
| `/admin/manufacturers` | `buildquote_admin` | List all manufacturer workspaces with status summary. |
| `/admin/manufacturers/[manufacturerId]` | `buildquote_admin` | Full manufacturer workspace view — documents, extraction runs, staged data, review status. |
| `/admin/manufacturers/[manufacturerId]/preview` | `buildquote_admin` | Preview the manufacturer's future public page (draft or approved state). |
| `/admin/manufacturers/[manufacturerId]/widget-preview` | `buildquote_admin` | Preview the embeddable widget for this manufacturer's system cards. |

### Manufacturer routes

| Route | Who | Description |
|---|---|---|
| `/dashboard` | All authenticated users | Landing page after login. Admin sees cross-manufacturer summary. Manufacturer users see their workspace. |
| `/manufacturer/dashboard` | `manufacturer_user` | Workspace overview — document count, extraction status, review progress, publish status. |
| `/manufacturer/documents` | `manufacturer_user` | Upload and manage source documents (PDFs, product guides). |
| `/manufacturer/review` | `manufacturer_user` | Review extracted systems, profiles, components, colours. Mark fields verified or flag for correction. |
| `/manufacturer/preview` | `manufacturer_user` | Preview their public page/widget in draft state. Read-only view of how their data will appear. |
| `/manufacturer/help` | `manufacturer_user` | Contact BuildQuote support. Help resources. |

### Route protection rules
- `/admin/*` — `buildquote_admin` only. Redirect to `/dashboard` if not admin.
- `/manufacturer/*` — `manufacturer_user` with at least one active workspace. Redirect to `/login` if unauthenticated.
- `/dashboard` — any authenticated user. Redirects based on `global_role`.
- Unauthenticated users are redirected to `/login` from all protected routes.

---

## 6. Manufacturer Dashboard Sections

The `/manufacturer/dashboard` and `/admin/manufacturers/[manufacturerId]` views should expose the following sections:

### Documents
- List of uploaded source documents (PDF, product guide, price list)
- Upload date, uploader, file name, file size
- Processing status (pending / processing / complete / error)
- Link to view extraction run(s) associated with each document

### Extraction Runs
- List of extraction runs triggered from documents
- Run date, model/parser version used, status
- Summary: systems found, components found, errors
- Link to view staged output

### Staged Systems
- List of systems extracted and staged from extraction runs
- System name, series, type, status (draft / under review / approved / rejected)
- Link to full staged system detail

### Profiles / Variants
- Per-system profile list (e.g. 50 series, 65 series)
- Frame depth, thermal break, configuration options
- Verification status

### Components / Accessories
- Components linked to each system
- Hardware, gaskets, reinforcement, glass options
- Verification status

### Colours / Finishes
- Colour/finish options linked to systems or manufacturer-wide
- Powder coat, anodised, timber, special finish
- Verification status

### Review Status
- Overall workspace review progress
- Fields verified vs pending vs flagged
- Items awaiting BuildQuote review
- Items returned by BuildQuote for correction

### Preview
- Link to preview public manufacturer page (draft)
- Link to preview embeddable widget (draft)
- Clearly labelled with current state: Draft / Approved / Published

### Help / Support
- Contact BuildQuote support (see Section 8)

---

## 7. Public Page / Widget Preview Inside Studio

The Studio preview is a **read-only internal view** showing how manufacturer data will appear publicly after publish. It is not a live public page. It does not represent anything in RFQ or MFP at the time of preview.

### Preview access
- `buildquote_admin`: full preview of any manufacturer at any data state
- `manufacturer_admin` / `manufacturer_reviewer` / `manufacturer_viewer`: preview of their own workspace only

### What the preview should show

**Manufacturer public page preview:**
- Manufacturer logo and name
- Manufacturer description / about text
- Hero banner (if provided)
- All approved or staged system cards for this manufacturer
- System card buttons (e.g. "View system", "Download datasheet")
- Per-system: profiles/variants summary
- Per-system: components/accessories summary
- Colours/finishes (if applicable)
- "Add to RFQ" / "Request quote" style button (visual preview only — not functional in Studio)

**Embedded widget preview:**
- A simulated widget embed view showing how system cards would appear if embedded by a supplier or store
- Widget frame, dimensions, branding
- System cards within the widget
- "Request quote" / "Add to RFQ" CTA style (visual only in Studio)

### Preview states

| State label | Meaning |
|---|---|
| **Draft** | Staged data exists but has not been approved by BuildQuote. May have unverified fields. |
| **Approved** | BuildQuote has reviewed and approved this data. Ready for publish when admin triggers it. |
| **Published (live)** | Data has been migrated to production. Public page/widget is live. (Post-launch state — not available in early Studio.) |

The preview UI must clearly display the current state in a visible banner or badge so manufacturers and admins always know whether they are looking at draft, approved, or live data.

### What preview is NOT
- The preview does not write anything to RFQ or MFP.
- The preview does not make manufacturer data publicly visible.
- The preview is a Studio-internal view only.
- Manufacturers cannot trigger publish from the preview screen.

---

## 8. Help / Support Design

The `/manufacturer/help` route should provide:

**Primary contact:**
```
Email: support@buildquote.com.au
```
Implemented as a `mailto:support@buildquote.com.au` link. No hard-coded private mobile numbers.

**Optional future additions (do not implement yet):**
- WhatsApp Business link — add once a dedicated business number is confirmed
- In-app support ticket form — if warranted by volume
- FAQ / knowledge base section

**Help page sections (planned):**
- Getting started guide
- How to upload documents
- Understanding extraction results
- How to verify and correct staged data
- Understanding the review and publish workflow
- Contact BuildQuote support

---

## 9. RLS Strategy

RLS policies will be written in a dedicated migration after the schema and auth shell are in place. This section documents intent only.

### Core principles

1. **No browser client writes to sensitive tables without RLS in place.** Until policies are applied to a table, that table must not be writable from the browser.
2. **Parser insertion RPC stays server-side.** The parser writes to staging tables via a server-side RPC with the service role key. No browser client calls parser insertion directly.
3. **Manufacturer users are row-scoped to their manufacturer.** Any table with a `manufacturer_id` column should have an RLS policy that validates the user's `manufacturer_users` membership.
4. **Admin bypass.** `buildquote_admin` users bypass manufacturer scoping. Their global role grants cross-manufacturer access.

### Intended policies by table

**`data_studio_user_profiles`**
- SELECT: user can read their own row. `buildquote_admin` can read all.
- UPDATE: user can update their own row (name, etc). `buildquote_admin` can update any.
- INSERT: only via auth trigger (server-side on Supabase Auth signup).
- DELETE: admin only.

**`manufacturer_users`**
- SELECT: user can read their own membership rows. `manufacturer_admin` can read membership rows for their manufacturer. `buildquote_admin` can read all.
- INSERT: `manufacturer_admin` for their workspace. `buildquote_admin` for any.
- UPDATE: same as INSERT.
- DELETE: `buildquote_admin` only.

**`workspace_invitations`**
- SELECT: `manufacturer_admin` for their workspace. `buildquote_admin` for all.
- INSERT: `manufacturer_admin` for their workspace. `buildquote_admin` for any.
- UPDATE (accept): server-side function only (on invitation acceptance).
- DELETE: `buildquote_admin` only.

**Manufacturer-scoped staging tables** (documents, extraction_runs, staged_systems, staged_profiles, staged_components, staged_colours, etc.)
- SELECT: user must have an active `manufacturer_users` row for the relevant `manufacturer_id`.
- INSERT/UPDATE: user must have `manufacturer_admin` or `manufacturer_reviewer` role in the relevant workspace.
- DELETE: `buildquote_admin` only, or `manufacturer_admin` for draft items.

**`publish_batches` / `publish_batch_items`**
- SELECT: `buildquote_admin` or workspace member for their manufacturer.
- INSERT/UPDATE: `buildquote_admin` only.
- Status transitions to `migrated_to_production`: server-side only via service role.

---

## 10. Implementation Order

Recommended sequence. Each phase is a gate — do not move to the next until the current phase is stable.

### Phase 1 — Schema design (now)
- Finalise table designs: `data_studio_user_profiles`, `manufacturer_users`, `workspace_invitations`
- Confirm `data_studio_manufacturers` column list
- Review against existing migrations for conflicts
- Output: additive migration file (no destructive changes, no production touches)

### Phase 2 — Auth migration
- Write migration for the three new auth/membership tables
- Seed one `buildquote_admin` placeholder user if appropriate (dev only — no real credentials in seed files)
- Test migration locally with `supabase db reset` against local Supabase only

### Phase 3 — Login shell
- Build `/login` route
- Wire Supabase Auth sign-in (email + password)
- Build session provider / auth context
- Redirect unauthenticated requests to `/login`
- No dashboard content yet — just a confirmed auth round-trip

### Phase 4 — Protected dashboard shell
- Build `/dashboard` route with role-based redirect logic
- Build `/manufacturer/dashboard` shell (empty sections, correct layout)
- Build `/admin/manufacturers` shell (empty list, correct layout)
- Confirm routes are protected — unauthenticated redirects to `/login`, wrong role redirects correctly
- No real data yet

### Phase 5 — RLS policies
- Write RLS policies for all auth/membership tables
- Write RLS policies for existing staging tables
- Test with manufacturer user persona (limited to own workspace)
- Test with admin persona (full access)
- Do not connect uploads or review actions until RLS is confirmed working

### Phase 6 — Document upload + extraction connection
- Connect `/manufacturer/documents` to storage (R2 or Supabase Storage)
- Wire upload triggers to extraction pipeline
- Only after RLS is in place

### Phase 7 — Review + verification UI
- Build `/manufacturer/review` sections
- Verification flows for systems, profiles, components, colours
- BuildQuote reviewer workflow in `/admin/manufacturers/[manufacturerId]`

### Phase 8 — Preview UI
- Build `/manufacturer/preview` and `/admin/manufacturers/[manufacturerId]/preview`
- Implement public page preview component
- Implement widget preview component
- Clearly display draft / approved / published state badge

### Phase 9 — Publish flow
- Build publish batch management in admin
- Server-side publish trigger (service role, never browser)
- Status transitions and audit trail
- Connect preview to live state after first successful production publish

### Phase 10 — Help + support page
- Build `/manufacturer/help`
- Static content + `mailto:support@buildquote.com.au`
- WhatsApp Business link when business number is confirmed

---

## Appendix: What This Plan Does Not Cover

The following are explicitly out of scope for this planning document. They will be addressed in dedicated design docs when the relevant phase is reached:

- Supabase Storage vs Cloudflare R2 final selection
- Docling / AI parser integration details
- Production schema mapping from Studio staging to RFQ/MFP
- Publish batch migration scripts
- Email delivery (invitation emails, notifications)
- Audit log schema
- Multi-manufacturer contractor user flows (edge case)
- Public manufacturer page URL structure in RFQ/MFP
- Widget embed implementation details
- Billing or subscription model (if any)
