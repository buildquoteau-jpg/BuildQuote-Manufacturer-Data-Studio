# Manufacturer Hint File — NewTechWood

**Injected into the parser system prompt for all NewTechWood extraction runs.**
**Do not treat known_systems as a closed list — flag unexpected systems rather than ignoring them.**

Source: NewTechWood Product Brochure (Oct 2025), Reseller Spec Sheet (Jul 2026), Codemark
certificates (Shadowline, Castellation), and per-profile installation guides. Website:
https://newtechwood.com.au/ (composite timber decking, cladding, screening — 95% recycled
materials; imported/distributed by Urban Direct Wholesale Pty Ltd).

---

## Critical rule — edge/fascia boards are variants, not systems

**Edge boards (fascia boards, starter boards, breaker boards) are profile variants of their
parent decking/cladding range — never a separate `staged_systems` row.**

Confirmed example: **Fascia Board (US06C, 138mm x 15mm x 5.4m)** appears in the Reseller Spec
Sheet listed directly under the **Terrace Decking Range** heading, sharing the exact same
stocked colours as Terrace (Blackbutt, Antique, Teak, Ipe, Silver Grey). It is also cross-listed
in the Screening & Fencing table — the same physical profile serves both roles. Do not create a
"Fascia" or "Edge Board" system. Insert it as a `staged_system_profiles` row under the parent
range (Terrace Decking Range) with a `parser_notes` tag `"profile_role": "fascia_edge_board"`.

Apply the same logic to any other board explicitly described as an edge/starter/breaker board
in the source text (e.g. "breaker boards" used to divide long decks, starter boards used to
align the first course) — these are installation-role variants of an existing range's profile,
not new systems. Only create a new system when the board has genuinely distinct dimensions,
a distinct name, and its own colour range not shared with a parent range.

---

## Known systems

| System name | Category | Subcategory | Notes |
|---|---|---|---|
| NewTechWood Avenue Decking Range | Decking | Composite decking (single-sided) | 138mm x 29mm; profiles US92, US93; spans to 450mm residential |
| NewTechWood Terrace Decking Range | Decking | Composite decking (double-sided, capped) | 138mm x 25mm; profiles US49C, US63C; includes Fascia Board US06C as a profile variant (see rule above) |
| NewTechWood Coastal Decking Range | Decking | Composite decking (double-sided) | 210mm x 23mm (US54C) and 138mm x 23mm (US142C) |
| NewTechWood Commercial Decking Range | Decking | Heavy-duty composite decking (marine/commercial) | 210mm x 36mm; profile US71H; also referred to as "Marina Board Decking" in filenames — same product, do not duplicate |
| NewTechWood Screening & Fencing | Screening | Composite privacy screening / slat fencing | Profiles UH55, UH122R (DIY Quick Panel), US154R (post); US06C also appears here as the shared fascia/screening board |
| NewTechWood Shadowline Wall Cladding | Cladding | Shadow-gap board cladding | 142mm x 13mm; profile US31, plus a charred "Shou Sugi Ban" finish variant |
| NewTechWood Castellation Wall Cladding | Cladding | Ribbed panel cladding | 196mm x 25mm; three rib variants: UH61 (5-rib, 25mm), UH58/UH58C (3-rib, 50mm, UH58C = charred), UH93 (4-rib, 25–43mm) |

Non-decking/cladding product lines exist in the source set (Nivo Pedestals for elevated
paver/tile decking, frameless pool fencing, DIY Quick Panel structural install guide, various
clip/trim installation guides) — these were not fully reviewed for this hint file. Treat pedestal
and pool-fencing content as its own system or as components on your judgement, and flag anything
ambiguous rather than guessing.

---

## Shadowline charred variant — colour suffix, not a separate product code

The Product Brochure labels the charred "Shou Sugi Ban" board **US31EB** — this is the base
profile **US31** with colour-code suffix **EB = Ebony** (the stocked colour the Shou Sugi Ban
charring technique produces), following the same SKU-suffix-per-colour convention as other
manufacturers (see James Hardie hint file). It is **not** a distinct profile: do not create a
separate `staged_system_profiles` row for it. Instead, create one `staged_system_colours` row
for US31 named "Ebony" (or "Shou Sugi Ban" if the source uses that as the colour label), and
capture the SKU suffix `EB` in `sku_suffix`. Note the charring technique in `parser_notes`:
`"finish_technique": "shou_sugi_ban"`.

The Reseller Spec Sheet separately lists a code **US31SS** for the same board — likely NewTechWood's
own inconsistent labeling (SS = Shou Sugi vs EB = Ebony colour code). Treat both as referring to
the Ebony colour variant of profile US31; do not create two colour rows. Prefer whichever code
appears in `Tech-Data-Sheet-US31-Shadowline-Cladding` if it disagrees with both.

---

## UOM rules

All decking, screening, and cladding boards are sold as discrete fixed-length boards. Use
`length` as UOM for all board profiles.

| Product type | UOM | Notes |
|---|---|---|
| Decking/cladding/screening boards (all profiles) | `length` | Fixed lengths: 2.7m, 4.88m, or 5.4m depending on profile |
| Clips (Cobra M-Clip, MG3, MG10, K37, TC28T, TC30) | `pack` | Sold in packs, quantities vary by clip (e.g. 25/250, 75/250) |
| Screws (CS, CDS, CSM) | `pack` | Sold in packs of 100 or 100/400 |
| Trim kits (End/Corner/Butt Joint/J-Trim/Window Flashing) | `pack` | Typically 3m lengths, 5–10 pieces per pack |

