# System Card packages — implementation notes

Companion to `SYSTEM_CARD_RENDERER_NOTES.md` (the renderer itself). This file
covers the asset library, readiness checks and the static website package
generator added in the package-model rebuild (July 2026).

## Business model recap

BuildQuote is the **card factory, not the public card warehouse**. Data Studio
is the control panel; the manufacturer's own website is the preferred public
home of the finished cards (e.g. `manufacturer.com.au/system-cards/cards/card-slug/`).
The static website package ZIP is the handover product. BuildQuote-hosted
embeds stay available as a Wix/simple-builder compatibility path only.

Status language (see `apps/web/lib/statuses.ts` — DB values unchanged):

    Submitted → Under Review → Manufacturer Verified → BuildQuote Approved
      → Ready to Package → Package Generated → Exported / Delivered

"BuildQuote Approved" = `staged_systems.production_system_id` set (the old
admin publish step, reframed as approval into the source data — not hosting).

## Where things live

| Piece | Path |
|---|---|
| Migrations | `supabase/migrations/046_manufacturer_assets.sql`, `047_card_packages.sql` |
| Asset library page | `apps/web/app/(protected)/manufacturer/assets/` |
| Asset reads / mutations | `apps/web/lib/studio-manufacturer/assets.ts`, `asset-actions.ts`, `asset-types.ts` |
| Brand profile asset slots | `apps/web/app/(protected)/manufacturer/profile/AssetSlotControl.tsx` (+ `BrandProfileForm.tsx`, `brand-actions.ts`) |
| Readiness rules | `apps/web/lib/packages/readiness.ts` (pure, no DB) |
| Packages page | `apps/web/app/(protected)/manufacturer/packages/` (server page + `PackagesClient.tsx`) |
| Packages page data | `apps/web/lib/studio-manufacturer/packages.ts` |
| ZIP builder | `apps/web/lib/packages/generator.ts` (pure — no Supabase/R2) |
| Generate/download actions | `apps/web/lib/studio-manufacturer/package-actions.ts` |
| Static page shells | `apps/web/components/system-card-renderer/static/` (`StaticPages.tsx`, `entry.tsx`) |
| Prebuilt browser bundle | `apps/web/lib/packages/generated/system-card-bundle.ts` (committed, auto-regenerated) |
| Bundle build script | `apps/web/scripts/build-static-card-bundle.mjs` (runs before every `next build`) |
| Fixture | `apps/web/scripts/build-package-fixture.ts` → `apps/web/.package-fixture/` (gitignored) |

Useful commands (run in `apps/web`):

    corepack pnpm bundle:static-card   # rebuild the renderer browser bundle
    corepack pnpm package:fixture      # bundle + build a sample ZIP from seed data (no env needed)

## Data flow

### Assets (migration 046)

`manufacturer_assets` = public visual files (logo / brand_hero / banner /
card_hero / profile / product / thumbnail / icon). Distinct from
`source_documents` (private source/reference files). Bytes live in R2
(`manufacturer-assets/<manufacturerId>/<uuid>.<ext>`); Supabase holds metadata,
focal point (`focal_x/y`), `approved_for_publication` and `archived` (assets
are archived, never deleted). RLS mirrors `manufacturer_messages` (036).

**Rule: Studio references assets by ID.** Nullable id columns:
`data_studio_manufacturers.logo_asset_id / hero_image_asset_id /
hero_wide_image_asset_id`, `staged_systems.hero_image_asset_id`. The legacy
`*_url` columns keep working everywhere; the brand profile only writes durable
public URLs into them (never presigned links). Clean public file names
(`hero.webp`, `logo.png`) are generated **only at package time**.

### Packages (migration 047)

`card_packages` (one row per generated ZIP: version, status
generating/generated/downloaded/failed/superseded, R2 key, checksum, build
log) + `card_package_items` (per card: package_slug, generated paths, QR
path). Older `generated` packages are auto-superseded when a new one lands;
`downloaded` rows are kept as the export record.

### Generation pipeline (`generateCardPackage`)

1. Auth gate (same `assertManufacturerAccess` pattern as other actions).
2. `getManufacturerVerificationData` → staged systems; readiness evaluated
   with the same rules the Packages page shows.
3. Cards included = readiness `ready` only: `manufacturer_verified` AND
   `production_system_id` set AND data complete AND guide links public.
