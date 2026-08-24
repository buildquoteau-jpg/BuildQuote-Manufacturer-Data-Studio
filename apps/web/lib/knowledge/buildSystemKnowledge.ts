// The knowledge-object generator. Pure function of its inputs — no Supabase
// reads happen here, only in fetchCanonicalKnowledgeData.ts — so it can be
// unit-tested and reused by both the live route and (once §11/step 8 lands)
// the publish-time freeze into card_versions.knowledge_json.
//
// Honesty rule this file exists to enforce (design doc §1.3 / §4E / §13):
// a field with no evidence trail is emitted as 'unverified', never upgraded
// by inference. A category this codebase does not yet extract (installation
// methods, compatibility, certification — pending the knowledge parser,
// task #7) is declared in bq:coverage as not-yet-extracted, and is NOT
// invented as a per-product bq:knowledgeGaps entry — those two things mean
// different things and must not be conflated. See buildCoverage() below.

import {
  KNOWLEDGE_CONTEXT,
  KNOWLEDGE_FORMAT,
  KNOWLEDGE_FORMAT_VERSION,
  QUERY_TERMS,
  queryTermFor,
  resolveAnswerPolicy,
  trustLevelFor,
  type AssertionOrigin,
  type ClaimType,
  type EpistemicStatus,
} from './vocabulary'
import type {
  AtomicAssertion,
  Assertion,
  KnowledgeGap,
  KnowledgeObject,
  RetrievalDocument,
} from './types'
import type {
  CanonicalSystemBundle,
  FieldVerificationRow,
  ParserEvidenceRow,
} from './fetchCanonicalKnowledgeData'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'

const STUDIO_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'https://studio.buildquote.com.au').replace(/\/$/, '')

// ─── Field descriptor table — the only place that says which typed columns
// become facts, and what kind of fact each one is. Extend this array as new
// columns come online; never synthesize a fact for a column not listed here.

type FieldDescriptor = {
  fieldName: string
  predicate: string
  claimType: ClaimType
  label: string
  isBoolean?: boolean
}

const SYSTEM_FIELD_DESCRIPTORS: FieldDescriptor[] = [
  { fieldName: 'name', predicate: 'bq:name', claimType: 'identity', label: 'System name' },
  { fieldName: 'category', predicate: 'bq:category', claimType: 'identity', label: 'Category' },
  { fieldName: 'subcategory', predicate: 'bq:subcategory', claimType: 'identity', label: 'Subcategory' },
  { fieldName: 'description', predicate: 'bq:description', claimType: 'identity', label: 'Description' },
  { fieldName: 'product_code', predicate: 'bq:productCode', claimType: 'identity', label: 'Product code' },
  { fieldName: 'website_url', predicate: 'bq:websiteUrl', claimType: 'identity', label: 'Manufacturer product page' },
  { fieldName: 'tech_data_url', predicate: 'bq:techDataUrl', claimType: 'manufacturer_statement', label: 'Technical data sheet' },
  { fieldName: 'design_guide_url', predicate: 'bq:designGuideUrl', claimType: 'manufacturer_statement', label: 'Design guide' },
  { fieldName: 'bal_rating', predicate: 'bq:balRating', claimType: 'performance_claim', label: 'Bushfire Attack Level' },
  { fieldName: 'fire_rating', predicate: 'bq:fireRating', claimType: 'performance_claim', label: 'Fire rating' },
  { fieldName: 'acoustic_rating', predicate: 'bq:acousticRating', claimType: 'performance_claim', label: 'Acoustic rating' },
  { fieldName: 'structural_grade', predicate: 'bq:structuralGrade', claimType: 'performance_claim', label: 'Structural grade' },
  { fieldName: 'moisture_resistant', predicate: 'bq:moistureResistant', claimType: 'performance_claim', label: 'Moisture resistant', isBoolean: true },
  { fieldName: 'australian_made', predicate: 'bq:countryOfOrigin', claimType: 'identity', label: 'Australian made', isBoolean: true },
]

