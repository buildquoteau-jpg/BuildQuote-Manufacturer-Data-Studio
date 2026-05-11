# Auth and Workspaces

## Overview

BuildQuote Data Studio uses a workspace model where each manufacturer organisation has its own workspace. Users are members of one or more workspaces with a defined role within that workspace. An additional global role controls access to BuildQuote-internal admin capabilities.

Auth is provided by Supabase Auth. Data Studio does not implement its own session management.

---

## Workspace Concept

A **workspace** is a manufacturer organisation in Data Studio. It maps to a row in `data_studio_manufacturers`.

A workspace owns:
- Source documents (uploaded PDFs/product guides)
- Extraction runs
- Staged systems, components, colours, profiles
- Verification work (field_verifications, verification_events)
- Publish batches

All rows in the staging database that are manufacturer-scoped carry a `manufacturer_id` foreign key. Row-level security (RLS) will enforce that users can only access rows belonging to workspaces they are members of.

---

## User Profile Concept

Every authenticated Data Studio user has a row in `data_studio_user_profiles`.

This profile stores:
- `auth_user_id` — the Supabase Auth UUID (unique, used for RLS lookups)
- `email` — for display and invitation matching
- `full_name` — display name
- `global_role` — the user's system-level role (see below)
- `status` — active / suspended

The `global_role` on the user profile determines whether the user is a BuildQuote internal user or a manufacturer-side user. Manufacturer-specific permissions are determined by the `manufacturer_users` membership row, not the global profile alone.

---

## Manufacturer Membership Concept

A user becomes a member of a workspace via a row in `manufacturer_users`.

This table links:
- `user_profile_id` → `data_studio_user_profiles.id`
- `manufacturer_id` → `data_studio_manufacturers.id`
- `role` → the user's role within this specific workspace
- `status` → invited / active / suspended

A user may be a member of multiple workspaces (e.g. a BuildQuote reviewer who is assigned to review several manufacturers). Their access to each workspace is governed by the `manufacturer_users` row for that workspace.

---

## Invitation Concept

New workspace members are invited via the `workspace_invitations` table before they have a Data Studio account.

Flow:
1. A `manufacturer_admin` (or `buildquote_admin`) creates an invitation for an email address.
2. A row is created in `workspace_invitations` with `status = 'pending'` and a token hash.
3. The invited user receives an email with a link containing the token.
4. When the user clicks the link and signs up/logs in, the invitation is accepted.
5. A `manufacturer_users` row is created linking their new `data_studio_user_profiles` row to the workspace.
6. `workspace_invitations.status` → `'accepted'`.

Invitations have an `expires_at` timestamp. Expired invitations cannot be accepted.

---

## Roles and Permissions

### Global Roles (on data_studio_user_profiles)

| Global role | Description |
|---|---|
| `manufacturer_user` | Default for manufacturer-side users. Permissions within a workspace are governed by their `manufacturer_users.role`. |
| `buildquote_reviewer` | Internal BuildQuote reviewer. Can access all manufacturers' data for review. Cannot manage system settings. |
| `buildquote_admin` | Internal BuildQuote administrator. Full access across all workspaces. Controls final production publishing. |

### Workspace Roles (on manufacturer_users)

| Workspace role | Permissions |
|---|---|
| `manufacturer_admin` | Manage workspace members. Upload source documents. Trigger extraction. Verify and edit staged data. Mark data ready for BuildQuote review. Cannot directly migrate to production unless explicitly granted. |
| `manufacturer_reviewer` | Upload source documents (if allowed by workspace settings). Review and verify staged data. Add reviewer notes. Cannot manage workspace users. Cannot publish to production. |

### BuildQuote Internal Roles

| Role | Permissions |
|---|---|
| `buildquote_admin` | See all manufacturers. Approve final export/migration to production. Manage publish batches. Override, reject, or return data to manufacturer for correction. |
| `buildquote_reviewer` | Review and verify data across all manufacturers. Request changes. Cannot manage system-level settings or approve production migration. |

---

## Why Manufacturer Verification Is Not Production Publishing

Manufacturer users verify that the AI-extracted data accurately reflects their own source documents. This is a trust step: they confirm their product information is correct.

But verification by a manufacturer does not automatically mean the data is ready for production. BuildQuote retains final control over what enters the production Supabase project for two reasons:

1. **Data quality gate** — BuildQuote can review the data shape, field completeness, and consistency against existing production records before committing it.
2. **Schema safety gate** — production migrations are server-side operations using service-role credentials. Manufacturer users must never have the ability to trigger a production write, even indirectly.

The publish flow is:
```
Manufacturer verifies staged data
        │
        ▼
Manufacturer marks data ready for BuildQuote review
        │
        ▼
BuildQuote reviewer checks and approves
        │
        ▼
BuildQuote admin triggers controlled export/migration (server-side, service role only)
        │
        ▼
Production Supabase updated
```

---

## Intended RLS Rules (not yet implemented)

These rules describe the intent. Full Supabase RLS policies will be written in a later migration.

### General manufacturer data access

- A user with `global_role = 'manufacturer_user'` may only read/write rows where `manufacturer_id` is in the set of workspaces they have an active `manufacturer_users` membership for.
- Write access within a workspace is further scoped by `manufacturer_users.role` (admin vs reviewer).

### BuildQuote internal access

- A user with `global_role = 'buildquote_reviewer'` may read all rows across all manufacturers. Write access is limited to verification notes and status updates.
- A user with `global_role = 'buildquote_admin'` has full read/write access across all manufacturers and may approve publish batches.

### Publishing / production migration

- Production migration is server-side only, using the Supabase service role key.
- No RLS policy grants a browser client the ability to write to production tables.
- `publish_batches` and `publish_batch_items` may only transition to `migrated_to_production` status via a server-side process, not a browser client.

### R2 access

- R2 credentials are server-side only.
- Signed URLs for source document access are generated server-side with a short TTL.
- No client ever holds long-lived R2 credentials.
