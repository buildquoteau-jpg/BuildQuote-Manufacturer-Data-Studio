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
| Studio widget data | `apps/web/lib/data/getWidgetData.ts` | `staged_systems` (data studio DB) |
| Studio → production publish | `apps/web/lib/studio-admin/publish.ts` | writes to RFQ production `systems` |

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