// Categories the customer card / staged schema can express today but this
// generator does not yet turn into assertions — surfaced honestly as
// coverage, not silence and not a fabricated per-product gap.
const NOT_YET_EXTRACTED_COVERAGE: Record<string, string> = {
  installationMethods: 'not_yet_extracted — pending the knowledge parser (design doc §7)',
  fixingRequirements: 'not_yet_extracted — pending the knowledge parser',
  applications: 'not_yet_extracted — pending the knowledge parser',
  compatibility: 'not_yet_captured — pending the Relationships panel (design doc §6.3/§7.3)',
  incompatibility: 'not_yet_captured — pending the Relationships panel',
  certification: 'not_yet_captured — no certification data model yet',
  standards: 'not_yet_captured — no standards data model yet',
  environmentalConstraints: 'not_yet_captured — no environmental-envelope data model yet',
}

// ─── Status resolution ──────────────────────────────────────────────────────

function resolveEpistemicStatus(
  fv: FieldVerificationRow | undefined,
  reviewerRole: string | undefined,
  isUncertainExtraction: boolean,
): EpistemicStatus {
  if (!fv) return 'unverified'
  const isManufacturer = reviewerRole === 'manufacturer_user'
  switch (fv.status) {
    case 'approved':
      return isManufacturer ? 'manufacturer_verified' : 'buildquote_checked'
    case 'edited':
      if (isManufacturer) {
        return fv.extracted_value != null ? 'manufacturer_corrected' : 'manufacturer_verified'
      }
      return 'buildquote_checked'
    case 'rejected':
      return 'disputed'
    case 'needs_source_check':
      return 'unverified'
    default:
      return isUncertainExtraction ? 'unverified' : 'unverified'
  }
}

function resolveOrigin(fv: FieldVerificationRow | undefined, hasParserEvidence: boolean): AssertionOrigin {
  if (fv?.status === 'edited' && fv.extracted_value == null) return 'manufacturer_supplied'
  return hasParserEvidence ? 'document_extracted' : 'manufacturer_supplied'
}

// ─── Per-fact assembly ──────────────────────────────────────────────────────

type FactInputs = {
  bundle: CanonicalSystemBundle
  systemUrl: string
  manufacturerUrl: string
  subjectName: string
  factCounter: { n: number }
}

type BuiltFact = {
  compact: Assertion
  atomic: AtomicAssertion
}

function nextFactId(bundle: CanonicalSystemBundle, counter: { n: number }): string {
  counter.n += 1
  return `fact:${bundle.system.slug}-${String(counter.n).padStart(3, '0')}`
}

