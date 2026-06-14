# Extraction hints — pro clima Australia

## Manufacturer context
- Manufacturer: **pro clima Australia** (proclima.com.au)
- Australian-made: **false** — products made in Germany, distributed in Australia by Pro Clima Australia Pty Ltd
- Products: weather resistive barriers, intelligent air barriers, adhesive tapes, sealants, sealing grommets and accessories
- Category: `Building Wrap & Membranes`

## Systems — 42 distinct product lines

Extract exactly the following systems. Each named product in the catalogue is a separate system. Do **not** group different roll sizes or SKUs as separate systems — roll variants are noted in the description.

### Weather Resistive Barriers (WRB)

| System name | Subcategory | Key feature |
|---|---|---|
| SOLITEX EXTASANA® | Wall WRB | 180-day UV, non-porous TEEE film, Class 4 vapour permeable |
| SOLITEX EXTASANA ADHERO® | Self-Adhesive Wall/Roof WRB | Full self-adhesion, 180-day UV, solid adhesive |
| SOLITEX ADHERO® FC | Self-Adhesive Wall/Roof WRB | Full-surface adhesion, wind/rain protection, Class 4 |
| SOLITEX ADHERO® VISTO | Self-Adhesive Floor/Intermediate WRB | Transparent, 6-week UV, anti-slip, for CLT/mass timber |
| SOLITEX ADHERO® VISTO strips | Connection Strip / Façade Control Joint | Transparent joint strips + TPU control joint material |
| TFLEX® | Wall WRB | Listed in catalogue TOC — extract if body page present |
| SOLITEX MENTO® PLUS | Roof WRB | 180-day UV, scrim-reinforced, medium duty |
| SOLITEX MENTO® 5000 | Roof WRB | 180-day UV, up to 120°C, light duty, metal roofs |
| SOLITEX MENTO® ULTRA | Roof WRB | Extra heavy duty, scrim-reinforced, 180-day UV |
| DA | Wall WRB (vapour barrier) | Tropical climates, Class 2 vapour barrier + airtight |
| 8mm 3D Separation Mesh | Roof/Façade separation layer | Polypropylene, acoustic + ventilation, 90-day UV |

### Intelligent Air Barriers (IAB)

| System name | Subcategory | Key feature |
|---|---|---|
| INTELLO® PLUS | Intelligent Air Barrier | Humidity-variable, Hydrosafe® technology, Class 2–3 |
| INTELLO® conneX | IAB Connection Strip | Junctions for INTELLO® PLUS system, 90-day UV |
| AEROSANA® VISCONN | Sprayable Airtightness Sealant | Brush/spray on, humidity-variable, acrylate |
| AEROSANA® VISCONN WHITE | Sprayable Airtightness Sealant | White colour variant of AEROSANA® VISCONN |
| AEROSANA® VISCONN FIBRE | Fibre-Reinforced Sprayable Sealant | Fibre-reinforced, for larger gaps up to 20mm |
| AEROSANA® VISCONN FLEECE | Fleece for cracks/joints | PET fleece supplement for AEROSANA VISCONN products |
| AEROFIXX | Application Gun | Spray gun for AEROSANA® VISCONN sausages |
| AEROBOXX | Transport Case | Storage/transport case for AEROFIXX tool |

### Adhesives, Tapes & Accessories

| System name | Subcategory | Key feature |
|---|---|---|
| TESCON EXTORA® | Weathertight Sealing Tape | 180-day UV, polypropylene/acrylate, range of widths |
| TESCON EXTORA® PROFIL | Weathertight Sealing Tape | Split backing (12/23/25mm) for edge applications |
| TESCON EXTOSEAL® | Sill Tape (flashing) | Butyl rubber/acrylate, self-sealing, 180-day UV |
| TESCON® NAIDECK patch | Self-Sealing Patch | Double-sided butyl, for façade clip/brick tie penetrations |
| TESCON® NAIDECK | Self-Sealing Strip | Double-sided butyl for purlin/batten attachments |
| CONTEGA® EXO | Joinery Connection Tape (exterior) | Vapour permeable, 90-day UV, window/door connections |
| CONTEGA® IQ | Joinery Connection Tape | Listed in catalogue TOC — extract if body page present |
| CONTEGA® PV | Joinery Connection Tape | Listed in catalogue TOC — extract if body page present |
| TESCON® VANA | Multi-Purpose Adhesive Tape | Polypropylene/acrylate, indoor use, membrane overlaps |
| TESCON® PROFIL | Corner Sealing Tape | Three-strip release paper, corner and junction applications |
| PRESSFIX | Pressing Tool | For activating adhesive tapes |
| PRESSFIX XL | Pressing Tool (large) | Specialist for SOLITEX EXTASANA ADHERO® |
| DUPLEX | Double Sided Tape | Bonding tape for membrane overlaps |
| ORCON® MULTIBOND | Joint Adhesive (roll-applied) | SOLID acrylate, for mineral/rough surfaces |
| ORCON® CLASSIC | Multi-Purpose Liquid Adhesive | Copolymer sealant, high elasticity |
| TESCON® PRIMER RP | Solvent-Free Primer | Acrylic copolymer primer for porous substrates |
| KAFLEX mono/duo | Cable Sealing Grommets | EPDM, 1 or 2 cable penetrations |
| KAFLEX multi | Cable Sealing Grommets | EPDM, up to 16 cable penetrations |
| KAFLEX post | Cable Sealing Patch | For already-installed cables, EPDM/PP fleece |
| ADHERO® VISTO Floor Drain | Drainage Accessory | PVC drain for SOLITEX ADHERO® systems |
| ROFLEX 20 | Pipe Sealing Grommet | EPDM, pipes 15–30mm diameter |
| ROFLEX 30/50/100/150/200/250/300 | Pipe Sealing Grommets | EPDM range, pipes 30–320mm diameter |
| INSTAABOX | Accessory | Listed in catalogue TOC — extract if body page present |

