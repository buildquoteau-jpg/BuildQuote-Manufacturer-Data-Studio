#!/usr/bin/env python3
"""
insert_ametalin_systems.py

Direct insert of Ametalin staged_systems + staged_system_profiles.
Data sourced from individual TDS PDFs — bypasses Docling + AI parser.

Usage:
    python scripts/parser/insert_ametalin_systems.py --manufacturer-id <uuid> [--dry-run]

Run BEFORE patch_ametalin_known_urls.py and the web enricher.
"""

import argparse, os, json, urllib.request, urllib.parse
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ─── Systems ──────────────────────────────────────────────────────────────────
# Each entry: system fields + "profiles" list.
# Profiles: (profile_name, dimensions, width_mm, length_mm, thickness_mm, uom, pack_qty)
# length_mm = roll length in mm (e.g. 30m = 30000)

SYSTEMS = [

    # ── Non-Combustible Membranes ─────────────────────────────────────────────

    {
        "name":             "Ametalin CeaseFire®",
        "product_code":     "CF",
        "category":         "Non-Combustible Membrane",
        "subcategory":      "Roof & Wall",
        "description": (
            "Advanced vapour permeable wall and roof membrane designed as a "
            "non-combustible pliable building membrane for Type A and B fire "
            "resisting constructions. Single-layer E-glass fabric with hydrophobic "
            "polymer infusion. Class 4 Vapour Permeable, Air Barrier, Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Not deemed combustible — Flammability Index Low (1), Group 1",
        "moisture_resistant": True,
        "notes": (
            "Suitable for Climate Zones 2–8. For CZ1 and north of Tropic of Capricorn "
            "in CZ2, substitute FireSark® Vapour Barrier."
        ),
        "profiles": [
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.17, "roll", 1),
        ],
    },

    {
        "name":             "FireSark®",
        "product_code":     "FS",
        "category":         "Non-Combustible Membrane",
        "subcategory":      "Roof & Wall",
        "description": (
            "Extra Heavy Duty radiant barrier for roof and wall where fire performance "
            "is a priority. Three-layer construction: non-combustible E-glass fabric, "
            "97% reflective aluminium foil, fire-resistant polymer adhesive. "
            "Class 2 Vapour Barrier, Water and Air Barrier."
        ),
        "bal_rating":       "All BAL zones to FZ",
        "fire_rating":      "Not deemed combustible — Flammability Index Low (1)",
        "moisture_resistant": True,
        "notes": (
            "Class 2 Vapour Barrier — suitable for CZ1–3 walls and all CZ roof "
            "applications. Not suitable for CZ4–8 cathedral/raked tile roofs."
        ),
        "profiles": [
            ("1350mm × 30m", "1350mm × 30m (40.5m²)", 1350, 30000, 0.20, "roll", 1),
        ],
    },

    {
        "name":             "FireSark® Micro-perforated",
        "product_code":     "FS-B",
        "category":         "Non-Combustible Membrane",
        "subcategory":      "Wall",
        "description": (
            "Extra Heavy Duty vapour permeable reflective wall wrap for DtS "
            "Non-Combustible constructions. Three-layer: E-glass fabric, 97% reflective "
            "aluminium foil, fire-resistant polymer adhesive. Class 3 Vapour Permeable, "
            "Air Barrier, Non-Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Not deemed combustible — Flammability Index Low (1), Early Fire Hazard 0/0/0/2",
        "moisture_resistant": True,
        "notes": (
            "Class 3 Vapour Permeable — not recommended for wet tropical zones (CZ1). "
            "Ideal for drained cavity systems in CZ6–8. Non-Water Barrier classification."
        ),
        "profiles": [
            ("1350mm × 30m", "1350mm × 30m (40.5m²)", 1350, 30000, 0.20, "roll", 1),
        ],
    },

    # ── Reflective Sarking (SilverSark® — roof-focused) ──────────────────────

    {
        "name":             "SilverSark® HVB",
        "product_code":     "XHD-HVB",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof & Wall",
        "description": (
            "High Vapour Barrier wall wrap and roof sarking for Climate Zone 1 "
            "and north of the Tropic of Capricorn in CZ2. Four-layer: woven "
            "polypropylene, 97% reflective aluminium foil, fire-resistant polymer "
            "adhesive, polymer flood coat. Class 1 Vapour Barrier, Air and Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Designed for CZ1 and north CZ2. For CZ6–8 use a Class 3+ permeable wrap "
            "on the outside of insulation."
        ),
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)", 1350, 60000, 0.17, "roll", 1),
        ],
    },

    {
        "name":             "SilverSark® TRE",
        "product_code":     "XHD-TRE",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof",
        "description": (
            "Heavy-weight reflective sarking for tile and metal roofs. Four-layer: "
            "woven polypropylene (×2), 97% reflective aluminium foil, polymer adhesive. "
            "Class 2 Vapour Barrier, Air and Water Barrier. Heavier weight aids "
            "easier roof installation."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Suitable CZ1–8 roofs and CZ1–3 walls. Not for residential walls in CZ4–8 "
            "or cathedral/raked tile roofs in CZ6–8 — use VapourTech® RWC instead."
        ),
        "profiles": [
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.22, "roll", 1),
        ],
    },

    {
        "name":             "SilverSark® HD",
        "product_code":     "HD",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof & Wall",
        "description": (
            "Heavy Duty single-sided radiant barrier for multi-purpose use as roof "
            "sarking and wall wrap. Four-layer: woven polypropylene, 97% reflective "
            "aluminium foil, fire-resistant polymer adhesive, polymer flood coat. "
            "Class 2 Vapour Barrier, Air and Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Suitable for Climate Zones 1–3 as roof sarking and wall wrap.",
        "profiles": [
            ("1200mm × 60m", "1200mm × 60m (72m²)",  1200, 60000, 0.12, "roll", 1),
            ("1350mm × 60m", "1350mm × 60m (81m²)",  1350, 60000, 0.12, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",  1500, 30000, 0.12, "roll", 1),
            ("1500mm × 60m", "1500mm × 60m (90m²)",  1500, 60000, 0.12, "roll", 1),
        ],
    },

    {
        "name":             "SilverSark® XHD",
        "product_code":     "XHD",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof & Wall",
        "description": (
            "Extra Heavy Duty single-sided radiant barrier for multi-purpose use as "
            "roof sarking and wall wrap. Four-layer: woven polypropylene, 97% reflective "
            "aluminium foil, fire-resistant polymer adhesive, polymer flood coat. "
            "Class 2 Vapour Barrier, Air and Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "All climate zone roof sarking; wall wrap in Climate Zones 1–3."
        ),
        "profiles": [
            ("1200mm × 60m", "1200mm × 60m (72m²)",   1200, 60000, 0.17, "roll", 1),
            ("1350mm × 30m", "1350mm × 30m (40.5m²)", 1350, 30000, 0.17, "roll", 1),
            ("1350mm × 60m", "1350mm × 60m (81m²)",   1350, 60000, 0.17, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",   1500, 30000, 0.17, "roll", 1),
            ("1500mm × 60m", "1500mm × 60m (90m²)",   1500, 60000, 0.17, "roll", 1),
        ],
    },

    {
        "name":             "SilverSark® xR HD",
        "product_code":     "HD-XR",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof & Wall",
        "description": (
            "Heavy Duty double-sided radiant barrier with extra R-value reflective "
            "air space. Anti-glare low-glare ink on one side. Designed for under metal "
            "deck roofs (temps exceeding 80°C) and battened-out cladding. "
            "Class 2 Vapour Barrier, Air and Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            None,
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)",  1350, 60000, 0.17, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",  1500, 30000, 0.17, "roll", 1),
        ],
    },

    {
        "name":             "SilverSark® xR XHD",
        "product_code":     "XHD-XR",
        "category":         "Reflective Sarking",
        "subcategory":      "Roof & Wall",
        "description": (
            "Extra Heavy Duty double-sided radiant barrier with extra R-value. "
            "Anti-glare ink on one side. Designed for under metal deck roofs and "
            "battened-out cladding. Class 2 Vapour Barrier, Air and Water Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            None,
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)",  1350, 60000, 0.17, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",  1500, 30000, 0.17, "roll", 1),
        ],
    },

    # ── Reflective Wall Wraps (SilverWrap® family) ───────────────────────────

    {
        "name":             "SilverWrap® LD",
        "product_code":     "LD",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Light Duty reflective wall wrap for Climate Zone 1–3 wall systems "
            "and under metal roofs. Four-layer: woven polypropylene, 97% reflective "
            "aluminium foil, polymer adhesive, polymer flood coat. Class 2 Vapour "
            "Barrier, Air and Water Barrier. Group 1 fire performance for wall/ceiling lining."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5), Group 1",
        "moisture_resistant": True,
        "notes":            "CZ1–3 walls. Can be used as facing material for bulk insulation.",
        "profiles": [
            ("1350mm × 10m", "1350mm × 10m (13.5m²)", 1350, 10000, 0.09, "roll", 1),
            ("1350mm × 60m", "1350mm × 60m (81m²)",   1350, 60000, 0.09, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",   1500, 30000, 0.09, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® LD Micro-perforated",
        "product_code":     "LD-B",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Light Duty vapour permeable reflective wall wrap for brick veneer and "
            "drained cavity systems. Micro-perforated to Class 4 Vapour Permeable. "
            "97% reflective foil, Air Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Class 4 Vapour Permeable — not for wet tropical zones (CZ1). "
            "Suitable CZ2–8 drained cavity systems."
        ),
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)", 1350, 60000, 0.09, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.09, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® MD",
        "product_code":     "MD",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Medium Duty reflective wall wrap for wall systems and under metal roofs. "
            "Four-layer: woven polypropylene, 97% reflective aluminium foil, polymer "
            "adhesive, polymer flood coat. Class 2 Vapour Barrier, Air and Water Barrier. "
            "Group 1 fire performance for wall/ceiling lining."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5), Group 1",
        "moisture_resistant": True,
        "notes":            "CZ1–3 walls. Can be used as facing material for bulk insulation.",
        "profiles": [
            ("1350mm × 30m", "1350mm × 30m (40.5m²)", 1350, 30000, 0.10, "roll", 1),
            ("1350mm × 60m", "1350mm × 60m (81m²)",   1350, 60000, 0.10, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",   1500, 30000, 0.10, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® MD Micro-perforated",
        "product_code":     "MD-B",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Medium Duty vapour permeable reflective wall wrap for brick veneer and "
            "drained cavity systems. Micro-perforated to Class 4 Vapour Permeable. "
            "97% reflective foil, Air Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Class 4 Vapour Permeable — not for wet tropical zones (CZ1). "
            "Suitable CZ2–8."
        ),
        "profiles": [
            ("1350mm × 30m", "1350mm × 30m (40.5m²)", 1350, 30000, 0.10, "roll", 1),
            ("1350mm × 60m", "1350mm × 60m (81m²)",   1350, 60000, 0.10, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",   1500, 30000, 0.10, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® HD Micro-perforated",
        "product_code":     "HD-B",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Heavy Duty vapour permeable reflective wall wrap for brick veneer and "
            "drained cavity systems. Micro-perforated to Class 3 Vapour Permeable. "
            "97% reflective foil, Air Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Class 3 Vapour Permeable — not for wet tropical zones (CZ1).",
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)", 1350, 60000, 0.12, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.12, "roll", 1),
            ("1500mm × 60m", "1500mm × 60m (90m²)", 1500, 60000, 0.12, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® XHD Micro-perforated",
        "product_code":     "XHD-B",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Extra Heavy Duty vapour permeable reflective wall wrap for brick veneer, "
            "double brick and drained cavity systems. Micro-perforated to Class 3 "
            "Vapour Permeable. 97% reflective foil, Air Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Class 3 Vapour Permeable — not for wet tropical zones (CZ1).",
        "profiles": [
            ("1350mm × 60m", "1350mm × 60m (81m²)", 1350, 60000, 0.17, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.17, "roll", 1),
        ],
    },

    {
        "name":             "SilverWrap® xR HD Micro-perforated",
        "product_code":     "HD-XR-B",
        "category":         "Reflective Wall Wrap",
        "subcategory":      "Wall",
        "description": (
            "Heavy Duty vapour permeable double-sided reflective wall wrap with extra "
            "R-value for masonry and brick veneer drained cavity systems. Anti-glare "
            "outward-facing foil creates a reflective air cavity between stud frame "
            "and brick leaf. Micro-perforated to Class 4 Vapour Permeable, Air Barrier."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Class 4 Vapour Permeable — not for wet tropical zones (CZ1). "
            "Ideal for CZ6–8 drained cavity systems."
        ),
        "profiles": [
            ("1350mm × 30m", "1350mm × 30m (40m²)", 1350, 30000, 0.17, "roll", 1),
        ],
    },

    # ── Vapour Permeable Membranes (VapourTech® — non-reflective) ────────────

    {
        "name":             "VapourTech® RWC Roof Wall Commercial",
        "product_code":     "VTRWC",
        "category":         "Vapour Permeable Membrane",
        "subcategory":      "Roof & Wall",
        "description": (
            "High permeance Class 4 Vapour Permeable pliable building membrane for "
            "commercial and residential roofs, facades and wall systems. Four-layer: "
            "two spun-bonded fabric outer layers protecting high permeance film and "
            "reinforcing scrim. Air Barrier, Water Barrier. Non-conductive, UV resistant."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Suitable CZ2–8. For CZ1 and north CZ2, substitute Class 1 or 2 Vapour "
            "Barrier. Less than 1mm thick — DtS Non-combustible compliant."
        ),
        "profiles": [
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.83, "roll", 1),
        ],
    },

    {
        "name":             "VapourTech® Wall",
        "product_code":     "VTW",
        "category":         "Vapour Permeable Membrane",
        "subcategory":      "Wall",
        "description": (
            "Class 4 Vapour Permeable wall wrap for use behind most cladding types. "
            "Triple-layer: two spun-bonded fabric outer layers protecting a high "
            "permeance film core. Air Barrier, Water Barrier. 90 days UV exposure. "
            "Non-reflective, non-conductive."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "Suitable CZ2–8. For CZ1/north CZ2, substitute SilverSark® HVB or "
            "SilverSark® xR. For brick veneer with reflective cavity, prefer "
            "SilverWrap® xR HD Micro-perforated."
        ),
        "profiles": [
            ("1500mm × 30m", "1500mm × 30m (45m²)", 1500, 30000, 0.45, "roll", 1),
        ],
    },

    {
        "name":             "VapourTech® Brane® VHP",
        "product_code":     "VHP",
        "category":         "Vapour Permeable Membrane",
        "subcategory":      "Wall",
        "description": (
            "Very High Permeance (VHP) Light Wall Duty vapour permeable wall wrap "
            "for a wide range of wall systems. Triple-layer: two spun-bonded fabric "
            "outer layers protecting VHP membrane core. Class 4 Vapour Permeable, "
            "Water Barrier. Available in jumbo 2740mm width roll to halve install time."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Suitable CZ2–8 only. Not for CZ1.",
        "profiles": [
            ("1370mm × 30m", "1370mm × 30m (41.1m²)", 1370, 30000, 0.38, "roll", 1),
            ("1500mm × 30m", "1500mm × 30m (45m²)",   1500, 30000, 0.38, "roll", 1),
            ("2740mm × 30m", "2740mm × 30m (82.2m²)", 2740, 30000, 0.38, "roll", 1),
        ],
    },

    # ── Thermal Products ──────────────────────────────────────────────────────

    {
        "name":             "ThermalBreak®",
        "product_code":     "TB7",
        "category":         "Thermal Break",
        "subcategory":      "Roof & Wall",
        "description": (
            "Extra Heavy Duty three-in-one reflective insulation, thermal break and "
            "Class 2 Vapour Barrier for steel and timber framed construction. "
            "7.8mm XPE foam core with aluminium foil one side (emissivity 0.03) "
            "and polymer weave the other. Meets NCC R0.2 in-situ thermal break "
            "requirement for steel frame."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5), Group 1",
        "moisture_resistant": True,
        "notes":            "Material R-value R0.21 in-situ. Acoustic dampener.",
        "profiles": [
            (
                "1350mm × 22.25m",
                "1350mm × 22.25m + 150mm flap (30m²)",
                1350, 22250, 7.8, "roll", 1,
            ),
        ],
    },

    {
        "name":             "ThermalLiner™",
        "product_code":     "TB4",
        "category":         "Thermal Insulation",
        "subcategory":      "Roof & Wall",
        "description": (
            "Extra Heavy Duty three-in-one reflective foam insulation, thermal break "
            "and Class 2 Vapour Barrier for residential homes and commercial sheds. "
            "4mm XPE foam core with 95%/97% reflective aluminium foil on each side. "
            "Material R-value R0.1. Acoustic dampener."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Designed for shed roofs and walls. Material R0.11 in-situ.",
        "profiles": [
            ("1500mm × 20m", "1500mm × 20m (30m²)", 1500, 20000, 4.0, "roll", 1),
        ],
    },

    # ── Floor Products ────────────────────────────────────────────────────────

    {
        "name":             "SilverFloor®",
        "product_code":     "SF",
        "category":         "Reflective Floor Insulation",
        "subcategory":      "Floor",
        "description": (
            "Heavy Duty double-sided vapour permeable reflective floor insulation "
            "for use under floors with a sealed air space above enclosed sub-floor. "
            "Six-layer: woven polypropylene, polymer flood coat, polymer adhesive "
            "and 97% reflective aluminium foil on both sides. 5mm weep holes at "
            "400mm intervals allow moisture drainage."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes": (
            "For exposed sub-floor (pole construction), install a lining under "
            "the floor joists below this product."
        ),
        "profiles": [
            ("500mm × 60m",  "500mm × 60m (30m²)",  500,  60000, 0.13, "roll", 1),
            ("1500mm × 60m", "1500mm × 60m (90m²)", 1500, 60000, 0.13, "roll", 1),
        ],
    },

    {
        "name":             "ThermalFloor™",
        "product_code":     "TF",
        "category":         "Thermal Floor Insulation",
        "subcategory":      "Floor",
        "description": (
            "Extra Heavy Duty 2-in-1 reflective foam insulation and moisture "
            "management system for under floors with a sealed air space above "
            "enclosed sub-floor. 4mm XPE foam core with 97% reflective aluminium "
            "foil both sides. Weep holes allow moisture drainage. Scored for "
            "quick installation."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "Material R-value R0.1.",
        "profiles": [
            ("500mm × 60m", "500mm × 60m (30m²)", 500, 60000, 4.0, "roll", 1),
        ],
    },

    # ── Drainage Battens ──────────────────────────────────────────────────────

    {
        "name":             "Ametalin Cavity Drainage Battens™",
        "product_code":     "CDB-451200",
        "category":         "Drainage Batten",
        "subcategory":      "Roof & Wall",
        "description": (
            "Self-adhesive polypropylene drainage battens for creating a drained and "
            "ventilated cavity behind cladding. 10mm depth meets AS 4284 minimum "
            "required cavity. R0.15 thermal resistance in-situ."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "R0.15 thermal resistance in-situ. Self-adhesive PP foam strips.",
        "profiles": [
            ("10mm × 45mm × 1200mm", "10mm × 45mm × 1200mm (50/pack)", 45, 1200, 10.0, "pack", 50),
        ],
    },

    {
        "name":             "Ametalin ThermalCav™ Drainage Battens",
        "product_code":     "TCDB-451200",
        "category":         "Thermal Break Batten",
        "subcategory":      "Roof & Wall",
        "description": (
            "Thermal break drainage battens for steel frame construction. 20mm depth "
            "creates a drained cavity while providing R0.26 thermal break between "
            "cladding and steel frame, meeting the NCC 2022 R0.2 steel frame thermal "
            "break requirement."
        ),
        "bal_rating":       "All BAL zones",
        "fire_rating":      "Flammability Index Low (≤5)",
        "moisture_resistant": True,
        "notes":            "R0.26 thermal break in-situ — meets NCC 2022 R0.2 steel frame requirement.",
        "profiles": [
            ("20mm × 45mm × 1200mm", "20mm × 45mm × 1200mm (25/pack)", 45, 1200, 20.0, "pack", 25),
        ],
    },
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def insert_system(manufacturer_id: str, system: dict, dry_run: bool) -> str | None:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "manufacturer_id":   manufacturer_id,
        "name":              system["name"],
        "product_code":      system["product_code"],
        "category":          system["category"],
        "subcategory":       system["subcategory"],
        "description":       system["description"],
        "bal_rating":        system.get("bal_rating"),
        "fire_rating":       system.get("fire_rating"),
        "moisture_resistant": system.get("moisture_resistant", True),
        "notes":             system.get("notes"),
        "verification_status": "pending_review",
        "extracted_at":      now,
    }
    if dry_run:
        print(f"    [dry] would insert system: {system['name']}")
        return "DRY-RUN-UUID"

    url = f"{SUPABASE_URL}/rest/v1/staged_systems"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return result[0]["id"] if result else None
    except Exception as e:
        print(f"    [error] insert system failed: {e}")
        return None


def insert_profiles(system_id: str, system_name: str, profiles: list, dry_run: bool) -> int:
    ok = 0
    for i, (profile_name, dimensions, width_mm, length_mm, thickness_mm, uom, pack_qty) in enumerate(profiles):
        payload = {
            "staged_system_id":  system_id,
            "product_code":      None,
            "profile_name":      profile_name,
            "dimensions":        dimensions,
            "width_mm":          width_mm,
            "length_mm":         length_mm,
            "thickness_mm":      thickness_mm,
            "uom":               uom,
            "supplier_pack_qty": pack_qty,
            "sort_order":        i,
        }
        if dry_run:
            print(f"      [dry]  profile: {profile_name}")
            ok += 1
            continue

        url = f"{SUPABASE_URL}/rest/v1/staged_system_profiles"
        data = json.dumps(payload).encode()
        headers = {**_headers(), "Prefer": "return=minimal"}
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status in (200, 201):
                    ok += 1
        except Exception as e:
            print(f"      [error] profile {profile_name}: {e}")
    return ok


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manufacturer-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.dry_run and (not SUPABASE_URL or not SERVICE_KEY):
        print("[error] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        return

    mode = "DRY RUN" if args.dry_run else "LIVE"
    print(f"\n[insert_ametalin_systems] {mode} — {len(SYSTEMS)} systems\n")

    total_systems = total_profiles = failed = 0

    for system in SYSTEMS:
        profiles = system.pop("profiles", [])
        print(f"  {system['name']} ({system['product_code']})")

        sys_id = insert_system(args.manufacturer_id, system, args.dry_run)
        if not sys_id:
            print(f"    [error] skipping profiles")
            failed += 1
            continue

        n = insert_profiles(sys_id, system["name"], profiles, args.dry_run)
        print(f"    -> {n}/{len(profiles)} profiles inserted")
        total_systems += 1
        total_profiles += n

    print(f"\n[done] {mode}")
    print(f"  systems:  {total_systems}/{len(SYSTEMS)} inserted")
    print(f"  profiles: {total_profiles} inserted")
    if failed:
        print(f"  failed:   {failed}")


if __name__ == "__main__":
    main()