function buildDescriptorFact(
  d: FieldDescriptor,
  rawValue: string | boolean,
  inputs: FactInputs,
): BuiltFact {
  const { bundle } = inputs
  const fv = bundle.fieldVerifications.find((f) => f.field_name === d.fieldName)
  const pe = bundle.parserEvidence.find((p) => p.field_name === d.fieldName)
  const reviewerRole = fv?.reviewer_id ? bundle.reviewerRoles.get(fv.reviewer_id) : undefined
  const status = resolveEpistemicStatus(fv, reviewerRole, pe?.is_uncertain ?? false)
  const origin = resolveOrigin(fv, !!pe)
  const trustLevel = trustLevelFor(status)
  const factId = nextFactId(bundle, inputs.factCounter)
  const answerPolicy = resolveAnswerPolicy(status, d.claimType)

  const sourceDoc = pe?.source_document_id ? bundle.sourceDocuments.get(pe.source_document_id) : undefined
  const evidence = pe
    ? [{
        '@type': 'bq:EvidenceReference' as const,
        ...(sourceDoc ? { 'bq:document': { '@id': `#doc-${sourceDoc.id}` } } : {}),
        'bq:pageStart': pe.source_page_number,
        'bq:chunkId': pe.source_chunk_id ?? undefined,
      }]
    : status === 'manufacturer_verified' || status === 'manufacturer_corrected'
      ? [{ '@type': 'bq:EvidenceReference' as const, 'bq:sourceKind': 'manufacturer_statement' as const }]
      : undefined

  const compact: Assertion = {
    '@id': factId,
    '@type': ['bq:Assertion', 'prov:Entity'],
    'bq:subject': { '@id': inputs.systemUrl },
    'bq:predicate': d.predicate,
    'bq:objectValue': rawValue,
    'bq:origin': origin,
    'bq:epistemicStatus': status,
    'bq:trustLevel': trustLevel,
    ...(pe?.confidence != null ? { 'bq:confidence': pe.confidence } : {}),
    ...(pe ? { 'bq:assertedAt': pe.created_at } : {}),
    ...(fv?.reviewed_at ? { 'bq:verifiedAt': fv.reviewed_at } : {}),
    ...(status === 'manufacturer_verified' || status === 'manufacturer_corrected'
      ? { 'bq:verifiedBy': { name: bundle.manufacturer.name } }
      : {}),
    ...(evidence ? { 'bq:evidence': evidence } : {}),
  }

  const term = queryTermFor(d.predicate)
  const conditions: string[] = []
  if (pe?.is_uncertain) conditions.push('BuildQuote flagged this extraction as uncertain.')
  if (pe?.parser_note) conditions.push(pe.parser_note)

  const retrievalText =
    `${inputs.subjectName} (${bundle.manufacturer.name}). ${d.label}: ${String(rawValue)}.` +
    (conditions.length ? ` ${conditions.join(' ')}` : '') +
    (status === 'manufacturer_verified' || status === 'manufacturer_corrected'
      ? ` Manufacturer verified.`
      : status === 'buildquote_checked'
        ? ` Checked by BuildQuote against the source document.`
        : ` Extracted by BuildQuote; not yet reviewed — cite as an extraction, not a manufacturer statement.`) +
    (sourceDoc ? ` Source: ${sourceDoc.document_name}${pe?.source_page_number ? `, page ${pe.source_page_number}` : ''}.` : '')

  const atomic: AtomicAssertion = {
    '@id': `${STUDIO_ORIGIN}/id/assertion/${bundle.system.slug}-${String(inputs.factCounter.n).padStart(3, '0')}`,
    '@type': 'bq:AtomicAssertion',
    'bq:system': { '@id': inputs.systemUrl },
    'bq:manufacturer': { '@id': inputs.manufacturerUrl },
    'bq:subject': inputs.subjectName,
    'bq:claim': `${d.label}: ${String(rawValue)}.`,
    'bq:claimType': d.claimType,
    'bq:value': rawValue,
    'bq:epistemicStatus': status,
    'bq:trustLevel': trustLevel,
    'bq:answerPolicy': answerPolicy,
    ...(conditions.length ? { 'bq:conditions': conditions } : {}),
    ...(sourceDoc || fv?.reviewed_at
      ? {
          'bq:sourceSummary': {
            documentName: sourceDoc?.document_name ?? 'Manufacturer statement',
            page: pe?.source_page_number ?? null,
            verifiedBy: status === 'manufacturer_verified' || status === 'manufacturer_corrected' ? bundle.manufacturer.name : null,
            verifiedAt: fv?.reviewed_at ?? null,
          },
        }
      : {}),
    'bq:retrievalText': retrievalText,
    'bq:canonicalAssertion': { '@id': factId },
    ...(term ? { 'bq:queryTerms': [{ concept: term.concept, synonyms: term.synonyms }] } : {}),
  }

  return { compact, atomic }
}

// ─── Documents ──────────────────────────────────────────────────────────────

