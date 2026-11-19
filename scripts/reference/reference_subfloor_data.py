# Data for the "BuildQuote Reference Systems" generic subfloor cards.
# Source of truth: Decks WA docs/system-card-drafts.md (drafted 2026-11-18).
# EVERY size, grade and quantity is a PLACEHOLDER until a builder/engineer reviews it.
# Nothing here is verified; rows are inserted as pending_review and are NOT engineering advice.
#
# Tags carried into notes: [S] found in a published source, [R] general trade practice from memory
# (must be verified), [?] open question for a builder/engineer.

MANUFACTURER = {
    "name": "BuildQuote Reference Systems",
    "slug": "buildquote-reference-systems",
    "description": (
        "Generic, manufacturer-neutral reference systems for decks: what goes into a subframe, site preparation "
        "and coastal variants. These are RFQ templates, not manufacturer-certified systems or engineering "
        "specifications. Reviewed by a builder and an engineer before any item is marked verified."
    ),
}

DISCLAIMER = (
    "Generic RFQ template, not a manufacturer-certified system or engineering specification. Final sizes, grades, "
    "spacings, footings and compliance must be confirmed by the builder/engineer before ordering."
)

# Reference sources (links only; content is read at source, not copied).
SOURCES = {
    "tdg21": ("WoodSolutions — Domestic Timber Deck Design (TDG 21)", "https://www.woodsolutions.com.au/publications/domestic-timber-deck-design", "design_guide"),
    "wsuse": ("WoodSolutions — Preservative treatments and use classes", "https://www.woodsolutions.com.au/publications/preservative-treatments-and-use-classes", "design_guide"),
    "tpaa": ("TPAA — AS/NZS 1604 explained (TN-14)", "https://tpaa.com.au/wp-content/uploads/2025/06/TN-14-1604-explained.pdf", "tech_data"),
    "ncc22": ("NCC 2022 Housing Provisions Part 2.2 — Structural provisions", "https://www.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/2-structure/part-22-structural-provisions", "design_guide"),
    "ncc34": ("NCC 2022 Housing Provisions Part 3.4 — Termite risk management", "https://www.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/3-site-preparation/part-34-termite-risk-management", "design_guide"),
    "ib83": ("WA Building and Energy — IB 83 Termite management", "https://wa.gov.au/system/files/2024-10/ib_83_termite_management_standards_0.pdf", "tech_data"),
    "gaa": ("GAA — Corrosivity environment quick guide", "https://gaa.com.au/corrosivity-environment-a-quick-guide/", "tech_data"),
    "simpson": ("Simpson Strong-Tie — Corrosion protection for metal connectors", "https://strongtie.com.au/node/1853", "tech_data"),
    "qbcc": ("QBCC — Corrosion protection of joist hangers and connectors", "https://www.qbcc.qld.gov.au/resources/article/corrosion-protection-joist-hangers-other-connectors-requires-close-attention", "tech_data"),
    "bluescope": ("BlueScope — DECKFORM steel", "https://bluescopesteel.com.au/products/deckform-steel", "tech_data"),
    "hobson": ("Hobson — Corrosion resistance note", "https://cdn.hobson.com.au/documents/tech-corrosion-resistance-210825.pdf", "tech_data"),
    "bal": ("Busselton — Bushfire requirements summary (AS 3959)", "https://busselton.wa.gov.au/Profiles/busselton/Assets/ClientData/ECM_5480531_v1_Bushfire_Requirements_for_Residential_Construction.pdf", "tech_data"),
}

STANDARDS_NOTE = (
    "Standards referenced (paywalled — read at source, not reproduced): NCC 2022 Housing Provisions 2.2 and 3.4; AS 1684; "
    "AS/NZS 1604.1 (H3 above ground; H4/H5 ground contact); AS 3660.1 termite management; AS 3959 bushfire (BAL); "
    "AS/NZS 1170.1 imposed actions; AS 4312 atmospheric corrosivity (C1–C5, CX)."
)

# component tuple: (group/category, name, uom, role, note)
R, O, A = "required", "optional", "accessory"

