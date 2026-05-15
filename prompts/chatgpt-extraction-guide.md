# ChatGPT Extraction Guide — New Manufacturer

Use this guide to extract structured product data from any manufacturer PDF catalogue.
Complete each block in order. Paste each block as a new message in ChatGPT.

---

## Before You Start

You need these files ready to attach:
- The manufacturer PDF catalogue
- `staged_systems_columns.csv`
- `staged_system_profiles_columns.csv`
- `staged_system_colours_columns.csv`
- `staged_components_columns.csv`

These column CSVs live in `data/extractions/column-schemas/` in this repo.

---

## Block 1 — Systems, Profiles and Colours

Attach: **PDF catalogue + staged_systems_columns.csv + staged_system_profiles_columns.csv + staged_system_colours_columns.csv**

Paste this prompt:

---

You are extracting structured product data from the attached manufacturer catalogue.

I have attached three CSV files showing the exact column structure required: one for **systems**, one for **profiles**, and one for **colours**. I have also attached the catalogue PDF.

**What is a system?**
A system is a primary product a builder selects — a cladding board, panel, sheet, lining, flooring product, weatherboard, or wall system. Each distinct product family is one system row. Do not list individual sizes as separate systems.

**What is a profile?**
A profile is each individual size or variant of a system. If a product comes in 3 lengths and 2 widths, that is 6 profile rows — one per size/SKU combination.

**What is a colour?**
A colour is a named colour or finish option for a system. Many manufacturers list colour ranges per product. If there are no colours in this catalogue, skip the colours CSV entirely.

**Rules:**
- Only extract values explicitly stated in the catalogue. If not printed, leave the cell blank.
- Every profile gets its own row. Do not merge multiple sizes.
- For `length_m`: if a product comes in multiple lengths, set `length_m` to blank and put the full description in `dimensions` only. Never put semicolons or commas in a numeric column.
- Set `verification_status` to `pending_review` on every row.
- Leave all FK/ID columns blank (id, staged_system_id, manufacturer_id, etc).
- Add a `system_name` column as the **first data column** on both profiles and colours so rows can be matched back to their system.
- Use exact system names consistently — the same name must appear in systems, profiles, and colours.
- Do not infer, estimate, or fill in typical values. Blank is correct when not stated.

**Output:**
Three separate CSV files — systems, profiles, colours — following the attached column order exactly.

Extract all systems, profiles and colours from this catalogue now.

---

## Block 2 — Components (Accessories)

Start a **new ChatGPT message** in the same chat (keep the PDF attached).

Attach: **staged_components_columns.csv**

Paste this prompt:

---

Now extract components from the same catalogue.

I have attached the components CSV showing the exact column structure. The catalogue PDF is still attached.

**What is a component?**
A component is anything a builder needs to install a system that is NOT the primary board, panel, or sheet. This includes:
- Trims, jointers, corner beads, base trims, flashings
- Screws, fixings, clips, washers
- Tapes, sealants, adhesives
- Tools listed in the accessories section (blades, fibreshears, knives)
- Insulation, weather barriers, or other sub-components listed under a system

**Rules:**
- Only extract values explicitly stated. Leave blank if not printed.
- Each component gets its own row.
- Add a `system_name` column as the **first data column** — use the exact system name from Block 1.
- If a component appears under multiple systems, repeat the row for each system with a different system_name.
- Set `verification_status` to `pending_review` on every row.
- Leave all FK/ID columns blank.
- Do not include the primary boards/panels/sheets — those are already in profiles.

**Output:**
One CSV file following the attached column order exactly.

Extract all components for all systems now.

---

## After Extraction — Quality Check

Before loading to the database, check:

1. **No semicolons in numeric columns** — `length_m`, `length_mm`, `width_mm` etc must be single numbers or blank.
2. **system_name matches exactly** — copy/paste names from the systems CSV to avoid mismatches.
3. **verification_status = pending_review** on all rows.
4. **FK columns blank** — id, staged_system_id, manufacturer_id, etc.

Paste each CSV into Claude Code for assessment before loading.

---

## Loading to the Database

Once CSVs are assessed and saved to `data/extractions/<manufacturer-slug>/`:

```bash
# Dry run first — no writes
pnpm import:csv -- \
  --manufacturer "Manufacturer Name" \
  --systems    data/extractions/<slug>/systems.csv \
  --profiles   data/extractions/<slug>/profiles.csv \
  --components data/extractions/<slug>/components.csv \
  --dry-run

# Live write — requires local Supabase running
pnpm import:csv -- \
  --manufacturer "Manufacturer Name" \
  --systems    data/extractions/<slug>/systems.csv \
  --profiles   data/extractions/<slug>/profiles.csv \
  --components data/extractions/<slug>/components.csv \
  --confirm-local-write
```

Requires in `.env.local`:
```
LOCAL_ONLY_ALLOW_SERVICE_ROLE=true
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<your local key>
```

---

## File Naming Convention

```
data/extractions/
  james-hardie/
    systems.csv
    profiles.csv
    components.csv
  <next-manufacturer>/
    systems.csv
    profiles.csv
    components.csv
    colours.csv      ← only if colours exist
```