4. Images: hero per card + logo + brand hero. Asset-library bytes from R2
   first; external `hero_image_url`s fetched best-effort as a fallback (logged
   with a nudge to import into Assets). Final card.json never references
   remote images the generator could localise.
5. `adaptStagedSystem` → `SystemCardSystem` JSON (slug: stored
   `staged_systems.slug`, else slugified name; duplicates get `-2`, `-3`…).
6. `buildPackageZip` → ZIP → R2 (`card-packages/<manufacturerId>/v<n>-<uuid>.zip`)
   → records. Download issues a 15-min presigned URL and flips
   generated → downloaded ("Exported / Delivered").

### ZIP layout

    system-cards/
      index.html            collection page: brand hero, logo, tile grid
      feed.json             machine-readable card feed (future static embeds)
      manifest.json         file inventory + build metadata
      README.md, install-guide.html, card-link-list.csv, embed-snippets.html
      assets/
        system-card.js      prebuilt renderer bundle (React included, IIFE, ~190 KB)
        site.css, logo.<ext>, brand-hero.<ext>
      cards/<slug>/
        index.html          full System Card page
        card.json           the card's SystemCardSystem JSON, local asset paths
        qr-code.png         512px QR → https://<site><install-path>cards/<slug>/
        assets/hero.<ext>

Every path is relative → pages work over `file://` straight out of the ZIP.
Card data is **inlined** into each page (`<script type="application/json">`)
— no fetch, no CORS issues on file://. The shopping list persists across pages
via `localStorage` key `bq-shopping-list:<manufacturer-slug>`. Fonts (Barlow)
load from Google Fonts with system-font fallback offline.

The browser bundle is built at **build time** (`build-static-card-bundle.mjs`
→ committed string module) so Vercel never runs esbuild at request time.
Regenerate + commit after changing anything under
`components/system-card-renderer/`; `pnpm build` also regenerates it, so
deploys can't ship a stale bundle.

## Readiness rules (`lib/packages/readiness.ts`)

Card blockers (worst status wins: missing_data > needs_approval >
needs_asset_import > needs_guide_url):

- **Missing required data** — no title / no category / no profiles AND no components.
- **Needs BuildQuote approval** — not `manufacturer_verified`, or no `production_system_id`.
- **Needs asset import** — linked hero asset is archived or not approved for publication.
- **Needs guide URL** — any install/design/tech guide link that isn't a public
  http(s) URL, or matches Studio/draft hosts (`supabase.co`,
  `r2.cloudflarestorage.com`, `r2.dev`, `localhost`, `vercel.app`). Draft links
  are never silently published.

Warnings (don't block): external-URL hero (imported best-effort at generate
time), no hero at all, no guide links.

Manufacturer blockers: missing name / slug / website URL (QR codes need it).
Warnings: no description, no logo asset.

## Embeds & Links (`manufacturer/widgets`)

Reframed: Website Package first (recommended), static snippets from the ZIP
second, the legacy BuildQuote-hosted iframe widget below as the Wix
compatibility path. The legacy widget still reads live production Supabase
(`embed_widgets` by slug) — unchanged and working.

## Known gaps / next steps

- **Static-feed-powered embeds**: the hosted widget should eventually render
  from the package's `feed.json`/`card.json` instead of live relational
  queries (TODO marker in `WidgetManager.tsx`). `feed.json` already ships in
  every ZIP to make this possible.
- **Separate QR-pack / link-list downloads**: currently inside the ZIP only;
  the Packages page has a single ZIP download.
- **Colour swatch images** aren't packaged yet (`staged_system_colours.image_url`
  exists but `adaptStagedSystem` doesn't map it; chips render text-only).
- **Multi-card combined shopping list sharing** on the collection page —
  the list itself already spans pages; a combined share/export UI is future work.
- **Asset focal points** are stored (`focal_x/y`) but the generator doesn't
  yet write them into card.json (cards use `hero_image_position_x/y` from
  staged_systems, which the verify UI edits).
- **Image optimisation**: bytes are copied as-is (no resize/WebP conversion).
- Server-action runtime: generation downloads every image synchronously —
  fine for tens of cards; large catalogues may need a background job later.
- Migrations 046/047 must be applied via the Supabase SQL editor; every
  reader/writer degrades gracefully (info banners) until then.
