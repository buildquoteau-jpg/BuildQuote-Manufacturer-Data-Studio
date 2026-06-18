# Brainstorm — Widget RFQ & Enquiry Flows
> How the embedded manufacturer widget connects customers to quotes, enquiries, and stockists.

---

## Context

The BuildQuote widget (`/widget/{public_token}`) is embedded on a **manufacturer's own website**. It displays their product catalogue (systems, variants, components). Three actions need to be wired up:

1. **General Enquiry** — customer message routed to manufacturer
2. **Request a Quote** — for manufacturers who quote direct
3. **Find Local Stockist** — for manufacturers who sell through resellers

This document captures the design decisions, open problems, and proposed solutions from a June 2026 brainstorm. Reopen and revisit with different models as needed.

---

## Manufacturer types

| Type | Quote button | Stockist button | RFQ destination |
|---|---|---|---|
| **Direct** | ✓ Request a Quote | — | Manufacturer's data studio workspace |
| **Stockist-only** | — | ✓ Find Local Stockist | BuildQuote/MFP (supplier side) |
| **Blended** | ✓ both | ✓ both | Parked — handle later |

The `procurement_route` field already exists on component items in data studio (added in `feat(verification): procurement_route toggle`). This toggle drives which button(s) appear.

---

## Issue 1 — General Enquiry

### Problem
No mechanism exists to capture a customer message from the widget and route it to the manufacturer.

### Proposed solution
- New API endpoint: `POST /api/widget/{public_token}/enquiry`
- New DB table: `widget_enquiries` (manufacturer_id, system_id, contact fields, message, status, created_at)
- Manufacturer receives email notification; customer receives confirmation
- Enquiries appear in a new "Inbox" tab in the manufacturer's data studio workspace
- No customer account required

### Status
Not yet designed in detail. Unblocked — can build independently.

---

## Issue 2 — Direct manufacturer RFQ (priority)

### Problem
Manufacturers who quote direct need customers to be able to select specific line items (variants/sizes) and submit a structured quote request — without leaving the manufacturer's site and without requiring a BuildQuote account.

### Proposed solution

**Widget UI changes:**
- Each size/variant row in the system card gets a checkbox
- A sticky "Request a Quote (N items)" button appears as items are selected
- Clicking it opens an inline modal form (stays within the widget)

**Form fields:**

| Field | Required |
|---|---|
| Name | ✓ |
| Email | ✓ |
| Phone | ✓ |
| Postcode | optional |
| Project type (Residential / Commercial / Other) | optional |
| Timeline (ASAP / 1–3 months / Just planning) | optional |
| Message | optional |
| Selected items | auto-populated (read-only) |

**Backend:**
- `POST /api/widget/{public_token}/quote-request`
- New table: `widget_quote_requests` (manufacturer_id, system_id, selected_items jsonb, contact fields, status: new → viewed → responded, created_at)
- Manufacturer email notification with selected items + reply-to set to customer email
- Customer confirmation email
- Quote requests visible in manufacturer's data studio workspace

### Status
Agreed as **first priority**. Unblocked — self-contained, no cross-repo work.

---

## Issue 3 — Find Local Stockist → RFQ handoff

### Problem
Manufacturers who sell through stockists want customers to find a local stockist and submit an RFQ to them. But this requires:
1. Knowing which stockists carry which manufacturer's products
2. Those stockists being registered in BuildQuote/MFP as suppliers
3. A handoff mechanism from the widget to the BuildQuote RFQ flow

Currently BuildQuote has **no meaningful supplier coverage**. The stockist network does not yet exist in the system.

### Sub-problem A — Stockist locator options

| Option | Description | Trade-off |
|---|---|---|
| A | Link to manufacturer's own existing locator | Simple, no data sync, but **breaks RFQ handoff** — customer finds a phone number and bypasses BuildQuote entirely |
| B | Manufacturer uploads stockist list to data studio; we power the lookup | Keeps handoff intact, manufacturer maintains two lists |
| C | API passthrough — manufacturer provides stockist API endpoint | Stays in sync automatically; almost no manufacturers have a clean API |

**Recommended:** offer A and B as config options in data studio. Option A for manufacturers who just want a locator link. Option B if they want the full RFQ routing. Option A cannot route RFQs — this must be clearly communicated to manufacturers at setup.

### Sub-problem B — Stockist↔manufacturer relationship

