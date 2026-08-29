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
  SUPPRESSED_FROM_READING_SURFACE,
  type AnswerPolicy,
  type AssertionOrigin,
  type ClaimType,
  type EpistemicStatus,
} from './vocabulary'
import type {
  AtomicAssertion,
  Assertion,
  EvidenceReference,
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

export type WorkspaceUiSection = 'identity' | 'attributes' | 'documents' | 'applications'

export type FieldDescriptor = {
  fieldName: string
  predicate: string
  claimType: ClaimType
  label: string
  isBoolean?: boolean
  // Which System Workspace accordion section this fact displays in (design
  // doc §7.3). Independent of claimType — e.g. "Australian made" is a
  // claimType:'identity' fact (it's about the product's identity, not a
  // tested performance value) but belongs in the Attributes section next to
  // the other single-line product facts, not in Identity & description
  // (name/category/description). Two different axes, same reasoning as
  // claimType vs subject_kind in §5a.1.
  uiSection: WorkspaceUiSection
}

// Exported so the System Workspace UI (design doc §7.3 "Identity &
// description" / "Attributes & performance" sections) edits exactly the
// fields this generator emits — one list, not two that can drift apart.
export const SYSTEM_FIELD_DESCRIPTORS: FieldDescriptor[] = [
  { fieldName: 'name', predicate: 'bq:name', claimType: 'identity', label: 'System name', uiSection: 'identity' },
  { fieldName: 'category', predicate: 'bq:category', claimType: 'identity', label: 'Category', uiSection: 'identity' },
  { fieldName: 'subcategory', predicate: 'bq:subcategory', claimType: 'identity', label: 'Subcategory', uiSection: 'identity' },
  { fieldName: 'description', predicate: 'bq:description', claimType: 'identity', label: 'Description', uiSection: 'identity' },
  { fieldName: 'product_code', predicate: 'bq:productCode', claimType: 'identity', label: 'Product code', uiSection: 'identity' },
  { fieldName: 'website_url', predicate: 'bq:websiteUrl', claimType: 'identity', label: 'Manufacturer product page', uiSection: 'identity' },
  { fieldName: 'tech_data_url', predicate: 'bq:techDataUrl', claimType: 'manufacturer_statement', label: 'Technical data sheet', uiSection: 'documents' },
  { fieldName: 'design_guide_url', predicate: 'bq:designGuideUrl', claimType: 'manufacturer_statement', label: 'Design guide', uiSection: 'documents' },
  { fieldName: 'bal_rating', predicate: 'bq:balRating', claimType: 'performance_claim', label: 'Bushfire Attack Level', uiSection: 'attributes' },
  { fieldName: 'fire_rating', predicate: 'bq:fireRating', claimType: 'performance_claim', label: 'Fire rating', uiSection: 'attributes' },
  { fieldName: 'acoustic_rating', predicate: 'bq:acousticRating', claimType: 'performance_claim', label: 'Acoustic rating', uiSection: 'attributes' },
  { fieldName: 'structural_grade', predicate: 'bq:structuralGrade', claimType: 'performance_claim', label: 'Structural grade', uiSection: 'attributes' },
  { fieldName: 'moisture_resistant', predicate: 'bq:moistureResistant', claimType: 'performance_claim', label: 'Moisture resistant', isBoolean: true, uiSection: 'attributes' },
  { fieldName: 'australian_made', predicate: 'bq:countryOfOrigin', claimType: 'identity', label: 'Australian made', isBoolean: true, uiSection: 'attributes' },
]

// Categories the customer card / staged schema can express today but this
// generator does not yet turn into assertions — surfaced honestly as
// coverage, not silence and not a fabricated per-product gap.
export const NOT_YET_EXTRACTED_COVERAGE: Record<string, string> = {
  installationMethods: 'not_yet_extracted — pending the knowledge parser (design doc §7)',
  fixingRequirements: 'not_yet_extracted — pending the knowledge parser',
  applications: 'not_yet_extracted — pending the knowledge parser',
  compatibility: 'not_yet_captured — pending the Relationships panel (design doc §6.3/§7.3)',
  incompatibility: 'not_yet_captured — pending the Relationships panel',
  certification: 'not_yet_captured — no certification data model yet',
  standards: 'not_yet_captured — no standards data model yet',
  environmentalConstraints: 'not_yet_captured — no environmental-envelope data model yet',
}

// Which NOT_YET_EXTRACTED_COVERAGE key becomes actually-covered once at
// least one knowledge_assertions row of the matching claim_type exists for
// this system. compatibility/incompatibility are deliberately absent —
// those come from system_relationships (the Relationships panel), a
// separate table this generator doesn't read yet; they stay unconditionally
// "not yet captured" until that's wired too.
const COVERAGE_CLAIM_TYPES: Partial<Record<keyof typeof NOT_YET_EXTRACTED_COVERAGE, ClaimType[]>> = {
  installationMethods: ['installation_method'],
  fixingRequirements: ['installation_requirement'],
  applications: ['application'],
  certification: ['certification'],
  standards: ['regulatory_relationship'],
  environmentalConstraints: ['environmental_constraint'],
}

export function buildCoverage(
  atomics: AtomicAssertion[],
  relationships?: Record<string, Record<string, unknown>[]>,
): Record<string, string> {
  const present = new Set(atomics.map((a) => a['bq:claimType']))
  const coverage: Record<string, string> = {}
  for (const [key, note] of Object.entries(NOT_YET_EXTRACTED_COVERAGE)) {
    const claimTypes = COVERAGE_CLAIM_TYPES[key as keyof typeof NOT_YET_EXTRACTED_COVERAGE]
    let nowCovered = claimTypes?.some((ct) => present.has(ct)) ?? false
    if (!nowCovered && key === 'compatibility') nowCovered = (relationships?.['bq:compatibleWith']?.length ?? 0) > 0
    if (!nowCovered && key === 'incompatibility') nowCovered = (relationships?.['bq:incompatibleWith']?.length ?? 0) > 0
    if (!nowCovered) coverage[key] = note
  }
  return coverage
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

// ─── knowledge_assertions → facts ───────────────────────────────────────────
// The read side the knowledge parser, system-identity parser and Company
// Knowledge panel never had: everything those write into knowledge_assertions
// (installation methods, fixing requirements, applications, performance
// claims, company-wide policy answers…) turned into the same compact/atomic
// fact pairs buildDescriptorFact produces for typed staged_systems columns.
// A company-level row (staged_system_id NULL) is inherited onto every one of
// the manufacturer's cards — its subject is the manufacturer, not this system,
// same as design doc §9.2's "verify once, verified everywhere".
//
// No filtering by epistemic_status here: 'disputed'/'unknown' rows still get
// a compact+atomic pair (matching buildDescriptorFact's own behaviour) —
// SUPPRESSED_FROM_READING_SURFACE governs render-time value display, not
// whether a fact is present in these provenance arrays; every atomic fact
// carries its own status and answerPolicy alongside, never a bare value.

export function humanizePredicate(predicate: string): string {
  return predicate
    .replace(/^bq:/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}

function buildKnowledgeAssertionFacts(bundle: CanonicalSystemBundle, inputs: FactInputs): BuiltFact[] {
  const out: BuiltFact[] = []

  for (const row of bundle.knowledgeAssertions) {
    const factId = nextFactId(bundle, inputs.factCounter)
    const status = row.epistemic_status as EpistemicStatus
    const trustLevel = trustLevelFor(status)
    const claimType = row.claim_type as ClaimType
    const answerPolicy = (row.answer_policy as AnswerPolicy | null) ?? resolveAnswerPolicy(status, claimType)
    const isCompanyLevel = row.staged_system_id === null

    const objectValue = row.object_value
    const valuePart = objectValue && typeof objectValue === 'object' && 'value' in (objectValue as Record<string, unknown>)
      ? (objectValue as Record<string, unknown>).value
      : objectValue
    const condition = objectValue && typeof objectValue === 'object' && 'condition' in (objectValue as Record<string, unknown>)
      ? ((objectValue as Record<string, unknown>).condition as string | null)
      : null
    const valueText = valuePart == null ? '' : String(valuePart)

    const evidenceRows = bundle.assertionEvidence.get(row.id) ?? []
    const primaryEvidence = evidenceRows[0]
    const sourceDoc = primaryEvidence?.source_document_id ? bundle.sourceDocuments.get(primaryEvidence.source_document_id) : undefined

    const label = humanizePredicate(row.predicate)
    const isVerified = status === 'manufacturer_verified' || status === 'manufacturer_corrected'

    const evidence: EvidenceReference[] = evidenceRows.length
      ? evidenceRows.map((e) => ({
          '@type': 'bq:EvidenceReference' as const,
          ...(e.source_document_id && bundle.sourceDocuments.has(e.source_document_id)
            ? { 'bq:document': { '@id': `#doc-${e.source_document_id}` } } : {}),
          ...(e.page_start != null ? { 'bq:pageStart': e.page_start } : {}),
          ...(e.page_end != null ? { 'bq:pageEnd': e.page_end } : {}),
          ...(e.locator ? { 'bq:locator': e.locator } : {}),
          ...(e.quote ? { 'bq:quote': e.quote } : {}),
        }))
      : isVerified
        ? [{ '@type': 'bq:EvidenceReference' as const, 'bq:sourceKind': 'manufacturer_statement' as const }]
        : []

    const compact: Assertion = {
      '@id': factId,
      '@type': ['bq:Assertion', 'prov:Entity'],
      'bq:subject': { '@id': isCompanyLevel ? inputs.manufacturerUrl : inputs.systemUrl },
      'bq:predicate': row.predicate,
      'bq:objectValue': objectValue,
      'bq:origin': (row.origin as AssertionOrigin) ?? 'document_extracted',
      'bq:epistemicStatus': status,
      'bq:trustLevel': trustLevel,
      ...(row.confidence != null ? { 'bq:confidence': row.confidence } : {}),
      'bq:assertedAt': row.created_at,
      ...(row.verified_at ? { 'bq:verifiedAt': row.verified_at } : {}),
      ...(isVerified ? { 'bq:verifiedBy': { name: bundle.manufacturer.name } } : {}),
      ...(evidence.length ? { 'bq:evidence': evidence } : {}),
    }

    const retrievalText =
      `${inputs.subjectName} (${bundle.manufacturer.name}). ` +
      (isCompanyLevel ? 'Company-wide policy — ' : '') +
      `${label}: ${valueText}.` +
      (condition ? ` ${condition}` : '') +
      (isVerified ? ' Manufacturer verified.'
        : status === 'buildquote_checked' ? ' Checked by BuildQuote against the source document.'
        : SUPPRESSED_FROM_READING_SURFACE.has(status) ? ''
        : ' Extracted by BuildQuote; not yet reviewed — cite as an extraction, not a manufacturer statement.') +
      (sourceDoc ? ` Source: ${sourceDoc.document_name}${primaryEvidence?.page_start ? `, page ${primaryEvidence.page_start}` : ''}.` : '')

    const atomic: AtomicAssertion = {
      '@id': `${STUDIO_ORIGIN}/id/assertion/${bundle.system.slug}-${String(inputs.factCounter.n).padStart(3, '0')}`,
      '@type': 'bq:AtomicAssertion',
      'bq:system': { '@id': inputs.systemUrl },
      'bq:manufacturer': { '@id': inputs.manufacturerUrl },
      'bq:subject': inputs.subjectName,
      'bq:claim': `${label}: ${valueText}.${condition ? ` ${condition}` : ''}`,
      'bq:claimType': claimType,
      'bq:value': objectValue,
      'bq:epistemicStatus': status,
      'bq:trustLevel': trustLevel,
      'bq:answerPolicy': answerPolicy,
      ...(condition ? { 'bq:conditions': [condition] } : {}),
      ...(isCompanyLevel ? { 'bq:appliesTo': { scope: 'company-wide, inherited from manufacturer policy' } } : {}),
      ...(sourceDoc || row.verified_at
        ? {
            'bq:sourceSummary': {
              documentName: sourceDoc?.document_name ?? 'Manufacturer statement',
              page: primaryEvidence?.page_start ?? null,
              verifiedBy: isVerified ? bundle.manufacturer.name : null,
              verifiedAt: row.verified_at,
            },
          }
        : {}),
      'bq:retrievalText': retrievalText,
      'bq:canonicalAssertion': { '@id': factId },
    }

    out.push({ compact, atomic })
  }

  return out
}

// ─── knowledge_assertions → workspace view models ──────────────────────────
// The System Workspace's Applications & installation section (§7.3) needs a
// plain view model, not full JSON-LD — this is the same data
// buildKnowledgeAssertionFacts() turns into JSON-LD facts, mapped instead
// into the FactViewModel shape the workspace's FactRow component already
// renders for identity/attribute facts (components/workspace/factViewModel.ts,
// kept import-free of this server-only module by design — the page loader
// does the actual shaping into that shared type).

export type ApplicationFactSource = {
  predicate: string
  claimType: ClaimType
  label: string
  value: string
  rawValue: unknown
  origin: AssertionOrigin
  epistemicStatus: EpistemicStatus
  sourceDocumentId: string | null
  sourcePageNumber: number | null
  sourceLine: string | null
  isCompanyLevel: boolean
}

export function buildApplicationFacts(bundle: CanonicalSystemBundle): ApplicationFactSource[] {
  return bundle.knowledgeAssertions.map((row) => {
    const evidenceRows = bundle.assertionEvidence.get(row.id) ?? []
    const primary = evidenceRows[0]
    const sourceDoc = primary?.source_document_id ? bundle.sourceDocuments.get(primary.source_document_id) : undefined
    const objectValue = row.object_value
    const valuePart = objectValue && typeof objectValue === 'object' && 'value' in (objectValue as Record<string, unknown>)
      ? (objectValue as Record<string, unknown>).value
      : objectValue
    const value = valuePart == null ? '' : String(valuePart)

    return {
      predicate: row.predicate,
      claimType: row.claim_type as ClaimType,
      label: humanizePredicate(row.predicate),
      value,
      rawValue: objectValue,
      origin: (row.origin as AssertionOrigin) ?? 'document_extracted',
      epistemicStatus: row.epistemic_status as EpistemicStatus,
      sourceDocumentId: primary?.source_document_id ?? null,
      sourcePageNumber: primary?.page_start ?? null,
      sourceLine: sourceDoc
        ? `${sourceDoc.document_name}${primary?.page_start ? `, page ${primary.page_start}` : ''}`
        : row.staged_system_id === null
          ? 'Company knowledge — manufacturer-supplied'
          : null,
      isCompanyLevel: row.staged_system_id === null,
    }
  })
}

// ─── Relationships — system_relationships → bq:ProductRelationship ─────────
// The one A-class fact a manufacturer actively authors for the AI layer
// directly (design doc §4) — compatibility/incompatibility/supersession the
// generator never had a read path for. Grouped by relation into the six
// top-level arrays the design doc's §2 example shows (bq:compatibleWith,
// bq:incompatibleWith, bq:supersedes, bq:supersededBy, bq:substituteFor,
// bq:requiresSystem) rather than folded into the generic assertions list —
// relationships point at another entity, not a literal value, and read
// naturally as their own named arrays.

const RELATION_KEYS: Record<string, string> = {
  compatible_with: 'bq:compatibleWith',
  incompatible_with: 'bq:incompatibleWith',
  supersedes: 'bq:supersedes',
  superseded_by: 'bq:supersededBy',
  substitute_for: 'bq:substituteFor',
  requires_system: 'bq:requiresSystem',
}

export function buildRelationships(bundle: CanonicalSystemBundle): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {}

  for (const r of bundle.systemRelationships) {
    const key = RELATION_KEYS[r.relation]
    if (!key) continue

    let target: Record<string, unknown>
    if (r.target_staged_system_id) {
      const t = bundle.relationshipTargets.get(r.target_staged_system_id)
      target = t
        ? { '@id': `${STUDIO_ORIGIN}/cards/${bundle.manufacturer.slug}/${t.slug}`, name: t.name }
        : { name: '(system no longer available)' }
    } else if (r.target_external) {
      target = {
        '@type': 'Product',
        name: r.target_external.name,
        ...(r.target_external.manufacturer ? { manufacturer: r.target_external.manufacturer } : {}),
        ...(r.target_external.url ? { url: r.target_external.url } : {}),
        'bq:targetKind': r.target_external.kind ?? 'product',
      }
    } else {
      continue
    }

    const node: Record<string, unknown> = {
      '@type': 'bq:ProductRelationship',
      'bq:target': target,
      ...(r.note ? { 'bq:note': r.note } : {}),
      ...(r.reason ? { 'bq:reason': r.reason } : {}),
      'bq:epistemicStatus': r.epistemic_status,
      ...(r.verified_at ? { 'bq:verifiedAt': r.verified_at } : {}),
    }

    ;(out[key] ?? (out[key] = [])).push(node)
  }

  return out
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
    const summary = s.source_document_id ? bundle.documentSummaries.get(s.source_document_id) : undefined
    docs.push({
      '@id': doc ? `#doc-${doc.id}` : undefined,
      '@type': ['bq:SourceDocument', 'DigitalDocument'],
      name: doc?.document_name ?? s.label ?? s.role,
      'bq:documentRole': s.role,
      url: s.url,
      'bq:ingestStatus': s.ingest_status,
      'bq:includedInContainer': s.include_in_container,
      ...(summary ? { 'bq:summary': summary.summary } : {}),
    })
  }
  return docs
}

// ─── Retrieval documents — one per source document (design doc addendum 3
// §C6 "per-document-type JSON-LD summaries", un-deferred) ──────────────────
// Distinct from buildRetrievalDocuments() below, which segments facts by
// claim type across the whole system. This is the orientation synopsis for
// ONE whole document — an install guide, a design guide — generated once by
// run_knowledge_parser.py and stored on system_sources.ai_summary (migration
// 067), not recomputed here. Only documents with a saved summary produce an
// entry; a document the knowledge parser hasn't processed yet is silently
// absent, same "declare only what's actually there" rule as everywhere else
// in this generator.

function buildDocumentSummaryRetrievalDocuments(
  bundle: CanonicalSystemBundle,
  systemSlug: string,
  subjectName: string,
  manufacturerName: string,
): RetrievalDocument[] {
  const out: RetrievalDocument[] = []
  const seen = new Set<string>()
  for (const s of bundle.systemSources) {
    if (!s.source_document_id || seen.has(s.source_document_id)) continue
    const summary = bundle.documentSummaries.get(s.source_document_id)
    if (!summary) continue
    seen.add(s.source_document_id)
    const doc = bundle.sourceDocuments.get(s.source_document_id)
    const docName = doc?.document_name ?? s.label ?? s.role
    out.push({
      '@id': `${STUDIO_ORIGIN}/api/cards/${systemSlug}/retrieval/document/${s.source_document_id}`,
      'bq:type': s.role,
      'bq:title': `${subjectName} — ${docName}`,
      'bq:text': `${subjectName} (${manufacturerName}). ${docName}: ${summary.summary}`,
    })
  }
  return out
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

  // knowledge_assertions — installation/application/performance facts from
  // the knowledge parser + system-identity parser, and company-wide answers
  // from the Company Knowledge panel, inherited onto this system.
  for (const built of buildKnowledgeAssertionFacts(bundle, inputs)) {
    compactAssertions.push(built.compact)
    atomicAssertions.push(built.atomic)
  }

  const retrievalDocuments = [
    ...buildRetrievalDocuments(bundle.system.slug, bundle.system.name, bundle.manufacturer.name, atomicAssertions),
    ...buildDocumentSummaryRetrievalDocuments(bundle, bundle.system.slug, bundle.system.name, bundle.manufacturer.name),
  ]

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
  const relationships = buildRelationships(bundle)

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
    ...relationships,
    'bq:documentedBy': buildDocumentedBy(bundle),
    'bq:coverage': buildCoverage(atomicAssertions, relationships),
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
