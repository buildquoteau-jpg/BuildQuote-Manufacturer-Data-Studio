# BuildQuote Data Studio

![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-storage-F38020?logo=cloudflare&logoColor=white)
![Anthropic Claude](https://img.shields.io/badge/Anthropic_Claude-AI_parser-191919?logo=anthropic&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)

AI-assisted pipeline that turns manufacturer PDFs, brochures, and spec sheets into
**verified, structured, machine-readable product data** — published as public
"System Cards" and a `knowledge.jsonld` object any site or agent can consume.

> **Core principle:** AI can suggest manufacturer data, but only human-verified data
> gets published.

---

## Why fork this

- End-to-end ingestion pipeline you don't have to build from scratch: PDF/brochure
  upload → text/table extraction (Docling) → AI two-pass parser → staged data →
  human verification UI → controlled publish.
- Ships a **standalone AI Knowledge Layer** (`/api/cards/[slug]/knowledge.jsonld`,
  `/api/knowledge/ask`) — a pattern for making verified product data
  citable/queryable by AI agents, decoupled from the rest of the pipeline.
- Schema designed for arbitrary building-product shapes (panels, rolls, fixings,
  sealants...) via structured common fields + a flexible JSON field for
  manufacturer-specific specs — not hard-coded to one product type.
- Clear repo boundary: this is the only place manufacturer catalogue data is
  authored — nothing here writes runtime state into the other two repos' domains.

---

## About the creator

This was built solo by **Melia Knapp**, after seeing — from inside a local
hardware supply store — how scattered building-product information is for
everyone who needs it, manufacturers included. The full story of why this
exists and why it's open source is in the
[Build-Quote-Library-and-Request-for-Quotation README](https://github.com/buildquoteau-jpg/Build-Quote-Library-and-Request-for-Quotation#about-the-creator).
Questions or feedback: [meliagrace@gmail.com](mailto:meliagrace@gmail.com).

**Want to try it live?** [studio.buildquote.com.au](https://studio.buildquote.com.au)
isn't open self-serve — manufacturer accounts are created manually to keep a
lid on the AI/processing costs the extraction pipeline can trigger if left
open to the public. Email [meliagrace@gmail.com](mailto:meliagrace@gmail.com)
for a demo login, or fork the repo and run it on your own infrastructure to
try the full thing yourself.

---

## Who this is for

### Manufacturers — self-serve onboarding
- Upload a product guide/PDF/brochure/photos and get an AI-drafted System Card back
  for review instead of manual data entry
  ([`/manufacturer/systems`](https://studio.buildquote.com.au/manufacturer/systems)).
- Verify AI-suggested fields against the source before anything goes live —
  nothing publishes without human sign-off.
- **Just this piece:** run the ingestion pipeline standalone to turn your own PDF
  catalogue into structured JSON, even if you never plug into the wider BuildQuote
  stack.

### Any site/agent builder — AI Knowledge Layer
- `knowledge.jsonld` per product ("System Card") — structured, sourced, versioned
  facts about a product, designed to be read by LLMs/agents, not just humans.
- `/api/knowledge/ask` — ask a natural-language question about a product and get an
  answer grounded in verified fields (not free-form model guessing).
- **Just this piece:** the pattern (verify-then-publish + a JSONLD knowledge
  endpoint) is reusable for any catalogue of verified facts, not just building
  products.

### Suppliers / builders — indirect beneficiaries
- Don't interact with this repo directly. What gets verified and published here is
  what shows up as the public System Card on
  [buildquote.com.au/library](https://buildquote.com.au/library) and what
  suppliers list against in the
  [Trade Desk](https://search.buildquote.com.au).

---

## How the three BuildQuote repos fit together

```
Manufacturer catalogue (PDF/brochure)
        │
        ▼
┌───────────────────────────┐
│   Data Studio (this repo)  │  AI-parse → human-verify → System Card + knowledge.jsonld
└──────────────┬─────────────┘
               │ publish (server-side, service-role only)
               ▼
     Shared production Supabase (RFQ project)
               │
      ┌────────┴─────────┐
      ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ Build-Quote-  │   │ BuildQuote-Supplier- │
│ Library-and-  │   │ Trade-Desk            │
│ Request-for-  │   │ (search.buildquote.  │
│ Quotation      │   │  com.au)              │
│ (buildquote.  │   │ supplier profiles,    │
│  com.au)      │   │ widgets, RFQ inbox     │
│ renders card, │◄──┤ directory builders    │
│ sends RFQs    │   │ browse to find         │
└─────────────┘   │ suppliers              │
                    └──────────────────────┘
```

- **Data Studio → production Supabase:** the *only* repo allowed to write
  manufacturer/system/component data into the shared production project (via a
  gated publish job — never a direct migration).
- **Production Supabase → v6 (`/library`):** renders the public System Card and
  `knowledge.jsonld`, and is the entry point for builders assembling an RFQ.
- **Production Supabase → Trade Desk:** suppliers manage their own listing and
  incoming RFQ inbox; the supplier directory is how builders find who to send an
  RFQ to.

## Live product surfaces

- [buildquote.com.au](https://buildquote.com.au) — builder-facing app
- [buildquote.com.au/library](https://buildquote.com.au/library) — public product
  library / System Cards rendered from this pipeline's output
- [search.buildquote.com.au](https://search.buildquote.com.au) — supplier directory
  + supplier portal (Trade Desk)
- [studio.buildquote.com.au](https://studio.buildquote.com.au) — this app

---

## The invisible drawer, made visible

Everything above is what a person sees. This is what an AI agent sees —
invisible to the human eye, but instantly findable by any agent searching for
it, whether that's Google or a proprietary trained model. This fifth drawer
is a newly added feature, so none of the current demo products have it
switched on yet — here's an example of exactly how one will look to a
machine reader, built from the real field structure the code produces
(`buildSystemKnowledge.ts`), for a fictional product so nothing here is
mistaken for a real manufacturer.

<details>
<summary>Example: <code>GET /api/cards/bq-cladmax-cladding-system/knowledge.jsonld</code> (fictional product)</summary>

```json
{
  "@context": "https://studio.buildquote.com.au/ns/v1",
  "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system",
  "@type": ["bq:ConstructionSystem", "Product"],
  "bq:format": "buildquote-knowledge-object",
  "bq:formatVersion": "1.0",
  "bq:generatedAt": "2026-08-30T04:12:00.000Z",
  "bq:canonicalUrl": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system",
  "bq:customerCardUrl": "https://buildquote.com.au/library/southline-building-products/bq-cladmax-cladding-system",
  "name": "BQ CladMax Cladding System",
  "sku": "BQCM-SYS",
  "category": "Cladding > Fibre Cement",
  "description": "Vertically jointed fibre cement cladding system for residential and light commercial facades, available in standard and wide-board profiles with a factory-primed, paint-ready finish.",
  "manufacturer": {
    "@type": "Organization",
    "@id": "https://studio.buildquote.com.au/manufacturers/southline-building-products",
    "name": "Southline Building Products",
    "identifier": { "@type": "PropertyValue", "propertyID": "ABN", "value": "55 123 456 789" },
    "url": "https://southlinebp.example.com.au"
  },

  "bq:contains": [
    {
      "@type": ["bq:SystemProfile", "Product"],
      "@id": "#profile-180",
      "name": "BQ CladMax 180 Board",
      "sku": "BQCM-180-3000",
      "bq:isPrimarySellableUnit": true,
      "length": { "@type": "QuantitativeValue", "value": 3000, "unitCode": "MMT" },
      "width": { "@type": "QuantitativeValue", "value": 180, "unitCode": "MMT" },
      "thickness": { "@type": "QuantitativeValue", "value": 8, "unitCode": "MMT" },
      "weight": { "@type": "QuantitativeValue", "value": 13.4, "unitCode": "KGM" },
      "bq:sellUnit": "each",
      "bq:supplierPack": { "quantity": 20, "unit": "boards/pack" }
    },
    {
      "@type": ["bq:SystemProfile", "Product"],
      "@id": "#profile-300",
      "name": "BQ CladMax 300 Wide Board",
      "sku": "BQCM-300-3000",
      "bq:isPrimarySellableUnit": true,
      "length": { "@type": "QuantitativeValue", "value": 3000, "unitCode": "MMT" },
      "width": { "@type": "QuantitativeValue", "value": 300, "unitCode": "MMT" },
      "thickness": { "@type": "QuantitativeValue", "value": 8, "unitCode": "MMT" },
      "weight": { "@type": "QuantitativeValue", "value": 22.1, "unitCode": "KGM" },
      "bq:sellUnit": "each",
      "bq:supplierPack": { "quantity": 12, "unit": "boards/pack" }
    },
    {
      "@type": ["bq:SystemProfile", "Product"],
      "@id": "#profile-soffit",
      "name": "BQ CladMax Soffit Lining 4.5mm",
      "sku": "BQCM-SOF-4500",
      "bq:isPrimarySellableUnit": true,
      "length": { "@type": "QuantitativeValue", "value": 1800, "unitCode": "MMT" },
      "width": { "@type": "QuantitativeValue", "value": 1200, "unitCode": "MMT" },
      "thickness": { "@type": "QuantitativeValue", "value": 4.5, "unitCode": "MMT" },
      "bq:sellUnit": "sheet"
    }
  ],

  "bq:requires": [
    { "@type": ["bq:Component", "Product"], "@id": "#comp-batten", "name": "BQ CladMax Vertical Jointing Batten", "sku": "BQCM-VJB-3000", "description": "Factory-grooved PVC jointing batten — sets the 8mm shadow-line joint.", "category": "Jointing", "bq:componentRole": "required" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-starter", "name": "BQ CladMax Starter Track", "sku": "BQCM-ST-3000", "description": "Base-of-wall aluminium starter track — sets the first board level and provides the required drainage gap.", "category": "Trim", "bq:componentRole": "required" }
  ],
  "bq:optionalComponent": [
    { "@type": ["bq:Component", "Product"], "@id": "#comp-cornerext", "name": "BQ CladMax External Corner Trim", "sku": "BQCM-COE-3000", "category": "Trim", "bq:componentRole": "optional" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-cornerint", "name": "BQ CladMax Internal Corner Trim", "sku": "BQCM-COI-3000", "category": "Trim", "bq:componentRole": "optional" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-controljoint", "name": "BQ CladMax Vertical Control Joint", "sku": "BQCM-CJ-3000", "description": "Required at maximum 6m board runs to accommodate movement.", "category": "Trim", "bq:componentRole": "optional" }
  ],
  "bq:accessory": [
    { "@type": ["bq:Component", "Product"], "@id": "#comp-fixings", "name": "BQ CladMax Stainless Fixings (500pk)", "sku": "BQCM-FIX-500", "category": "Fixings", "bq:componentRole": "accessory" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-sealant", "name": "BQ CladMax Paintable Sealant", "sku": "BQCM-SEAL-600", "description": "UV-stable, paintable polyurethane sealant for joints and trims.", "category": "Sealant", "bq:componentRole": "accessory" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-blade", "name": "BQ CladMax Diamond-Tipped Cutting Blade", "sku": "BQCM-BLADE-165", "description": "Required cutting blade — polycrystalline diamond tip rated for fibre cement.", "category": "Tool", "bq:componentRole": "accessory" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-shroud", "name": "BQ CladMax Dust Extraction Shroud", "sku": "BQCM-SHRD-01", "description": "On-tool dust extraction shroud — mandatory for compliant silica dust control when cutting.", "category": "Tool", "bq:componentRole": "accessory" },
    { "@type": ["bq:Component", "Product"], "@id": "#comp-touchup", "name": "BQ CladMax Touch-Up Paint (custom match)", "sku": "BQCM-TU-250", "category": "Finishing", "bq:componentRole": "accessory" }
  ],

  "bq:finishOption": [
    { "@type": "bq:FinishOption", "name": "Surfmist", "sku": "-SFM", "bq:isStocked": true },
    { "@type": "bq:FinishOption", "name": "Monument", "sku": "-MON", "bq:isStocked": true },
    { "@type": "bq:FinishOption", "name": "Dune", "sku": "-DUN", "bq:isStocked": true },
    { "@type": "bq:FinishOption", "name": "Custom colour match (paint-to-order)", "sku": "-CUSTOM", "bq:isStocked": false }
  ],

  "bq:compatibleWith": [
    { "@type": "bq:ProductRelationship", "bq:target": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-timberframe-batten-system", "name": "BQ TimberFrame Batten System" }, "bq:note": "Standard cavity-batten substrate for this system.", "bq:epistemicStatus": "manufacturer_verified" },
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Standard 90x45mm timber wall framing, F5/MGP10, studs at 450mm or 600mm centres", "bq:targetKind": "substrate" }, "bq:note": "Direct compatibility per span tables in the install guide.", "bq:epistemicStatus": "manufacturer_verified" },
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Light steel wall framing, 0.55mm BMT or heavier", "bq:targetKind": "substrate" }, "bq:epistemicStatus": "manufacturer_verified" }
  ],
  "bq:incompatibleWith": [
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Generic non-BQ jointing battens", "bq:targetKind": "component" }, "bq:reason": "Board spacing and shadow-line tolerance are calibrated to the BQ CladMax batten profile only.", "bq:note": "Using a substitute batten voids the structural warranty.", "bq:epistemicStatus": "manufacturer_verified" },
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Direct fixing to masonry or concrete with no cavity batten", "bq:targetKind": "installation_method" }, "bq:reason": "System requires a ventilated cavity behind the board — direct-fix to a solid substrate traps moisture.", "bq:epistemicStatus": "manufacturer_verified" },
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Permanent or below-ground-level ground contact", "bq:targetKind": "application" }, "bq:reason": "Not rated for continuous moisture exposure or soil contact.", "bq:epistemicStatus": "manufacturer_verified" },
    { "@type": "bq:ProductRelationship", "bq:target": { "@type": "Product", "name": "Use as a structural bracing element", "bq:targetKind": "application" }, "bq:reason": "BQ CladMax is a non-structural cladding product; it does not contribute to a wall's racking/bracing capacity.", "bq:epistemicStatus": "manufacturer_verified" }
  ],

  "bq:documentedBy": [
    { "@type": ["bq:SourceDocument", "DigitalDocument"], "name": "Design guide", "bq:documentRole": "design_guide", "url": "https://southlinebp.example.com.au/bq-cladmax/design-guide.pdf" },
    { "@type": ["bq:SourceDocument", "DigitalDocument"], "name": "Technical data sheet", "bq:documentRole": "tech_data", "url": "https://southlinebp.example.com.au/bq-cladmax/tds.pdf" },
    { "@type": ["bq:SourceDocument", "DigitalDocument"], "name": "Installation guide", "bq:documentRole": "install_guide", "url": "https://southlinebp.example.com.au/bq-cladmax/install-guide.pdf" },
    { "@type": ["bq:SourceDocument", "DigitalDocument"], "name": "Warranty terms", "bq:documentRole": "warranty", "url": "https://southlinebp.example.com.au/bq-cladmax/warranty.pdf" }
  ],

  "bq:coverage": {
    "standards": "not_yet_captured — no standards data model yet"
  },
  "bq:knowledgeGaps": [
    { "@type": "bq:KnowledgeGap", "bq:about": "bq:acousticRating", "bq:status": "disputed", "bq:reason": "Flagged incorrect by the manufacturer pending an updated third-party acoustic test report; not stated pending resolution." }
  ],

  "bq:assertions": [
    { "@id": "fact:bq-cladmax-001", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:fireRating", "bq:objectValue": "Non-combustible (AS1530.1)", "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-002", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:balRating", "bq:objectValue": "BAL-40", "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-003", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:structuralGrade", "bq:objectValue": "N3 (AS4055) with framing at 600mm centres", "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-004", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:moistureResistant", "bq:objectValue": true, "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-005", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:countryOfOrigin", "bq:objectValue": true, "bq:origin": "manufacturer_supplied", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-006", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:acousticRating", "bq:objectValue": "Rw 45 (with 90mm insulated stud cavity)", "bq:origin": "document_extracted", "bq:epistemicStatus": "disputed", "bq:trustLevel": "extracted" },
    { "@id": "fact:bq-cladmax-007", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:warrantyCondition", "bq:objectValue": { "value": "25-year structural warranty, 15-year finish warranty", "condition": "Warranty is voided if the system is installed without the BQ CladMax Starter Track and Vertical Jointing Batten, or if installed other than in accordance with the current BQ CladMax Installation Guide." }, "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } },
    { "@id": "fact:bq-cladmax-008", "@type": ["bq:Assertion", "prov:Entity"], "bq:subject": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:predicate": "bq:cuttingRequirement", "bq:objectValue": { "value": "Must be cut using a diamond-tipped blade with on-tool dust extraction (BQ CladMax Cutting Blade + Dust Extraction Shroud).", "condition": "Cutting without dust extraction breaches respirable crystalline silica (RCS) safety requirements and is not a supported installation method." }, "bq:origin": "document_extracted", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:verifiedBy": { "name": "Southline Building Products" } }
  ],

  "bq:knowledge": {
    "bq:knowledgeVersion": "1.0",
    "bq:retrievalEnabled": true,
    "bq:atomicAssertions": [
      { "@id": "https://studio.buildquote.com.au/id/assertion/bq-cladmax-001", "@type": "bq:AtomicAssertion", "bq:system": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:manufacturer": { "@id": "https://studio.buildquote.com.au/manufacturers/southline-building-products" }, "bq:subject": "BQ CladMax Cladding System", "bq:claim": "Fire rating: Non-combustible (AS1530.1).", "bq:claimType": "performance_claim", "bq:value": "Non-combustible (AS1530.1)", "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:answerPolicy": "answer_with_source", "bq:retrievalText": "BQ CladMax Cladding System (Southline Building Products). Fire rating: Non-combustible (AS1530.1). Manufacturer verified.", "bq:canonicalAssertion": { "@id": "fact:bq-cladmax-001" } },
      { "@id": "https://studio.buildquote.com.au/id/assertion/bq-cladmax-007", "@type": "bq:AtomicAssertion", "bq:system": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:manufacturer": { "@id": "https://studio.buildquote.com.au/manufacturers/southline-building-products" }, "bq:subject": "BQ CladMax Cladding System", "bq:claim": "Warranty condition: 25-year structural warranty, 15-year finish warranty.", "bq:claimType": "manufacturer_statement", "bq:value": { "value": "25-year structural warranty, 15-year finish warranty" }, "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:answerPolicy": "answer_with_source", "bq:conditions": ["Warranty is voided if installed without the BQ CladMax Starter Track and Vertical Jointing Batten, or other than per the current Installation Guide."], "bq:retrievalText": "BQ CladMax Cladding System (Southline Building Products). Warranty condition: 25-year structural warranty, 15-year finish warranty. Warranty is voided if installed without the BQ CladMax Starter Track and Vertical Jointing Batten, or other than per the current Installation Guide. Manufacturer verified.", "bq:canonicalAssertion": { "@id": "fact:bq-cladmax-007" } },
      { "@id": "https://studio.buildquote.com.au/id/assertion/bq-cladmax-008", "@type": "bq:AtomicAssertion", "bq:system": { "@id": "https://studio.buildquote.com.au/cards/southline-building-products/bq-cladmax-cladding-system" }, "bq:manufacturer": { "@id": "https://studio.buildquote.com.au/manufacturers/southline-building-products" }, "bq:subject": "BQ CladMax Cladding System", "bq:claim": "Cutting requirement: diamond-tipped blade with on-tool dust extraction.", "bq:claimType": "installation_requirement", "bq:value": { "value": "Must be cut using a diamond-tipped blade with on-tool dust extraction." }, "bq:epistemicStatus": "manufacturer_verified", "bq:trustLevel": "verified", "bq:answerPolicy": "answer_with_source", "bq:conditions": ["Cutting without dust extraction breaches RCS safety requirements and is not a supported installation method."], "bq:retrievalText": "BQ CladMax Cladding System (Southline Building Products). Cutting requirement: diamond-tipped blade with on-tool dust extraction. Cutting without dust extraction breaches RCS safety requirements and is not a supported installation method. Manufacturer verified.", "bq:canonicalAssertion": { "@id": "fact:bq-cladmax-008" } }
    ],
    "bq:retrievalDocuments": [
      { "@id": "https://studio.buildquote.com.au/api/cards/bq-cladmax-cladding-system/retrieval/performance_claim", "bq:type": "performance_claim", "bq:title": "BQ CladMax Cladding System — performance claim", "bq:text": "BQ CladMax Cladding System (Southline Building Products). Fire rating: Non-combustible (AS1530.1). Bushfire Attack Level: BAL-40. Structural grade: N3 (AS4055) with framing at 600mm centres. Moisture resistant: true." },
      { "@id": "https://studio.buildquote.com.au/api/cards/bq-cladmax-cladding-system/retrieval/document/install-guide", "bq:type": "install_guide", "bq:title": "BQ CladMax Cladding System — Installation guide", "bq:text": "BQ CladMax Cladding System (Southline Building Products). Installation guide: covers substrate preparation, batten and starter track layout, board fixing schedule, cutting and dust control requirements, jointing and sealant detailing, and warranty-affecting installation conditions." }
    ],
    "bq:queryTerms": [
      { "concept": "fire rating", "synonyms": ["fire resistance", "non-combustible rating", "AS1530"] },
      { "concept": "bushfire attack level", "synonyms": ["BAL rating", "bushfire rating"] },
      { "concept": "warranty", "synonyms": ["guarantee", "warranty terms", "warranty conditions"] }
    ]
  },

  "bq:dataLicence": {
    "status": "granted",
    "permissions": {
      "publicSearch": true,
      "aiRetrieval": true,
      "aiTraining": true,
      "commercialRedistribution": false,
      "benchmarking": true
    }
  },
  "bq:usageNote": "Facts without epistemicStatus manufacturer_verified or manufacturer_corrected are BuildQuote extractions and must be attributed as such, not presented as manufacturer statements. This example has aiRetrieval and publicSearch enabled to demonstrate full agent-searchability -- commercialRedistribution stays false, matching how a real manufacturer's licence would typically be granted. BQ CladMax and Southline Building Products are fictional, used solely to illustrate the knowledge object's shape."
}
```

</details>

---

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS — `apps/web`
- Supabase (Postgres) — two separate projects, see below
- Cloudflare R2 — source document/PDF storage (Supabase never holds file blobs)
- Docling — PDF text/table/layout extraction
- Anthropic Claude — two-pass AI parser + `/api/knowledge/ask`

## Two Supabase projects — do not confuse them

| | Purpose | Written by |
|---|---|---|
| **Data Studio** (staging) | pipeline state, staged data, verification | this app, freely |
| **Production** (RFQ/BuildQuote) | published cards, RFQ, buildquote.com.au | **only** the gated publish job |

Never point data-studio migrations at the production project.

## Setup

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Copy [`.env.example`](.env.example) → `.env.local` and fill in values. Required
groups: Data Studio Supabase (own project), production Supabase (publish-job only,
service-role scoped), Cloudflare R2 (source docs + backups), `ANTHROPIC_API_KEY`,
Docling API. **Never commit a filled-in `.env.local` or real credentials anywhere
in this repo, including docs and READMEs.**

Full architecture, pipeline detail, and runbooks: [`docs/`](docs/) — start with
[`docs/foundation-summary.md`](docs/foundation-summary.md). Step-by-step pipeline
guides: [`docs/skills/`](docs/skills/), starting with
[`manufacturer-onboarding-pipeline.md`](docs/skills/manufacturer-onboarding-pipeline.md).

---

## A note for developers using this GitHub repository

In this current build, the ingestion pipeline — Docling extraction, then the
AI parser — is started manually, by running
[`scripts/worker/pipeline_worker.py`](scripts/worker/pipeline_worker.py) on
my own home PC. It's a standalone Python polling loop, not a deployed
service: a manufacturer can submit a system through the self-serve UI at any
time, but nothing processes that submission unless this GitHub repository's
worker script happens to be running.

If you're adapting this GitHub repository for a single manufacturer's own
use, it's worth giving that worker an always-on host rather than relying on
a manually-started local process — for example a background worker on
**Fly.io**, Render, or Railway, or a plain systemd service on a small VM. No
rewrite is needed; the same script just needs somewhere permanent to run.

---

## Open source status

- **License:** not yet chosen — **TODO**. Until a `LICENSE` file with a real
  license is added, standard copyright applies (no reuse rights are granted). See
  [`LICENSE`](LICENSE).
- **Secrets:** `.env.example` in this repo is placeholder-only (checked before
  writing this README). A full manual secrets audit across git history is still
  recommended before treating any repo as safe for public forks to build from —
  rotate anything you're not certain about.