function buildDocumentedBy(bundle: CanonicalSystemBundle): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = []
  const seen = new Set<string>()

  // Legacy scalar fields remain the render source of truth (architecture
  // doc §3.1) — always emitted when present, regardless of system_sources.
  const legacy: { url: string | null; role: string; label: string }[] = [
    { url: bundle.system.design_guide_url, role: 'design_guide', label: 'Design guide' },
    { url: bundle.system.tech_data_url, role: 'tech_data', label: 'Technical data sheet' },
    ...(bundle.system.install_guide_urls ?? []).map((g) => ({ url: g.url, role: 'install_guide', label: g.label || 'Installation guide' })),
  ]
  for (const l of legacy) {
    if (!l.url || seen.has(l.url)) continue
    seen.add(l.url)
    docs.push({
      '@type': ['bq:SourceDocument', 'DigitalDocument'],
      name: l.label,
      'bq:documentRole': l.role,
      url: l.url,
    })
  }

  for (const s of bundle.systemSources) {
    if (seen.has(s.url)) continue
    seen.add(s.url)
    const doc = s.source_document_id ? bundle.sourceDocuments.get(s.source_document_id) : undefined
    docs.push({
      '@id': doc ? `#doc-${doc.id}` : undefined,
      '@type': ['bq:SourceDocument', 'DigitalDocument'],
      name: doc?.document_name ?? s.label ?? s.role,
      'bq:documentRole': s.role,
      url: s.url,
      'bq:ingestStatus': s.ingest_status,
      'bq:includedInContainer': s.include_in_container,
    })
  }
  return docs
}

// ─── Retrieval documents — segmented by claim type ─────────────────────────

function buildRetrievalDocuments(
  systemSlug: string,
  subjectName: string,
  manufacturerName: string,
  atomics: AtomicAssertion[],
): RetrievalDocument[] {
  const groups = new Map<ClaimType, AtomicAssertion[]>()
  for (const a of atomics) {
    const list = groups.get(a['bq:claimType']) ?? []
    list.push(a)
    groups.set(a['bq:claimType'], list)
  }
  const out: RetrievalDocument[] = []
  groups.forEach((facts: AtomicAssertion[], claimType: ClaimType) => {
    if (facts.length === 0) return
    const text =
      `${subjectName} (${manufacturerName}). ` +
      facts.map((f) => f['bq:claim']).join(' ')
    out.push({
      '@id': `${STUDIO_ORIGIN}/api/cards/${systemSlug}/retrieval/${claimType}`,
      'bq:type': claimType,
      'bq:title': `${subjectName} — ${claimType.replace(/_/g, ' ')}`,
      'bq:text': text,
    })
  })
  return out
}

// ─── Entry point: live, from canonical staged_* data ───────────────────────

// ─── Shared fact assembly ───────────────────────────────────────────────────
// Extracted so exactly one implementation produces knowledge_assertions rows
// — reused by the live route (buildFromCanonical) AND the one-off backfill
// (/api/admin/backfill-knowledge-assertions, task #3). A second, drifted copy
// of this resolution logic in raw SQL is exactly the kind of duplication the
// whole redesign exists to eliminate — see design doc §6.1.

export type SystemFacts = {
  systemUrl: string
  manufacturerUrl: string
  compactAssertions: Assertion[]
  atomicAssertions: AtomicAssertion[]
  retrievalDocuments: RetrievalDocument[]
  queryTerms: { concept: string; synonyms: string[] }[]
  knowledgeGaps: KnowledgeGap[]
}