For RFQ routing to work, the system needs to know:
- Which suppliers/stockists stock which manufacturer's products
- Whether those stockists are registered BuildQuote suppliers (MFP)
- Stockist location data for proximity lookup

**Open questions:**
- Who owns this relationship? Manufacturer-driven (they configure their network in data studio) is probably right — they know their distribution better than suppliers know every brand they carry.
- How do stockists get into BuildQuote? Self-register? Manufacturer invites them? This is a network acquisition problem.
- Where does the data live? Likely a `manufacturer_stockists` junction table in production Supabase, populated from data studio.

### Sub-problem C — Cross-repo handoff

When a customer selects a stockist, the widget must hand off to BuildQuote with context:
- Manufacturer identity
- Selected product/system
- Selected stockist (who must exist as a MFP supplier)
- Pre-filled RFQ form on BuildQuote side

This touches **three repos** (data-studio, RFQ/buildquote, MFP). This is where enterprise architecture risk is highest — the data contracts between repos need to be designed carefully before building.

**Proposed handoff mechanism (sketch):**
`buildquote.com.au/rfq?supplier={supplier_id}&manufacturer={manufacturer_id}&items={encoded_items}`
BuildQuote RFQ page reads params, pre-fills context banner, customer completes contact form as guest.

### Status
**Parked.** Do not build until:
1. Direct manufacturer RFQ (Issue 2) is complete
2. Supplier coverage in BuildQuote is meaningful
3. Cross-repo data contracts are designed with all three repos in mind

---

## Issue 4 — Guest vs account on BuildQuote RFQ side

### Problem
If the stockist flow routes customers to BuildQuote to complete an RFQ, requiring account creation at that point is a major drop-off risk. The customer arrived from a manufacturer's site and has no prior BuildQuote relationship.

### Proposed solution
Support guest/anonymous RFQ submission on the BuildQuote side for widget-originated flows. Track origin via the `public_token` parameter so the RFQ is attributed correctly.

### Status
Not designed. Depends on RFQ repo architecture. Flag for when stockist flow becomes active.

---

## Security fix applied — June 2026

**`getWidgetData.ts` was rewritten** to close two issues:

1. **`NEXT_PUBLIC_` key removed** — the old function used `NEXT_PUBLIC_SUPABASE_ANON_KEY` (data-studio key bundled into the browser). The new version uses `createStudioServiceClient()` (server-side service role) for data-studio config lookups and `getRfqServerClient()` (server-side, production project) for all system content. Neither key is ever exposed to the browser.

2. **Publish gate enforced** — the new function resolves `staged_system_id → production_system_id` via the data-studio `staged_systems` table. Systems without a `production_system_id` (i.e. not yet published) are silently excluded. The publish pipeline IS the verification gate.

**Data flow after fix:**
- Token validation, manufacturer config, widget system list → data-studio (service role, server-side)
- staged_id → production_id resolution → data-studio (service role, server-side)
- All system content (systems, profiles, colours, components) → **production Supabase only**

**Still to verify:** `WidgetClient.tsx` passes `staged_system_id: system.id` to `/api/widget/enquiry`. After this fix, `system.id` is now a production ID (not a staged ID). The enquiry route must be updated to accept a production system ID directly rather than resolving via `staged_systems.production_system_id`.

---

## Build order (agreed)

1. **Direct manufacturer RFQ** — Issue 2. Self-contained, highest immediate value (covers Hoodee and similar direct manufacturers).
2. **General Enquiry** — Issue 1. Simple, can run in parallel with Issue 2.
3. **Stockist network design** — Issue 3. Requires cross-repo discussion. Do not start until Issues 1 and 2 are shipped and supplier coverage exists.
4. **Guest RFQ on BuildQuote** — Issue 4. Downstream of Issue 3.

---

## Open architectural questions (for future sessions)

- Who invites stockists into BuildQuote — manufacturer or BuildQuote team?
- Should the `manufacturer_stockists` relationship live in data-studio Supabase, production Supabase, or be replicated to both?
- For blended manufacturers (direct + stockist), does the customer choose which path, or does the system route based on product type?
- Should `widget_quote_requests` and `widget_enquiries` eventually merge into a single `widget_leads` table with a type field?
- Email infrastructure — are we using Resend, SendGrid, or Supabase edge functions + SMTP for widget notifications?