---

## Colour rules

Each decking/cladding range has its own fixed set of stocked colours — apply the same colour
set to every profile within that range (including the Fascia Board variant under Terrace):

| Range | Stocked colours |
|---|---|
| Avenue Decking Range | Antique, Teak, Walnut |
| Terrace Decking Range (incl. Fascia Board) | Blackbutt, Antique, Teak, Ipe, Silver Grey |
| Coastal Decking Range | Beech, Antique, Teak, Aged Wood |
| Commercial Decking Range | Blackbutt, Antique, Ipe |
| Screening — UH55 | Canadian Cedar, Ipe, Silver Grey, Ebony |
| Screening — UH122R, US154R | Sea Salt, Blackbutt, Ipe, Silver Grey |
| Shadowline Cladding (US31) | Blackbutt, Ipe, Teak, Sea Salt |
| Shadowline Cladding — Shou Sugi Ban (charred) | Ebony only |
| Castellation UH61 (5-rib) | Canadian Cedar, Ipe, Ebony |
| Castellation UH58/UH58C (3-rib) | Blackbutt, Teak, Aged Wood, Ebony (Charred) |
| Castellation UH93 (4-rib) | Sea Salt, Blackbutt, Teak |

Note board widths carry manufacturing tolerance: 138mm ±2mm, 210mm ±3mm — do not treat this as
a distinct dimension variant.

---

## Profile naming convention

`[System Name] [profile code] — [dimensions] x [length]`

Examples:
- `NewTechWood Terrace Decking Range US49C — 138mm x 25mm x 5.4m`
- `NewTechWood Terrace Decking Range Fascia Board US06C — 138mm x 15mm x 5.4m`
- `NewTechWood Castellation Wall Cladding UH58 (3-rib) — 196mm x 25mm x 5.4m`
- `NewTechWood Shadowline Wall Cladding US31 — 142mm x 13mm x 4.88m`

---

## Extra spec fields — use parser_notes

| Field | Source | Example |
|---|---|---|
| `profile_role` | Fascia/edge/breaker/starter board flag | `"fascia_edge_board"` |
| `finish_technique` | Charring/surface treatment noted in source | `"shou_sugi_ban"` |
| `boards_per_m2` | Spec table | `7` |
| `lm_per_m2` | Spec table | `1.3` |
| `weight_kg_per_lm` | Spec table | `3.9` |
| `max_span_residential_mm` | Spec table | `450` |
| `max_span_commercial_mm` | Spec table | `350` |
| `bal29_rated` | Spec table (BAL29 Rated column) | `true` / `false` — only when explicitly stated |
| `slip_rating` | Spec table | `"P2"`, `"P2/P5"`, `"P5"` |
| `qty_per_pack` | Spec table | `50` |
| `source_pages` | Docling page numbers | `[1, 2]` |
| `confidence` | Parser self-assessment | `0.9` |

---

## Component patterns

Fixings/clips are shared across multiple decking ranges — link each to every compatible range,
not just one:

| Component | Profile code | Role string | Compatible ranges |
|---|---|---|---|
| Cobra M-Clip (metal fix) | Cobra M-Clip | `metal_clip` | Avenue, Terrace, Coastal |
| Timber fix clip | TC28T | `timber_clip` | Avenue, Terrace, Coastal |
| Starter clip | MG3 | `starter_clip` | Avenue, Terrace, Coastal |
| Start/end clip | K37 | `start_end_clip` | Avenue, Terrace, Coastal |
| Marina board T-clip/screw | TC30 | `marina_clip` | Commercial Decking Range |
| NTW 3mm clip & screw (timber fix) | MG10 MBK FS 75 | `mini_gap_clip_timber` | Coastal (mini gap variant) |
| NTW 3mm locking clip & screw (timber fix) | MG10 LBK FS 75 | `mini_gap_locking_clip_timber` | Coastal (mini gap variant) |
| Fascia/screening screw | CS (8G x 50mm) | `fascia_screening_screw` | All ranges with 15–17mm fascias |
| Decking/fascia screw | CDS (10G x 65mm) | `decking_fascia_screw` | All ranges, 23–29mm boards |
| Decking/fascia screw (metal fix) | CSM (12G x 45mm) | `decking_fascia_screw_metal` | All ranges, 23–29mm boards |
| Wall cladding clip | AW08 | `wall_cladding_clip` | Shadowline, Castellation |
| Aluminium starter profile | AW02 | `cladding_starter_profile` | Shadowline, Castellation |
| Cladding locking screw | WJ63 | `cladding_locking_screw` | Shadowline, Castellation |
| Rubber standoff spacer | T7 | `cladding_standoff_spacer` | Shadowline, Castellation |
| Trim kits (end/corner/butt joint/J-trim/window flashing) | e.g. CA48AA44ZX, CA43, CA41 | `cladding_trim_kit` | Shadowline or Castellation per profile-code suffix (UH61/UH58/UH93 vs US31) |

Trim kits are colour-matched ("All Finishing Trims are available by colour") — do not create a
separate `staged_system_colours` row per trim; note `"colour_matched_to_board": true` in
`parser_notes` instead.

---

## BAL rating

BAL29-rated status is stated per-profile in the spec table for some Terrace/Coastal profiles
(e.g. US49C, US54C, US142C). Extract only when explicitly marked — do not infer BAL rating for
profiles where the column is blank or "N/A".
