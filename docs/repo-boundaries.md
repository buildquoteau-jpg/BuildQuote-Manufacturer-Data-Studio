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

Does NOT own:
- Raw manufacturer uploads or source documents
- Extraction or staging data
- Approval or verification workflows
- Writing to production catalogue tables

---

## Data Studio Repo (this repo)

Owns:
- Manufacturer login and account management
- Source document upload (PDFs, product guides, brochures)
- Source document storage (Cloudflare R2)
- Extraction pipeline (Docling text/table/layout extraction)
- Staging database (extracted and AI-parsed records, not yet approved)
- Visual verification UI (side-by-side PDF vs generated card)
- Approval and rejection workflow
- Controlled export and publishing of approved data into production Supabase

Does NOT own:
- Builder auth or RFQ flows
- Production Supabase writes outside of a controlled, approved export step
- Any public-facing product pages or widgets

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
