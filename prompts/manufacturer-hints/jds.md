# Extraction hints — JDS Metal Doorframes

## Manufacturer context
- Manufacturer: **JDS Metal Doorframes** (jdsmetaldoorframes.com.au)
- Australian-made: **true** — manufactured in Maddington WA
- Products: steel/Zincanneal metal doorframes for residential and commercial construction
- Category: `Door Frames`

## Systems — 12 distinct product lines

Extract exactly these 12 systems and no others. The back page of the catalogue lists product names in a different naming convention (e.g. "Regal Frame", "Regal Knockdowns", "Modular Frame", "Split Frames") — **ignore the back page summary entirely**. Use only the dedicated body-page sections for each product. Do not create duplicate systems from the back page.

| System name | Construction type | Material | Back opening |
|---|---|---|---|
| RegalFrame | Welded — brick construction | 1.05mm Zincanneal | 95 or 114mm B/O |
| JDS Deluxe Frame | Welded — brick construction | 1.05mm Zincanneal | 95 or 114mm B/O |
| Negative Rebate Frame | Welded — brick construction | 1.1mm Zincanneal | 92mm B/O |
| RegalFrame Knockdown | Knockdown — stud construction | 1.0mm Zincanneal | 89/95/102/114mm B/O |
| JDS Deluxe Knockdown | Knockdown — stud construction | 1.05mm Zincanneal | 95/114mm B/O |
| TenBend Knockdown | Knockdown — stud construction | 1.0mm Zincanneal | 89/95/102/114mm B/O |
| Cavity Slider Knockdown Kit | Knockdown — stud construction | 1.0mm Zincanneal | 114mm B/O standard |
| Standard Split Frame | Split — stud/brick/block/concrete | 1.2mm Zincanneal | 85–150mm B/O |
| 3 Section Split Frame | Split — transportable homes | 1.2mm Zincanneal | 160mm min B/O |
| TenBend 3 Section Split Frame | Split — transportable homes | 1.05mm Zincanneal | 160mm min B/O |
| Commercial Frame | Custom — all construction types | 1.2–2.0mm Zincanneal/Galv/SS | Custom |
| Meter Boxes | Accessory | 1.0mm TCT Galva bond | N/A |

## Profiles

Door heights are the primary profile variant — extract as `system_profiles`:
- **Standard Door Height** — 2040mm (25c) — 2 hinges standard
- **Full Door Height** — 2340mm (28c) — 3 hinges standard

Use `height_mm` for the door height (2040 or 2340).
Use the `dimensions` field to note available door widths.

Standard frame widths (single): 620, 720, 820, 870, 920mm
Standard frame widths (double): 1240, 1440, 1640, 1840mm
Cavity Slider widths (single): 720, 820, 870, 920, 1020, 1200mm

**No product codes** — frames are made to order, no fixed SKUs in catalogue.

## Colours
**None.** Frames are unfinished Zincanneal — customers paint. Do not extract any colours.

## Components
**None.** Hinges, strikers, mullions and track systems are included with frames, not sold as separate line items. Do not extract components.

## UOM
- Doorframes: `unit` (per frame)
- Meter boxes: `unit` (per box)

## Key system attributes
- `australian_made` = true (all systems)
- `moisture_resistant` = false
- `double_sided` = false
- `structural_grade` = null
- No fire or acoustic ratings

## Meter Boxes note
Meter boxes are a distinct product category. Extract as a single system named "Meter Boxes" with a description covering both rebated and non-rebated, single and combination (gas/electric) variants. No profiles needed — available in stock, same-day pickup.