export function buildFactsForCanonicalSystem(bundle: CanonicalSystemBundle): SystemFacts {
  const systemUrl = `${STUDIO_ORIGIN}/cards/${bundle.manufacturer.slug}/${bundle.system.slug}`
  const manufacturerUrl = `${STUDIO_ORIGIN}/manufacturers/${bundle.manufacturer.slug}`
  const factCounter = { n: 0 }
  const inputs: FactInputs = { bundle, systemUrl, manufacturerUrl, subjectName: bundle.system.name, factCounter }

  const compactAssertions: Assertion[] = []
  const atomicAssertions: AtomicAssertion[] = []

  for (const d of SYSTEM_FIELD_DESCRIPTORS) {
    const raw = (bundle.system as unknown as Record<string, unknown>)[d.fieldName]
    if (raw === null || raw === undefined || raw === '') continue
    if (d.isBoolean && typeof raw !== 'boolean') continue
    const built = buildDescriptorFact(d, raw as string | boolean, inputs)
    compactAssertions.push(built.compact)
    atomicAssertions.push(built.atomic)
  }

  // Custom technical attributes — freeform facts with no dedicated column.
  // Step 1 default: claimType manufacturer_statement (see design doc §5a.9
  // note — proper claimType assignment happens once these are migrated into
  // knowledge_assertions, task #3).
  for (const attr of bundle.system.custom_technical_attributes ?? []) {
    factCounter.n += 1
    const factId = `fact:${bundle.system.slug}-${String(factCounter.n).padStart(3, '0')}`
    compactAssertions.push({
      '@id': factId,
      '@type': ['bq:Assertion', 'prov:Entity'],
      'bq:subject': { '@id': systemUrl },
      'bq:predicate': 'bq:customAttribute',
      'bq:objectValue': { label: attr.label, value: attr.value },
      'bq:origin': 'manufacturer_supplied',
      'bq:epistemicStatus': 'unverified',
      'bq:trustLevel': 'extracted',
    })
    atomicAssertions.push({
      '@id': `${STUDIO_ORIGIN}/id/assertion/${bundle.system.slug}-${String(factCounter.n).padStart(3, '0')}`,
      '@type': 'bq:AtomicAssertion',
      'bq:system': { '@id': systemUrl },
      'bq:manufacturer': { '@id': manufacturerUrl },
      'bq:subject': bundle.system.name,
      'bq:claim': `${attr.label}: ${attr.value}.`,
      'bq:claimType': 'manufacturer_statement',
      'bq:epistemicStatus': 'unverified',
      'bq:trustLevel': 'extracted',
      'bq:answerPolicy': 'answer_with_source',
      'bq:retrievalText': `${bundle.system.name} (${bundle.manufacturer.name}). ${attr.label}: ${attr.value}.`,
      'bq:canonicalAssertion': { '@id': factId },
    })
  }

  const retrievalDocuments = buildRetrievalDocuments(bundle.system.slug, bundle.system.name, bundle.manufacturer.name, atomicAssertions)

  // Dedup query terms actually used.
  const usedPredicates = new Set(compactAssertions.map((a) => a['bq:predicate']))
  const queryTerms = QUERY_TERMS.filter((t) => usedPredicates.has(t.predicate))
    .map((t) => ({ concept: t.concept, synonyms: t.synonyms }))

  const knowledgeGaps: KnowledgeGap[] = compactAssertions
    .filter((a) => a['bq:epistemicStatus'] === 'disputed')
    .map((a) => ({
      '@type': 'bq:KnowledgeGap',
      'bq:about': a['bq:predicate'],
      'bq:status': 'disputed',
      'bq:reason': 'Flagged incorrect by the manufacturer; no correction supplied yet. Not stated pending resolution.',
    }))

  return { systemUrl, manufacturerUrl, compactAssertions, atomicAssertions, retrievalDocuments, queryTerms, knowledgeGaps }
}

