# Supabase Local Setup — BuildQuote Data Studio

This document explains how Data Studio Supabase is structured, how it differs from production Supabase, and how local development will be set up when you are ready.

**Do not run any Supabase commands until you have read this document and confirmed you are ready.**

---

## 1. Purpose — Two Separate Supabase Projects

Data Studio uses its **own Supabase project**, completely separate from the production BuildQuote Supabase project.

| Project | Purpose |
|---|---|
| **Data Studio Supabase** | Document uploads, extraction runs, staged systems/components, field verification, publish batches. This is where all ingestion and review work happens. |
| **Production Supabase** | Live RFQ app, live Manufacturer Portal, live user accounts, live approved catalogue data. BuildQuote admin controls this. |

These are separate Supabase projects with separate URLs, separate service role keys, and separate databases. They must never be mixed.

---

## 2. Safety Rules

### Never run Data Studio migrations against production Supabase.

Every migration in `supabase/migrations/` is for the Data Studio database only. The production Supabase schema is managed in a separate repo and a separate project. Running Data Studio migrations against production would corrupt the live app.

### Never store production service role keys in this repo.

The production service role key is used only by the server-side export pipeline (`pipelines/publishing/`) at the point of final controlled migration. It must never appear in `.env` files, environment variable templates, or any file committed to this repo.

### Use separate environment variable namespaces.

Three distinct credential sets are needed at different stages:

| Variable | Purpose | Where used |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Data Studio Supabase URL | Browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Data Studio anon key (safe for browser) | Browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Data Studio service role (admin operations) | Server-side only |
| `PRODUCTION_SUPABASE_URL` | Production Supabase URL | Server-side export only (future) |
| `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` | Production service role key | Server-side export only (future) |

`SUPABASE_SERVICE_ROLE_KEY` must never be used in browser code or passed to `NEXT_PUBLIC_*` variables. `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` is for a future server-side export step only and must never appear in browser code.

---

## 3. Local Setup Steps (Run When Ready)

These steps document what to do when you are ready to initialise a local Supabase instance. **Do not run these commands now.** Run them only after:

- Supabase CLI is installed (`npm install -g supabase` or via your package manager)
- You are in the `buildquote-data-studio` directory
- You have confirmed you are working locally, not against a remote project

### Step 1 — Initialise Supabase (first time only)

```bash
supabase init
```

Creates `supabase/config.toml` if it does not already exist. This file configures the local Supabase instance.

### Step 2 — Start local Supabase

```bash
supabase start
```

Starts a local Supabase stack (Postgres, Auth, Storage, Studio) using Docker. On first run this will pull Docker images — allow a few minutes.

Once started, Supabase will print local credentials including `Project URL`, `Publishable` key (anon key), and `Secret` key (service role). Use these in a `.env.local` file (never commit this file).

### Step 3 — Apply migrations

```bash
supabase db reset
```

Drops and recreates the local database, then applies all migrations in order. Run this whenever you want a clean local state.

Migrations are applied in filename order:

```
001_initial_extraction_schema.sql
002_field_verification_state.sql
003_manufacturer_workspaces.sql
```

See Section 4 below for migration order details.

### Step 4 — Create your `.env.local` file

After `supabase start`, copy the printed credentials into a new file called `.env.local` at the repo root. Use the placeholder names from Section 6 (which match `.env.example`). This file must not be committed — it is listed in `.gitignore`.

---

## 4. Migration Order

Migrations must be applied in this order. They are numbered to ensure correct dependency resolution.

| File | Contents |
|---|---|
| `001_initial_extraction_schema.sql` | Core tables: manufacturers, source documents, extraction runs, document pages/chunks, staged systems/components, verification events, publish batches |
| `002_field_verification_state.sql` | `field_verifications` table — current field-level verification state used by the verification UI |
| `003_manufacturer_workspaces.sql` | User profiles, workspace invitations, and additional columns on `manufacturer_users` |

`supabase db reset` handles this order automatically based on filename prefix.

---

## 5. Remote Data Studio Project Plan

When you are ready to move beyond local development:

1. Create a **new Supabase project** dedicated to Data Studio (not production).
2. Run the same migrations against that project using `supabase db push` or the Supabase dashboard SQL editor.
3. Add the Data Studio project credentials to your hosting environment (Vercel, etc.) using the variable names from Section 2.
4. Production Supabase remains completely separate — no Data Studio migration or script should ever target it directly.

Controlled export from Data Studio into production happens only after all fields on a staged record are human-verified and a `publish_batch` has been approved. That export step is server-side only, using `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`, and is a separate pipeline (`pipelines/publishing/`) not yet built.

---

## 6. Environment Variable Placeholders

`.env.local` is not committed to this repo. The following shows the required variable names and their purpose. Fill in real values from your local `supabase start` output or from your Data Studio Supabase project settings.

```env
# Data Studio Supabase — local or hosted Data Studio project only
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Production Supabase — server-side export only, future use
# NEVER expose these to the browser or NEXT_PUBLIC_ variables
PRODUCTION_SUPABASE_URL=
PRODUCTION_SUPABASE_SERVICE_ROLE_KEY=
```

If you see these variables referenced in code, they refer only to the respective project above. Production variables must only ever appear in server-side API routes or pipeline scripts.