TIMBER_COMPONENTS = [
    ("Structural timber", "Bearers", "lm", R, "Section, species, grade and hazard class per plans/engineer"),
    ("Structural timber", "Joists", "lm", R, "Maximum spacing is set by the decking board maker"),
    ("Structural timber", "Ledger (attached decks only)", "lm", O, "Only where fixed to the house"),
    ("Structural timber", "Posts", "each", R, "Prefer posts on stirrups, clear of the ground [S]. If timber goes in the ground, H4 vs H5 is an open conflict in sources [?]"),
    ("Structural timber", "Noggins / blocking", "lm", O, ""),
    ("Structural timber", "Edge / rim joist", "lm", O, ""),
    ("Structural timber", "Treated packers / shims", "each", O, ""),
    ("Footings & post bases", "Concrete (bags or bulk)", "bag", R, "Footing design per engineer / soil class"),
    ("Footings & post bases", "Formwork tubes (example 300 mm dia)", "each", O, ""),
    ("Footings & post bases", "Post stirrups / bases", "each", R, "Coating per environment; 75 mm+ clearance above finished ground [S]"),
    ("Footings & post bases", "Anchors for slab-mounted posts", "each", O, "Chemical or mechanical"),
    ("Footings & post bases", "Reinforcement (if engineer specifies)", "each", O, ""),
    ("Connectors", "Joist hangers", "each", R, ""),
    ("Connectors", "Framing anchors / triple grips", "each", R, ""),
    ("Connectors", "Post-to-bearer brackets or cleats", "each", R, ""),
    ("Connectors", "Angle brackets", "each", O, ""),
    ("Connectors", "Ledger and hold-down connectors (as engineered)", "each", O, ""),
    ("Bracing", "Timber knee / diagonal braces", "lm", O, "Builder/engineer to confirm when needed"),
    ("Bracing", "Galvanised strap bracing", "roll", O, ""),
    ("Bracing", "Brace brackets", "each", O, ""),
    ("Fixings", "Bolts M10/M12 with washers and nuts", "box", R, ""),
    ("Fixings", "Coach screws", "box", O, ""),
    ("Fixings", "Structural / timber screws", "box", R, ""),
    ("Fixings", "Connector nails", "box", O, ""),
    ("Fixings", "Ledger anchors (masonry or timber-frame house)", "each", O, ""),
    ("Protection", "Joist tape (example widths 45 / 70 / 100 mm)", "roll", A, "Protects the top of the joist from water"),
    ("Protection", "Cut-end preservative", "each", A, "[R] verify"),
    ("Protection", "Sill seal / DPC strip between timber and concrete or masonry", "roll", A, "[R] verify"),
    ("Protection", "Termite shields / caps (if specified)", "each", O, ""),
    ("Services", "Site delivery", "each", A, ""),
    ("Services", "Cut-to-length service", "service", A, "[R] verify"),
]

STEEL_COMPONENTS = [
    ("Structure", "Steel bearers", "lm", R, ""),
    ("Structure", "Steel joists", "lm", R, ""),
    ("Structure", "Steel posts with base plates", "each", R, ""),
    ("Structure", "Edge / rim members", "lm", O, ""),
    ("Structure", "Noggin / stiffener members", "lm", O, ""),
    ("Footings & bases", "Concrete", "bag", R, ""),
    ("Footings & bases", "Formwork tubes", "each", O, ""),
    ("Footings & bases", "Cast-in brackets or chemical/mechanical anchors", "each", R, ""),
    ("Footings & bases", "Packers / grout", "each", O, ""),
    ("Connections", "Bolts, nuts and washers", "box", R, ""),
    ("Connections", "Self-drilling / structural screws", "box", R, "Class to suit corrosion category [R]"),
    ("Connections", "Cleats, brackets and splice plates", "each", R, ""),
    ("Connections", "Joist-to-bearer connectors", "each", R, ""),
    ("Isolation & protection", "Isolation tape / strip between steel and boards or treated timber", "roll", A, "Treated timber can accelerate corrosion of fixings and brackets on exposed decks [S]"),
    ("Isolation & protection", "Zinc-rich touch-up paint / cold-galv spray", "each", A, "For cut and drilled edges [R]"),
    ("Isolation & protection", "Gaskets / nylon washers where dissimilar metals meet", "each", A, "[R] verify"),
    ("Bracing", "Steel strap or rod bracing", "roll", O, "Engineer to specify"),
    ("Decking compatibility", "Fixings / clips suited to fixing boards to steel", "box", R, "Maker-specific [?]"),
    ("Services", "Site delivery", "each", A, ""),
    ("Services", "Cutting / drilling to length", "service", A, ""),
]