## Profiles
**None.** Pro clima products do not have height/length profiles in the traditional sense. Roll dimensions and coverage areas vary per SKU — capture these in the system `description` field only. Do not create `system_profiles` rows.

## Colours
**None.** Products do not come in colour variants. Do not extract colours.

## Components
Components are **other pro clima products explicitly recommended or required** on a system's catalogue page. Only extract a component link when the source page text directly names another pro clima product as required, recommended, or part of the system.

**Critical rules:**
- NEVER extract a component that has its own catalogue page as a component — it is a system. Every named product in the systems list above is a system, not a component.
- ONLY extract components where the source text says something like "use with", "required", "recommended with", "part of the system", or lists products under an "accessories" or "system components" heading on that page.
- Roll sizes, SKU codes, and packaging variants (e.g. "available in 60mm, 100mm") are NOT components — they belong in the system description only.

**Known component relationships to look for:**

| System | Likely components (only if stated on that system's page) |
|---|---|
| SOLITEX EXTASANA® | TESCON EXTORA®, TESCON EXTOSEAL®, TESCON® NAIDECK patch, PRESSFIX |
| SOLITEX EXTASANA ADHERO® | PRESSFIX XL, TESCON EXTOSEAL® |
| SOLITEX ADHERO® VISTO | ADHERO® VISTO Floor Drain, SOLITEX ADHERO® VISTO strips, TESCON EXTOSEAL® |
| INTELLO® PLUS | INTELLO® conneX, TESCON® VANA, ORCON® MULTIBOND, INSTAABOX |
| AEROSANA® VISCONN | AEROFIXX, AEROBOXX, AEROSANA® VISCONN FLEECE |
| AEROSANA® VISCONN WHITE | AEROFIXX, AEROBOXX |
| AEROSANA® VISCONN FIBRE | AEROFIXX, AEROBOXX |
| KAFLEX mono/duo | TESCON® VANA, TESCON EXTORA® |
| KAFLEX multi | TESCON® VANA, TESCON EXTORA® |
| KAFLEX post | TESCON® VANA |
| ROFLEX 20 | TESCON EXTORA®, TESCON® NAIDECK patch |
| ROFLEX 30/50/100/150/200/250/300 | TESCON EXTORA®, TESCON® NAIDECK patch |
| INSTAABOX | TESCON® VANA |

## Product codes (ID codes)
Products have ID codes (e.g. `1AR04701`, `13323`). Include these in the system `description` or `parser_notes` — they are useful reference but BuildQuote does not have a dedicated product-code field at the system level.

## UOM
- Membrane/barrier rolls: `m2` (coverage per roll)
- Tapes: `m` (linear metres)
- Adhesives/sealants: `unit` (per cartridge, bucket, or sausage)
- Tools and accessories (PRESSFIX, AEROFIXX, AEROBOXX, floor drain): `unit`
- Grommets (KAFLEX, ROFLEX): `unit` (sold per pack of 2, 5, 10, 20, or 30)

## Key system attributes
- `australian_made` = false (all systems — manufactured in Germany)
- `moisture_resistant` = true (all WRB and IAB products); null for tools and grommets
- `double_sided` = false
- `structural_grade` = null
- No fire or acoustic ratings listed (flammability index < 5 per AS 1530.2 is listed but not a rated classification)

## Category mapping
- WRB products → category: `Building Wrap & Membranes`
- IAB products → category: `Building Wrap & Membranes`
- Tapes, adhesives, tools, grommets → category: `Building Wrap & Membranes` (accessories to the membrane systems)

## Notes
- "pro clima" brand name uses lowercase p and c — preserve this casing in system names where brand name is mentioned but use proper case for the system product name itself (e.g. "SOLITEX EXTASANA®")
- TFLEX®, CONTEGA® IQ, CONTEGA® PV, and INSTAABOX are listed in the TOC but their detail pages may not have been captured by Docling (images-only pages). Extract what is present; skip if not found.
- The last two pages (chunk 7, pages 43–44) are contact/distributor pages — no product data to extract.
