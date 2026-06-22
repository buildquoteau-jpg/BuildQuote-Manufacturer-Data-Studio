# Repo Boundaries

These boundaries are strict. Do not blur them.

---

## RFQ Repo

Owns:
- Builder authentication and session
- RFQ drafts (creation, line items, status)
- Messy-list AI parser (builder uploads rough lists for parsing into RFQ items)
- RFQ sending and delivery to manufacturers

Does NOT own:
- Manufacturer login or account management
- Product catalogue data
- Extraction or verification workflows

---

## Manufacturer Portal Repo

Owns:
- Supplier-facing widgets (embeddable product displays)
- Public manufacturer product pages
- Approved system-card display (reads from production Supabase)
- Add-to-RFQ flow (sends items into the RFQ app)
- Supplier/public-facing auth if required for widget or portal access

Does NOT own:
- Raw manufacturer uploads or source documents
- Extraction or staging data
- Approval or verification workflows
- Writing to production catalogue tables
- Manufacturer upload/verification auth (that belongs to Data Studio)

---

## Data Studio Repo (this repo)

Owns:
- Manufacturer login and account management (Supabase Auth, workspace model)
- Manufacturer workspace invitations and membership roles
- Source document upload (PDFs, product guides, brochures)
- Source document storage (Cloudflare R2)
- Extraction pipeline (Docling text/table/layout extraction)
- Staging database (extracted and AI-parsed records, not yet approved)
- Field-level and record-level verification workflow
- Visual verification UI (side-by-side PDF vs generated card)
- Approval and rejection workflow
- Controlled export and publishing of approved data into production Supabase (BuildQuote admin only)

Does NOT own:
- Builder auth or RFQ flows
- Supplier/public-facing auth or widget presentation (Manufacturer Portal owns that)
- Production Supabase writes outside of a controlled, approved export step
- Any public-facing product pages or widgets

### Auth Boundary Clarification

Data Studio owns **manufacturer upload/verification auth** — the login that allows a manufacturer to upload PDFs, run extraction, and verify staged data.

Manufacturer Portal owns **supplier/public presentation auth** — any login or session required for a supplier to access widget configuration, or for a public user to interact with product pages.

These are separate auth contexts, separate Supabase projects, and must not share sessions or credentials.

---

## Cross-Repo Data Flow

```
Data Studio (approved export)
        │
        ▼
Production Supabase
        │
        ├──► Manufacturer Portal (reads approved cards/systems)
        └──► RFQ repo (reads approved component/system data for RFQ line items)
```

Data flows one way: Data Studio → Production → downstream read-only consumers.
