# System Card Rendering — File Map

Use this as a reference whenever making visual changes to system cards, modals, or hero banners. Any change to a studio component needs a matching change in the MFP counterpart. See also: `docs/studio-mfp-file-mapping.md`.

---

## Grid cards (what you see before clicking)

| Surface | File |
|---|---|
| **Studio widget** (manufacturer's own site embed) | `apps/web/components/ui/SystemCardTile.tsx` |
| **Studio showroom** — manufacturer detail page | `apps/web/app/(protected)/studio/showroom/[id]/ShowroomManufacturerClient.tsx` — inline `SystemCardTile` function |
| **Studio showroom** — search results | `apps/web/app/(protected)/studio/showroom/ShowroomClient.tsx` — inline `SystemCardTile` function |
| **Studio verification** — final card preview | `apps/web/components/system-card/SystemCard.tsx` |

> **Note:** The studio has two separate `SystemCardTile` implementations — the shared one at `apps/web/components/ui/SystemCardTile.tsx` (used by the widget) and inline versions in the showroom files. Keep all three in sync when making style changes.

---

## Detail modal (what opens when you click a card)

| Surface | File |
|---|---|
| **Studio widget** modal | `apps/web/app/widget/[token]/WidgetClient.tsx` — `SystemDetailModal` component |
| **Studio showroom** modal | `apps/web/app/(protected)/studio/showroom/[id]/ShowroomManufacturerClient.tsx` — `SystemDetailModal` component |

---

## Hero banners (manufacturer brand banner above card grid)

| Surface | File |
|---|---|
| **Studio widget** hero | `apps/web/app/widget/[token]/ManufacturerHero.tsx` |
| **Studio showroom** hero | `apps/web/app/(protected)/studio/showroom/[id]/ShowroomManufacturerClient.tsx` — `ManufacturerHero` function |

---

## Data fetchers (what fields reach the cards)

| Source | File | Reads from |
|---|---|---|
| Studio widget data | `apps/web/lib/data/getWidgetData.ts` | Config/token lookup → data-studio (service role, server-side). System content → **production Supabase** (`SUPABASE_RFQ_URL`) via `staged_system_id → production_system_id` resolution. Only published systems (non-null `production_system_id`) are returned. |
| Studio → production publish | `apps/web/lib/studio-admin/publish.ts` | Writes verified systems to production Supabase `staged_systems` table; sets `production_system_id` on data-studio record. |

> **Security note (2026-06-18):** `getWidgetData.ts` was rewritten so that all system content comes from production Supabase only. `system.id` values returned by this function are **production IDs**, not data-studio staged IDs. The publish step is the hard gate — unpublished systems cannot appear in any widget.

---

## Enquiry & quote request pathways

| Action | Entry point | Handler | Writes to |
|---|---|---|---|
| **General Enquiry** | `EnquiryModal` in `WidgetClient.tsx` (type = `'enquiry'`) | `POST /api/widget/enquiry/route.ts` | `rfq_enquiries` on production Supabase |
| **Request a Quote** (current — simple form) | `EnquiryModal` in `WidgetClient.tsx` (type = `'quote'`) | `POST /api/widget/enquiry/route.ts` | `rfq_enquiries` on production Supabase (message prefixed `[Quote Request]`) |
| **Request a Quote** (planned — full RFQ form) | Widget checkbox selection → sticky button → form modal | `POST /api/widget/quote-request` (not yet built) | `widget_quote_requests` on data-studio + email to manufacturer |
| **Find a Stockist** | `StockistModal` in `WidgetClient.tsx` | `GET /api/widget/stockists/route.ts` | Read-only — queries `supplier_systems` + `suppliers` on production Supabase |

> **Note on system_id in API routes:** As of 2026-06-18, `system_id` passed from `WidgetClient.tsx` to all widget API routes is a **production ID**. The old staged→production resolution step has been removed from both `enquiry/route.ts` and `stockists/route.ts`.

---

## Widget button options — business rules

The system detail modal has three action buttons. Who sees what:

| Widget type | Buttons shown |
|---|---|
| **Manufacturer widget** (`studio.buildquote.com.au/widget/[token]`) | Manufacturer chooses which of the three to enable per widget |
| **Supplier embed** (`mfp.buildquote.com.au/widget/[token]`) | **General Enquiry only** on free tier. All three on paid tier. |

### The three buttons
1. **General Enquiry** — always available to all
2. **Request a Quote** — manufacturer widget (configurable) / supplier paid tier only
3. **Find a Stockist** — manufacturer widget (configurable) / supplier paid tier only

### Where the buttons render (studio side)
`apps/web/app/widget/[token]/WidgetClient.tsx` → `SystemDetailModal` component → action buttons section (~line 476)

### Widget manager UI (where manufacturer configures their widget)
`apps/web/app/(protected)/manufacturer/widgets/WidgetManager.tsx`
