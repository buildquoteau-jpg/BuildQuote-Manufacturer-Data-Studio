# Studio → MFP File Mapping

When making UI changes, any visual update to a studio component needs a matching change in the MFP counterpart. Any new DB field needs to be added to `publish.ts` so it flows through on next publish.

| UI surface | Studio file | MFP file |
|---|---|---|
| **Manufacturer brand grid** (cards on browse/showroom page) | `apps/web/app/(protected)/studio/showroom/ShowroomClient.tsx` | `app/manufacturers/ManufacturersClient.tsx` |
| **Manufacturer detail page** (hero banner + system list) | `apps/web/app/(protected)/studio/showroom/[id]/ShowroomManufacturerClient.tsx` | `app/manufacturers/[slug]/page.tsx` + `app/widget/[token]/ManufacturerHero.tsx` |
| **System cards** (grid of product cards on detail page) | `apps/web/app/(protected)/studio/showroom/[id]/ShowroomManufacturerClient.tsx` (inline render) | `components/ui/SystemCardTile.tsx` |
| **System modal / detail panel** | `apps/web/components/system-card/SystemCard.tsx` | `app/widget/[token]/WidgetClient.tsx` → `SystemDetailPanel` component |
| **Image crop positions** (X/Y sliders, set in verification UI) | `apps/web/app/(protected)/manufacturer/review/VerificationGrid.tsx` `CropAdjuster` | Consumed via `hero_image_position_x/y` in `SystemCardTile` + `SystemDetailPanel` |
| **Publish pipeline** (studio → MFP DB) | `apps/web/lib/studio-admin/publish.ts` | — (writes directly to RFQ production Supabase) |

## Data flow

```
staged_systems (data studio DB)
  → publish.ts
    → systems (RFQ production DB)
      → getManufacturerData.ts / getWidgetData.ts
        → SystemCardTile.tsx / WidgetClient.tsx
```

## Fields that must stay in sync

When adding a new field end-to-end, touch all of these:

1. **Migration** — `supabase/migrations/0XX_....sql` (data studio) + apply equivalent SQL to RFQ production via SQL editor
2. **Studio type** — `workspace.ts` `VerificationSystem` type + SELECT query
3. **Studio UI** — `VerificationGrid.tsx` (edit control) + `SystemCard.tsx` (preview)
4. **Publish** — `publish.ts` `publishSystem()` or `publishManufacturer()` payload
5. **MFP types** — `getWidgetData.ts` `WidgetSystem` / `WidgetManufacturer` + SELECT
6. **MFP data fetchers** — `getManufacturerData.ts`, `getManufacturers.ts`, `getSupplierBrandWidget.ts`
7. **MFP render** — `SystemCardTile.tsx`, `WidgetClient.tsx`, `ManufacturerHero.tsx` as appropriate