export function buildFromCanonical(bundle: CanonicalSystemBundle): KnowledgeObject {
  const {
    systemUrl, manufacturerUrl, compactAssertions, atomicAssertions,
    retrievalDocuments, queryTerms, knowledgeGaps,
  } = buildFactsForCanonicalSystem(bundle)

  return {
    '@context': KNOWLEDGE_CONTEXT,
    '@id': systemUrl,
    '@type': ['bq:ConstructionSystem', 'Product'],
    'bq:format': KNOWLEDGE_FORMAT,
    'bq:formatVersion': KNOWLEDGE_FORMAT_VERSION,
    'bq:generatedAt': new Date().toISOString(),
    'bq:canonicalUrl': systemUrl,
    'bq:customerCardUrl': `https://buildquote.com.au/library/${bundle.manufacturer.slug}/${bundle.system.slug}`,
    name: bundle.system.name,
    ...(bundle.system.product_code ? { sku: bundle.system.product_code } : {}),
    ...(bundle.system.category ? { category: [bundle.system.category, bundle.system.subcategory].filter(Boolean).join(' > ') } : {}),
    ...(bundle.system.description ? { description: bundle.system.description } : {}),
    manufacturer: {
      '@type': 'Organization',
      '@id': manufacturerUrl,
      name: bundle.manufacturer.name,
      ...(bundle.manufacturer.abn ? { identifier: { '@type': 'PropertyValue', propertyID: 'ABN', value: bundle.manufacturer.abn } } : {}),
      ...(bundle.manufacturer.website_url ? { url: bundle.manufacturer.website_url } : {}),
    },
    'bq:contains': bundle.profiles.map((p) => ({
      '@type': ['bq:SystemProfile', 'Product'],
      '@id': `#profile-${p.id}`,
      name: p.profile_name || p.name,
      ...(p.product_code ? { sku: p.product_code } : {}),
      'bq:isPrimarySellableUnit': true,
      ...(p.length_mm != null ? { length: { '@type': 'QuantitativeValue', value: p.length_mm, unitCode: 'MMT' } } : {}),
      ...(p.width_mm != null ? { width: { '@type': 'QuantitativeValue', value: p.width_mm, unitCode: 'MMT' } } : {}),
      ...(p.height_mm != null ? { height: { '@type': 'QuantitativeValue', value: p.height_mm, unitCode: 'MMT' } } : {}),
      ...(p.thickness_mm != null ? { 'bq:thickness': { '@type': 'QuantitativeValue', value: p.thickness_mm, unitCode: 'MMT' } } : {}),
      ...(p.weight_kg != null ? { weight: { '@type': 'QuantitativeValue', value: p.weight_kg, unitCode: 'KGM' } } : {}),
      ...(p.uom ? { 'bq:sellUnit': p.uom } : {}),
      ...(p.supplier_pack_qty != null ? { 'bq:supplierPack': { quantity: p.supplier_pack_qty, unit: p.supplier_pack_uom ?? undefined } } : {}),
    })),
    ...(() => {
      const byRole: Record<string, unknown[]> = { required: [], optional: [], accessory: [] }
      for (const c of bundle.components) {
        const node = {
          '@type': ['bq:Component', 'Product'],
          '@id': `#comp-${c.id}`,
          name: c.name,
          ...(c.sku ? { sku: c.sku } : {}),
          ...(c.description ? { description: c.description } : {}),
          ...(c.category ? { category: c.category } : {}),
          'bq:componentRole': c.role,
        }
        ;(byRole[c.role] ?? (byRole[c.role] = [])).push(node)
      }
      return {
        ...(byRole.required?.length ? { 'bq:requires': byRole.required } : {}),
        ...(byRole.optional?.length ? { 'bq:optionalComponent': byRole.optional } : {}),
        ...(byRole.accessory?.length ? { 'bq:accessory': byRole.accessory } : {}),
      }
    })(),
    'bq:finishOption': bundle.colours.map((c) => ({
      '@type': 'bq:FinishOption',
      name: c.colour_name,
      ...(c.sku_suffix ? { sku: c.sku_suffix } : {}),
      'bq:isStocked': c.is_stocked ?? true,
    })),
    'bq:documentedBy': buildDocumentedBy(bundle),
    'bq:coverage': NOT_YET_EXTRACTED_COVERAGE,
    'bq:knowledgeGaps': knowledgeGaps,
    'bq:assertions': compactAssertions,
    'bq:knowledge': {
      'bq:knowledgeVersion': '1.0',
      'bq:retrievalEnabled': true,
      'bq:atomicAssertions': atomicAssertions,
      'bq:retrievalDocuments': retrievalDocuments,
      'bq:queryTerms': queryTerms,
    },
    'bq:dataLicence': {
      status: 'pending',
      permissions: {
        publicSearch: false,
        aiRetrieval: false,
        aiTraining: false,
        commercialRedistribution: false,
        benchmarking: false,
      },
    },
    'bq:usageNote':
      'Facts without epistemicStatus manufacturer_verified or manufacturer_corrected are BuildQuote extractions and must be attributed as such, not presented as manufacturer statements. BuildQuote holds no pricing data. bq:dataLicence permissions are currently all false/pending — this object is published for demonstration and evaluation; see bq:dataLicence.status before using it for retrieval, training or redistribution.',
  }
}