CARDS = [
    dict(
        code="DWA-SITE", name="Deck Site Preparation", subcategory="Site preparation",
        description="Generic RFQ template for deck site preparation materials and services: clearing, setting out, excavation and levelling, ground cover, drainage, termite-management items and footing groundwork. " + DISCLAIMER,
        sources=["ncc34", "ib83", "tdg21"],
        attrs=[("Template type", "Generic RFQ template — not manufacturer-certified"), ("Covers", "Clearing, setting out, excavation, base and ground cover, drainage, termite management, services")],
        variables="Soil type/class; water table and drainage; slope and step-down from the house floor level; roots and stumps; existing slab or deck; machine access; underground services; termite barrier already on the house; council approvals (excavation, retaining, stormwater).",
        questions="[S] Sand or limestone may fall outside simple footing tables — consider a geotechnical assessment or engineer's design. [?] Is limestone/road base the usual base in Perth? [?] Ground clearance and ventilation requirements for the under-deck space.",
        profiles=[
            ("Base material", "Crushed rock / road base / limestone", "as locally supplied", "m3"),
            ("Coarse sand", "Bedding / levelling", "", "m3"),
            ("Gravel 20 mm", "Drainage / top layer", "20 mm", "m3"),
            ("Weed membrane / geotextile", "Roll 1.0 m x 25 m (example)", "1.0 m x 25 m", "roll"),
            ("Weed membrane / geotextile", "Roll 1.5 m x 25 m (example)", "1.5 m x 25 m", "roll"),
            ("Weed membrane / geotextile", "Roll 2.0 m x 25 m (example)", "2.0 m x 25 m", "roll"),
            ("Ag drain pipe 100 mm", "Coil 20 m (example)", "100 mm x 20 m", "coil"),
            ("Ag drain pipe 100 mm", "Coil 50 m (example)", "100 mm x 50 m", "coil"),
        ],
        components=[
            ("Clearing & demolition", "Skip bin hire", "each", O, ""),
            ("Clearing & demolition", "Existing deck/structure demolition and disposal", "service", O, ""),
            ("Clearing & demolition", "Tree, stump and root removal", "service", O, "AS 1684 expects the site cleared of logs, roots, stumps and timber debris [S]"),
            ("Clearing & demolition", "Weed control / herbicide", "each", O, ""),
            ("Setting out", "Builders line and pegs / stakes", "each", R, ""),
            ("Setting out", "Profile (batter) boards", "each", O, ""),
            ("Setting out", "Marking paint", "each", O, ""),
            ("Setting out", "Laser / rotary level hire", "each", O, ""),
            ("Excavation", "Post-hole auger or mini-excavator hire", "each", O, ""),
            ("Excavation", "Spoil removal", "service", O, ""),
            ("Base & ground cover", "Compacted base material", "m3", R, ""),
            ("Base & ground cover", "Plate compactor hire", "each", O, ""),
            ("Base & ground cover", "Weed membrane / geotextile", "roll", R, ""),
            ("Base & ground cover", "Gravel top layer 20 mm", "m3", O, ""),
            ("Drainage", "Ag drain pipe with sock", "lm", O, ""),
            ("Drainage", "Drainage gravel", "m3", O, ""),
            ("Drainage", "Junctions, outlets and fittings", "each", O, ""),
            ("Drainage", "Pit / sump", "each", O, ""),
            ("Drainage", "Downpipe connection kits", "each", O, "Check local stormwater rules [?]"),
            ("Termite management", "Physical barrier items where specified (capping, collars, shields)", "each", O, "Attachments such as decks must be 25 mm or more clear of the building, otherwise the barrier extends to include the deck (AS 3660.1) [S]"),
            ("Termite management", "Chemical treatment (licensed pest manager)", "service", O, ""),
            ("Termite management", "Inspection / access panel or hatch", "each", O, "[R] verify"),
            ("Services (not products)", "Dial Before You Dig check", "service", A, "[R] verify"),
            ("Services (not products)", "Geotechnical / soil test", "service", O, "[?]"),
            ("Services (not products)", "Engineer footing design", "service", O, "[?]"),
            ("Services (not products)", "Site delivery", "each", A, ""),
        ],
    ),
    dict(
        code="DWA-TSF", name="Timber Deck Subframe", subcategory="Timber subframe",
        description="Generic RFQ template for a timber deck subframe: bearers, joists, posts, footings groundwork, connectors, bracing, fixings and protection items. " + DISCLAIMER,
        sources=["tdg21", "wsuse", "tpaa", "ncc22", "bal"],
        attrs=[("Template type", "Generic RFQ template — not manufacturer-certified"), ("Frame material", "Timber — H3 above ground; H4 / Class 1 hardwood where close to ground or persistently wet [S]"), ("Structural grade", "As specified by plans or engineering"), ("BAL", "See the bushfire checklist — AS 3959 changes what the frame can be made from")],
        variables="Joist spacing (the decking board maker's maximum governs); bearer and joist section and span; post spacing and size; attached or freestanding; height; load (spa/tiles/planters); ground clearance; bracing; BAL; corrosivity category.",
        questions="[?] Which species/treatment do builders actually use here for bearers, joists, posts? [?] Standard footing approach for Perth sand and limestone? [?] When must an engineer, not the span tables, size the frame?",
        profiles=[(f"{s} x 45", f"Bearer / joist / ledger {s} x 45 (example stock size)", f"{s} x 45 mm", "lm") for s in (90, 140, 190, 240)]
                 + [(f"Post {s} x {s}", f"Post {s} x {s} (example stock size)", f"{s} x {s} mm", "each") for s in (100, 125, 150)],
        components=TIMBER_COMPONENTS,
    ),
    dict(
        code="DWA-SSF", name="Steel Deck Subframe", subcategory="Steel subframe",
        description="Generic RFQ template for a steel deck subframe: bearers, joists, posts, base plates, connections, coatings and isolation items. " + DISCLAIMER,
        sources=["bluescope", "hobson", "gaa", "tdg21"],
        attrs=[("Template type", "Generic RFQ template — not manufacturer-certified"), ("Frame material", "Steel — section, thickness and coating per engineer"), ("Structural grade", "As specified by engineering"), ("Non-combustible", "Steel members are non-combustible — confirm for the BAL context")],
        variables="Engineer's design and spans; steel section and thickness; coating system and corrosivity category; connection and anchor design; footing type; board fixing system; on-site welding/cutting (fire risk, coating repair); BAL; strata/balcony rules.",
        questions="[?] Hollow sections galvanised after fabrication need vent/drain holes [R] — who details this? [?] Which steel supplier/fabricator will quote? [?] Typical coating Perth builders specify for exposed decks?",
        profiles=[("SHS post 50 x 50", "Example stock size", "50 x 50 mm SHS", "each"), ("SHS post 75 x 75", "Example stock size", "75 x 75 mm SHS", "each"),
                  ("Beam / joist 100 x 50", "Example stock size", "100 x 50 mm", "lm"), ("Beam / joist 150 x 50", "Example stock size", "150 x 50 mm", "lm"), ("Beam / joist 150 x 75", "Example stock size", "150 x 75 mm", "lm"),
                  ("Coating: galvanised Z275 / Z350 / Z450", "Per engineer and corrosivity category", "", ""), ("Coating: hot-dip galvanised after fabrication", "[R] verify", "", ""), ("Coating: galvanised + paint / powder coat", "[R] verify", "", "")],
        components=STEEL_COMPONENTS,
    ),
    dict(
        code="DWA-ASF", name="Aluminium Deck Subframe", subcategory="Aluminium subframe",
        description="Generic RFQ template for an aluminium deck subframe: joists, bearers, posts or pedestals, connectors and isolation items. Spans, sizes, fixings and compliance must come from the manufacturer's data and the engineer. Branded cards should replace this starter as manufacturers are onboarded.",
        sources=["tdg21"],
        attrs=[("Template type", "Generic starter — usually a branded system with its own span tables"), ("Frame material", "Aluminium — profile and finish are manufacturer-specific")],
        variables="Manufacturer span tables; maximum joist spacing for the chosen boards; load; corrosivity category and finish; galvanic isolation details [S]; fixings grade (316 stainless coastal [S]).",
        questions="[?] Which aluminium standard applies (AS/NZS 1664?) and who signs off spans? [?] Which brands are available in WA?",
        profiles=[("Joist / bearer profile", "Manufacturer-specific", "", "lm"), ("Lengths 3.0–6.0 m", "Example", "3.0–6.0 m", "lm"), ("Finish", "Powder-coat colour / class", "", "")],
        components=[
            ("Structure", "Aluminium joists", "lm", R, ""), ("Structure", "Aluminium bearers", "lm", R, ""), ("Structure", "Adjustable posts or pedestals", "each", R, ""),
            ("Connectors", "Connectors and brackets (manufacturer-specific)", "each", R, ""), ("Connectors", "Board clips or fixing strips", "box", R, ""),
            ("Fixings", "Stainless screws / bolts (grade to suit environment)", "box", R, ""),
            ("Isolation & protection", "Isolation tape / washers between aluminium and dissimilar metals or treated timber", "roll", A, "Risk depends on the metals' area ratio and wetness [S]"),
            ("Services", "Site delivery", "each", A, ""),
        ],
    ),
    dict(
        code="DWA-PED", name="Pedestal / Over-Slab Deck System", subcategory="Pedestal system",
        description="Generic RFQ template for a pedestal-supported deck or tile surface over an existing slab, paving or membrane. Slab falls, drainage, waterproofing, height, wind uplift and approvals must be checked by the builder/engineer before ordering.",
        sources=["tdg21"],
        attrs=[("Template type", "Generic RFQ template — not manufacturer-certified"), ("Suits", "Balconies, courtyards and slabs with an existing surface")],
        variables="Slab condition and falls; existing waterproofing membrane; drainage paths (do not block them); finished height vs door thresholds; load; wind uplift on exposed balconies; strata/body-corporate approval; whether it is over a habitable room (waterproofing, fire, engineering).",
        questions="[?] Which pedestal brands and height ranges are common in WA? [?] Typical joist spacing for the chosen board over pedestals?",
        profiles=[("Pedestal — low", "Height range manufacturer-specific (example)", "", "each"), ("Pedestal — medium", "Height range manufacturer-specific (example)", "", "each"), ("Pedestal — high", "Height range manufacturer-specific (example)", "", "each"),
                  ("Head — fixed", "", "", "each"), ("Head — tilting", "", "", "each")],
        components=[
            ("Pedestals", "Adjustable pedestals", "each", R, ""), ("Pedestals", "Pedestal heads / spacer tabs", "each", R, ""), ("Pedestals", "Shims and levelling packers", "each", O, ""),
            ("Frame", "Bearers / joists (from a subframe card)", "lm", O, "Aluminium, steel or treated timber — see the relevant subframe card"),
            ("Protection", "Protection pads under pedestals (to protect membranes)", "each", A, "[R] verify"),
            ("Finishing", "Edge trim / fascia", "lm", O, ""), ("Finishing", "Board or tile fixings", "box", R, ""),
            ("Services", "Site delivery", "each", A, ""),
        ],
    ),
    dict(
        code="DWA-TSF-C", name="Coastal Timber Deck Subframe", subcategory="Timber subframe (coastal)",
        description="Generic RFQ template for a timber deck subframe near the coast, with corrosion-resistant fixings and post bases. Corrosivity category, treatment, coatings and fixings must be confirmed by the builder/engineer against the site's AS 4312 category before ordering. " + DISCLAIMER,
        sources=["gaa", "simpson", "qbcc", "wsuse", "tdg21"],
        attrs=[("Template type", "Generic RFQ template — coastal variant of the timber subframe"), ("Corrosivity category", "Confirm C3 / C4 / C5 / CX under AS 4312 for the exact lot — do not rely on a distance rule [S]"), ("Fixings", "316 stainless; avoid electroplated [S]"), ("Frame material", "H3 minimum above ground; consider H4 or Class 1 hardwood near ground or in salt spray [S]")],
        variables="AS 4312 category for the exact lot; distance/exposure (surf beach vs sheltered); shade and spray exposure; stainless grade availability; concrete exposure class; maintenance plan.",
        questions="[?] What do WA builders use within the first 1–2 km of the coast? [?] Who stocks 316 stainless post bases, brackets and bolts in WA and at what price?",
        profiles=[(f"{s} x 45", f"Bearer / joist {s} x 45 (example stock size)", f"{s} x 45 mm", "lm") for s in (90, 140, 190, 240)]
                 + [("Treatment: H4", "Close to ground / persistently wet [S]", "", ""), ("Treatment: Class 1 hardwood", "Species to be confirmed", "", "")],
        components=[(g, n.replace("Post stirrups / bases", "Post stirrups / bases (316 stainless or verified severe-duty coating)").replace("Bolts M10/M12 with washers and nuts", "Bolts M10/M12 (316 stainless) with washers and nuts"), u, r, (nt + " Coastal: confirm against AS 4312.").strip() if g in ("Footings & post bases", "Connectors", "Fixings") else nt)
                    for (g, n, u, r, nt) in TIMBER_COMPONENTS]
                   + [("Protection", "Isolation washers where stainless meets other metals", "each", A, "[R] verify"),
                      ("Protection", "Ventilated under-deck edge detail / skirting (if used)", "lm", O, "Let air and water move — salt-laden moisture under a deck accelerates decay and corrosion [R]")],
    ),
    dict(
        code="DWA-SSF-C", name="Coastal Steel Deck Subframe", subcategory="Steel subframe (coastal)",
        description="Generic RFQ template for a steel deck subframe near the coast. Coating system, thickness, fixings and details must be specified by the engineer against the site's AS 4312 category. " + DISCLAIMER,
        sources=["bluescope", "hobson", "gaa", "simpson"],
        attrs=[("Template type", "Generic RFQ template — coastal variant of the steel subframe"), ("Corrosivity category", "Confirm under AS 4312 for the exact lot"), ("Fixings", "316 stainless or severe-duty coated; isolate stainless from carbon steel and aluminium [S]"), ("Coating", "Per engineer (galvanising / duplex / stainless) — sources conflict on what is adequate in C5 [S]")],
        variables="AS 4312 category; coating system and DFT/zinc mass; fabrication details; fixings; maintenance and inspection interval; warranty terms of the steel/coating.",
        questions="[?] Is a duplex (galvanised + paint) coating standard practice for coastal decks in WA? [?] Who fabricates and coats steel deck frames locally?",
        profiles=[("Coating system per engineer", "Options limited to the system the engineer specifies", "", "")] + [("SHS post 75 x 75", "Example stock size", "75 x 75 mm SHS", "each"), ("Beam / joist 150 x 50", "Example stock size", "150 x 50 mm", "lm")],
        components=STEEL_COMPONENTS + [("Isolation & protection", "Isolation tape / washers at every dissimilar-metal contact", "each", A, "[R] verify"),
                                       ("Isolation & protection", "Extra touch-up paint for cut and drilled edges (mandatory)", "each", A, "[R] verify"),
                                       ("Structure", "Inspection access", "each", O, "[R] verify")],
    ),
]
