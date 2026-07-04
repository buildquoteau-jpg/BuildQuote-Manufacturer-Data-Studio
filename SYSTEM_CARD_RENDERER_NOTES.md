# System Card Renderer — Notes

The approved BuildQuote v6 public rendering experience, ported into Data Studio
as the single reusable "master" renderer. The manufacturer approves in Studio
exactly what the public will later see.

## Where it lives

```
apps/web/components/system-card-renderer/
  types.ts                     # Plain-JSON data contract (mirrors v6 LibrarySystem)
  SystemCardRenderer.tsx       # The full System Card (port of v6 SystemCardUI)
  SystemCardTile.tsx           # Grid tile (port of v6 SystemCardTileUI)
  ShoppingListProvider.tsx     # Client-side list state (port of v6 provider)
  ShoppingListDrawer.tsx       # Floating bottom drawer (port of v6 drawer)
  sharePng.ts                  # Shopping-list PNG share/export (canvas)
  adaptStagedSystem.ts         # Staged Data Studio shape → renderer props
  SystemCardPreviewWrapper.tsx # Full public experience: manufacturer page → tiles → card
```

Used by:

- `app/(protected)/manufacturer/preview/page.tsx` — the manufacturer's
  "Preview public System Cards" screen (real staged data via the adapter).
- `app/system-card-preview/page.tsx` — standalone demo, no auth/DB, static
  seed data. Handy for design iteration and local dev without `.env.local`.

Source of truth for the experience: **BuildQuote v6**
(`buildquote/components/library/SystemCardUI.tsx`, `SystemCardTileUI.tsx`,
`ShoppingListProvider.tsx`, `ShoppingListDrawerUI.tsx`, and the
`/library/[manufacturer]` + `/library/[manufacturer]/[system]` page layouts).
If the v6 card changes, re-port the change here — keep the two byte-close.

## Data shape

The renderer consumes `SystemCardSystem` (see `types.ts`) — deliberately the
same field names as v6's `LibrarySystem` (snake_case, `system_profiles`,
`system_components` with a nested `components` record, `system_colours`).
Everything is plain JSON:

- **No Supabase reads or writes inside the renderer.** Data is adapted first,
  then passed as props. This is what makes it static-package-friendly: the
  future package generator can serialise `SystemCardSystem` to a JSON file and
  render from it directly.
- `SystemCardManufacturerPage` drives the v6-style manufacturer landing page
  (breadcrumb, hero band, description, website CTA, tile grid).

## Adapter

`adaptStagedSystem(system, manufacturer)` converts the shapes returned by
`getManufacturerVerificationData()` (`lib/studio-manufacturer/workspace.ts` —
staged_systems + staged_system_profiles + staged_components +
staged_system_colours) into `SystemCardSystem`.

Mapping notes / fallbacks:

- **slug** — staged systems have no slug (assigned on publish), so the adapter
  slugifies the name. TODO: the static package generator must use the real
  production slug once promoted.
- **components.role** — staged components carry no system "role" label; the
  component `category` is used (it's what the card groups by anyway).
- **colour swatches** — `staged_system_colours` has no `image_url`, so colour
  chips render text-only. TODO if/when staged colours grow swatch images.
- **is_stocked** — nullable in staging; `null` is treated as stocked (no EOI tag).
- **website_url** — falls back to `source_url` when the staged system has no
  website URL.
- Manufacturer hero position / wide-hero variants — v6 supports
  `hero_wide_image_url` + position-Y; `data_studio_manufacturers` doesn't have
  those columns, so the landing hero uses `hero_image_url` at `center 50%`.

## Copied v6 behaviours

- Full card layout: hero, description, colours, profile grouping (" — "
  separator + min-prefix/suffix strategies), collapsible profile groups,
  component categories with size-variant families, attribute pills, guide
  links, stockists section (renders "No local stockists listed yet" when
  empty, like the public card).
- Selectable line items → "Add N items to shopping list" with the green
  confirmation flash.
- **"Share System Card"** (added to v6 in this same session): native
  `navigator.share` sheet where available, clipboard fallback with
  "Link copied" confirmation, `window.prompt` last resort. Share text =
  card title — manufacturer, description (word-boundary truncated at ~160
  chars), and the card URL. Takes a `cardUrl` prop; falls back to the current
  page URL (in the Studio preview that's the Studio URL — the public/static
  card must pass the canonical public URL).
- Shopping list drawer: expandable table, editable line names (textarea),
  editable UOM, qty steppers (qty 0 removes), manual add row, clear all,
  "+N added" pulse animation, and PNG share/export (identical canvas layout;
  `navigator.share` with file on mobile, download fallback on desktop).

## Deliberate differences from v6

- Plain `<img>` instead of `next/image` (works in a static ZIP later).
- Barlow / Barlow Condensed loaded via a Google Fonts `<link>` in
  `SystemCardPreviewWrapper` (v6 uses `next/font`); the renderer uses literal
  font-family stacks instead of v6's CSS variables.
- The v6 favourites heart (builder auth) is omitted — the renderer is the
  anonymous/public view.
- Stockist "Request a quote" and the drawer's "Request a Quote →" are
  BuildQuote-app flows (RFQ draft APIs + login). The renderer/drawer expose
  optional callbacks (`onRequestQuote`, `primaryAction`) instead; when absent
  the buttons are hidden. The Studio preview passes none.
- Shopping-list persistence is opt-in (`storageKey` prop on
  `ShoppingListProvider`). The Studio preview uses in-memory state only —
  nothing persists, nothing touches Supabase.
- Preview navigation (breadcrumb, tile → card, back links) is client-side
  state, not routing; external-looking links in the preview are inert.
- The per-system top bar is not sticky in the preview (v6 makes it sticky;
  static here so it never fights the Studio shell's header).

## Known limitations / follow-ups

- The old `components/system-card/SystemCard.tsx` is still used by the
  verification UI (`manufacturer/review/VerificationGrid.tsx`). It was left
  untouched to avoid destabilising the verify flow. Follow-up: migrate the
  verify screens onto the master renderer and delete the old component.
- The protected preview page needs Supabase env (`.env.local`) — on machines
  without it, use `/system-card-preview` (static seed data) to see the
  renderer. `middleware.ts` now passes through when Supabase env is missing
  instead of crashing every request (deployed behaviour unchanged).
- Group-header dedupe: when profile names embed the full system name, the
  group header no longer prints the system name twice. The same fix was
  applied to v6's `SystemCardUI.tsx` so the two stay identical.
- `install_guide_urls` is `{ label, url }[]` in staging like v6 — no adapter
  work needed, but staged data rarely has it populated yet.

## For the static package generator (session 2)

1. Adapt the (verified/approved) staged system with `adaptStagedSystem`, but
   inject the real production slug + canonical public card URL.
2. Serialise the `SystemCardSystem` JSON into the package.
3. Render `SystemCardRenderer` (plus provider + drawer if the package keeps
   the shopping list) from that JSON — no live data reads required.
4. Pass `cardUrl` so "Share System Card" shares the canonical URL.