// ─── Entry point: versioned, from a frozen card_versions row ───────────────
// Lower fidelity than buildFromCanonical() until step 8 (freeze
// knowledge_json at publish, task #11) lands — card_versions only carries
// the customer-card field shape today, no field-level provenance. Marked
// via bq:knowledgeFidelity so a consumer can tell the difference.

export function buildFromCardVersion(
  cardJson: SystemCardSystem,
  meta: { manufacturerSlug: string; cardSlug: string; version: number; validatedBy: string | null; validatedAt: string | null },
): KnowledgeObject {
  const systemUrl = `${STUDIO_ORIGIN}/cards/${meta.manufacturerSlug}/${meta.cardSlug}`
  const manufacturerUrl = `${STUDIO_ORIGIN}/manufacturers/${meta.manufacturerSlug}`

  return {
    '@context': KNOWLEDGE_CONTEXT,
    '@id': systemUrl,
    '@type': ['bq:ConstructionSystem', 'Product'],
    'bq:format': KNOWLEDGE_FORMAT,
    'bq:formatVersion': KNOWLEDGE_FORMAT_VERSION,
    'bq:knowledgeFidelity': 'structural',
    'bq:generatedAt': new Date().toISOString(),
    'bq:canonicalUrl': systemUrl,
    'bq:versionedUrl': `${systemUrl}/v/${meta.version}`,
    'bq:cardVersion': meta.version,
    name: cardJson.name,
    ...(cardJson.product_code ? { sku: cardJson.product_code } : {}),
    ...(cardJson.description ? { description: cardJson.description } : {}),
    manufacturer: cardJson.manufacturer
      ? { '@type': 'Organization', '@id': manufacturerUrl, name: cardJson.manufacturer.name }
      : { '@type': 'Organization', '@id': manufacturerUrl },
    'bq:verification': meta.validatedBy
      ? { '@type': 'bq:VerificationRecord', 'bq:verifiedBy': { name: meta.validatedBy }, 'bq:verifiedAt': meta.validatedAt }
      : undefined,
    'bq:coverage': NOT_YET_EXTRACTED_COVERAGE,
    'bq:knowledgeGaps': [],
    'bq:assertions': [],
    'bq:knowledge': {
      'bq:knowledgeVersion': '1.0',
      'bq:retrievalEnabled': false,
      'bq:atomicAssertions': [],
      'bq:retrievalDocuments': [],
      'bq:queryTerms': [],
    },
    'bq:dataLicence': {
      status: 'pending',
      permissions: { publicSearch: false, aiRetrieval: false, aiTraining: false, commercialRedistribution: false, benchmarking: false },
    },
    'bq:usageNote':
      'This is a versioned snapshot generated before field-level provenance freezing was implemented (bq:knowledgeFidelity: "structural"). Field-level assertions and evidence are not yet available for historical versions; request the object without ?v= for the live, fully-provenanced view.',
  } as unknown as KnowledgeObject
}
