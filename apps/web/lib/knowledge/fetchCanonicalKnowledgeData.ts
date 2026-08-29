// Assembles one system's canonical data for the knowledge generator. Public,
// unauthenticated route — service client, same posture as getHostedCard.ts.
//
// Deliberately reads the CURRENT staged_* tables, not card_versions: this is
// the "live" half of the versioned-snapshot-plus-live-view design (§ freshness
// decision). The versioned half (?v=) is served from card_versions.card_json
// by the route itself, via buildFromCardVersion() in buildSystemKnowledge.ts.

import { createStudioServiceClient } from '@/lib/supabase/service'

export type FieldVerificationRow = {
  field_name: string
  extracted_value: string | null
  verified_value: string | null
  status: string
  confidence: number | null
  reviewer_id: string | null
  reviewed_at: string | null
}

export type ParserEvidenceRow = {
  field_name: string
  source_document_id: string | null
  source_page_number: number | null
  source_chunk_id: string | null
  confidence: number | null
  is_uncertain: boolean
  parser_note: string | null
  created_at: string
}

export type SystemSourceRow = {
  role: string
  label: string | null
  url: string
  source_document_id: string | null
  ingest_status: string
  include_in_container: boolean
}

export type SourceDocumentRow = {
  id: string
  document_name: string
  document_type: string | null
  document_date: string | null
  public_url: string | null
}

// knowledge_assertions (migration 065) — the keystone table the knowledge
// parser, system-identity parser and Company Knowledge panel all write to,
// but which nothing read back into the generator until now (design doc
// addendum 3 follow-up: "the write side shipped, the read side didn't").
export type KnowledgeAssertionRow = {
  id: string
  staged_system_id: string | null // NULL = company-wide, inherited onto every system (§9.2)
  subject_kind: string
  subject_local_id: string | null
  predicate: string
  object_kind: string
  object_value: unknown
  claim_type: string
  origin: string
  epistemic_status: string
  answer_policy: string | null
  confidence: number | null
  verified_by: string | null
  verified_at: string | null
  reviewer_notes: string | null
  created_at: string
}

// system_relationships (migration 065) — the one A-class fact a
// manufacturer actively authors for the AI layer directly (design doc §4):
// compatibility/incompatibility/supersession the generator never had a read
// path for until now.
export type SystemRelationshipRow = {
  id: string
  relation: 'compatible_with' | 'incompatible_with' | 'supersedes' | 'superseded_by' | 'substitute_for' | 'requires_system'
  target_staged_system_id: string | null
  target_external: { name: string; manufacturer?: string; url?: string; kind?: string } | null
  note: string | null
  reason: string | null
  epistemic_status: string
  verified_at: string | null
}

export type AssertionEvidenceRow = {
  assertion_id: string
  source_kind: string
  source_document_id: string | null
  page_start: number | null
  page_end: number | null
  locator: string | null
  quote: string | null
}

export type CanonicalProfile = {
  id: string
  profile_name: string | null
  name: string | null
  product_code: string | null
  dimensions: string | null
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  weight_kg: number | null
  uom: string | null
  supplier_pack_qty: number | null
  supplier_pack_uom: string | null
  sort_order: number
}

export type CanonicalComponent = {
  id: string
  role: string
  name: string
  sku: string | null
  description: string | null
  category: string | null
}

export type CanonicalColour = {
  colour_name: string
  sku_suffix: string | null
  is_stocked: boolean | null
}

export type CanonicalSystemBundle = {
  system: {
    id: string
    name: string
    slug: string
    product_code: string | null
    category: string | null
    subcategory: string | null
    description: string | null
    australian_made: boolean | null
    bal_rating: string | null
    fire_rating: string | null
    acoustic_rating: string | null
    structural_grade: string | null
    moisture_resistant: boolean | null
    website_url: string | null
    tech_data_url: string | null
    design_guide_url: string | null
    install_guide_urls: { label: string; url: string }[] | null
    custom_technical_attributes: { label: string; value: string }[] | null
    verification_status: string
    verified_at: string | null
    updated_at: string
  }
  manufacturer: { id: string; name: string; slug: string; abn: string | null; phone: string | null; website_url: string | null }
  profiles: CanonicalProfile[]
  components: CanonicalComponent[]
  colours: CanonicalColour[]
  fieldVerifications: FieldVerificationRow[]
  parserEvidence: ParserEvidenceRow[]
  /** reviewer_id -> 'manufacturer_user' | 'buildquote_admin' | 'buildquote_reviewer' */
  reviewerRoles: Map<string, string>
  systemSources: SystemSourceRow[]
  sourceDocuments: Map<string, SourceDocumentRow>
  /** source_document_id -> AI-generated document synopsis (migration 067,
   * design doc addendum 3 §C6 "per-document-type JSON-LD summaries"). Empty
   * pre-067 or before the knowledge parser has run for a document. */
  documentSummaries: Map<string, { summary: string; generatedAt: string | null }>
  /** This system's own assertions PLUS this manufacturer's company-wide
   * ones (staged_system_id IS NULL) — everything the knowledge parser,
   * system-identity parser and Company Knowledge panel have written that
   * belongs on this card. Excludes 'superseded' rows (historical, not
   * current — reachable only via supersedes_assertion_id, not as a live
   * fact). Empty pre-065. */
  knowledgeAssertions: KnowledgeAssertionRow[]
  /** assertion_id -> its evidence rows (assertion_evidence, migration 065). */
  assertionEvidence: Map<string, AssertionEvidenceRow[]>
  /** This system's authored relationships (Relationships panel). Empty pre-065. */
  systemRelationships: SystemRelationshipRow[]
  /** staged_system_id -> {name, slug} for internal relationship targets, so
   * the generator can build a resolvable @id without a second round trip
   * per relationship. */
  relationshipTargets: Map<string, { name: string; slug: string }>
}

export async function fetchCanonicalSystemBundle(
  manufacturerSlug: string,
  cardSlug: string,
): Promise<CanonicalSystemBundle | null> {
  try {
    const supabase = createStudioServiceClient()

    const { data: manufacturer } = await supabase
      .from('data_studio_manufacturers')
      .select('id, name, slug, abn, phone, website_url')
      .eq('slug', manufacturerSlug)
      .single()
    if (!manufacturer) return null

    const { data: system } = await supabase
      .from('staged_systems')
      .select(
        `id, name, slug, product_code, category, subcategory, description,
         australian_made, bal_rating, fire_rating, acoustic_rating, structural_grade, moisture_resistant,
         website_url, tech_data_url, design_guide_url, install_guide_urls, custom_technical_attributes,
         verification_status, verified_at, updated_at`,
      )
      .eq('manufacturer_id', manufacturer.id)
      .eq('slug', cardSlug)
      .neq('verification_status', 'archived')
      .maybeSingle()
    if (!system) return null

    const systemId = system.id as string

    const [profilesRes, coloursRes, sysComponentsRes, fieldVerRes, sourcesRes] = await Promise.all([
      supabase
        .from('staged_system_profiles')
        .select('id, profile_name, name, product_code, dimensions, length_mm, width_mm, height_mm, thickness_mm, weight_kg, uom, supplier_pack_qty, supplier_pack_uom, sort_order')
        .eq('staged_system_id', systemId)
        .order('sort_order'),
      supabase
        .from('staged_system_colours')
        .select('colour_name, sku_suffix, is_stocked')
        .eq('staged_system_id', systemId)
        .order('sort_order'),
      supabase
        .from('staged_system_components')
        .select('role, staged_components(id, name, sku, description, category)')
        .eq('staged_system_id', systemId),
      supabase
        .from('field_verifications')
        .select('field_name, extracted_value, verified_value, status, confidence, reviewer_id, reviewed_at')
        .eq('entity_type', 'staged_system')
        .eq('entity_id', systemId),
      supabase
        .from('system_sources')
        .select('role, label, url, source_document_id, ingest_status, include_in_container')
        .eq('staged_system_id', systemId)
        .order('sort_order'),
    ])

    type CompLink = { role: string; staged_components: CanonicalComponent | CanonicalComponent[] | null }
    const components: CanonicalComponent[] = ((sysComponentsRes.data ?? []) as unknown as CompLink[])
      .map((r) => {
        const comp = Array.isArray(r.staged_components) ? r.staged_components[0] : r.staged_components
        if (!comp) return null
        return { ...comp, role: r.role }
      })
      .filter((c): c is CanonicalComponent => c !== null)

    // parser_field_evidence: most recent row per field only (append-only table).
    let parserEvidence: ParserEvidenceRow[] = []
    try {
      const { data } = await supabase
        .from('parser_field_evidence')
        .select('field_name, source_document_id, source_page_number, source_chunk_id, confidence, is_uncertain, parser_note, created_at')
        .eq('entity_type', 'staged_system')
        .eq('entity_id', systemId)
        .order('created_at', { ascending: false })
      const seen = new Set<string>()
      for (const row of (data ?? []) as ParserEvidenceRow[]) {
        if (seen.has(row.field_name)) continue
        seen.add(row.field_name)
        parserEvidence.push(row)
      }
    } catch {
      parserEvidence = [] // pre-008 environments — no evidence table
    }

    const fieldVerifications = (fieldVerRes.data ?? []) as FieldVerificationRow[]
    const reviewerIds = Array.from(new Set(fieldVerifications.map((f) => f.reviewer_id).filter((id): id is string => !!id)))
    const reviewerRoles = new Map<string, string>()
    if (reviewerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('data_studio_user_profiles')
        .select('auth_user_id, global_role')
        .in('auth_user_id', reviewerIds)
      for (const p of (profiles ?? []) as { auth_user_id: string; global_role: string }[]) {
        reviewerRoles.set(p.auth_user_id, p.global_role)
      }
    }

    const systemSources = (sourcesRes.data ?? []) as SystemSourceRow[]
    const sourceDocuments = new Map<string, SourceDocumentRow>()
    const docIds = Array.from(new Set([
      ...systemSources.map((s) => s.source_document_id),
      ...parserEvidence.map((p) => p.source_document_id),
    ].filter((id): id is string => !!id)))
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from('source_documents')
        .select('id, document_name, document_type, document_date, public_url')
        .in('id', docIds)
      for (const d of (docs ?? []) as SourceDocumentRow[]) sourceDocuments.set(d.id, d)
    }

    // Isolated, separately-caught query (not part of the Promise.all above)
    // so a pre-067 environment — this column doesn't exist yet — degrades to
    // "no summaries" rather than failing the whole bundle fetch, same
    // convention as parserEvidence above.
    const documentSummaries = new Map<string, { summary: string; generatedAt: string | null }>()
    try {
      const { data } = await supabase
        .from('system_sources')
        .select('source_document_id, ai_summary, ai_summary_generated_at')
        .eq('staged_system_id', systemId)
        .not('ai_summary', 'is', null)
      for (const row of (data ?? []) as { source_document_id: string | null; ai_summary: string | null; ai_summary_generated_at: string | null }[]) {
        if (row.source_document_id && row.ai_summary) {
          documentSummaries.set(row.source_document_id, { summary: row.ai_summary, generatedAt: row.ai_summary_generated_at })
        }
      }
    } catch {
      // pre-067 environments — ai_summary column not present yet
    }

    // Isolated, separately-caught (not the shared Promise.all) so a pre-065
    // environment — knowledge_assertions doesn't exist yet — degrades to
    // "no assertions" rather than failing the whole bundle fetch.
    let knowledgeAssertions: KnowledgeAssertionRow[] = []
    const assertionEvidence = new Map<string, AssertionEvidenceRow[]>()
    try {
      const { data } = await supabase
        .from('knowledge_assertions')
        .select(
          `id, staged_system_id, subject_kind, subject_local_id, predicate, object_kind,
           object_value, claim_type, origin, epistemic_status, answer_policy, confidence,
           verified_by, verified_at, reviewer_notes, created_at`,
        )
        .or(`staged_system_id.eq.${systemId},and(staged_system_id.is.null,manufacturer_id.eq.${manufacturer.id})`)
        .neq('epistemic_status', 'superseded')
        .order('sort_order', { ascending: true })
      knowledgeAssertions = (data ?? []) as KnowledgeAssertionRow[]

      if (knowledgeAssertions.length > 0) {
        const assertionIds = knowledgeAssertions.map((a) => a.id)
        const { data: evidenceRows } = await supabase
          .from('assertion_evidence')
          .select('assertion_id, source_kind, source_document_id, page_start, page_end, locator, quote')
          .in('assertion_id', assertionIds)
        const rows = (evidenceRows ?? []) as AssertionEvidenceRow[]
        for (const e of rows) {
          const list = assertionEvidence.get(e.assertion_id) ?? []
          list.push(e)
          assertionEvidence.set(e.assertion_id, list)
        }
        // assertion_evidence can reference documents system_sources/
        // parser_field_evidence didn't already pull in above.
        const newDocIds = Array.from(new Set(
          rows.map((e) => e.source_document_id).filter((id): id is string => !!id && !sourceDocuments.has(id)),
        ))
        if (newDocIds.length > 0) {
          const { data: moreDocs } = await supabase
            .from('source_documents')
            .select('id, document_name, document_type, document_date, public_url')
            .in('id', newDocIds)
          for (const d of (moreDocs ?? []) as SourceDocumentRow[]) sourceDocuments.set(d.id, d)
        }
      }
    } catch {
      // pre-065 environments — knowledge_assertions table not present yet
    }

    // system_relationships — isolated, separately-caught for the same
    // pre-065-degrades-gracefully reason as everything else above.
    let systemRelationships: SystemRelationshipRow[] = []
    const relationshipTargets = new Map<string, { name: string; slug: string }>()
    try {
      const { data } = await supabase
        .from('system_relationships')
        .select('id, relation, target_staged_system_id, target_external, note, reason, epistemic_status, verified_at')
        .eq('staged_system_id', systemId)
        .order('sort_order')
      systemRelationships = (data ?? []) as SystemRelationshipRow[]

      const targetIds = Array.from(new Set(
        systemRelationships.map((r) => r.target_staged_system_id).filter((id): id is string => !!id),
      ))
      if (targetIds.length > 0) {
        const { data: targets } = await supabase
          .from('staged_systems')
          .select('id, name, slug')
          .in('id', targetIds)
        for (const t of (targets ?? []) as { id: string; name: string; slug: string | null }[]) {
          if (t.slug) relationshipTargets.set(t.id, { name: t.name, slug: t.slug })
        }
      }
    } catch {
      // pre-065 environments — system_relationships table not present yet
    }

    return {
      system: system as CanonicalSystemBundle['system'],
      manufacturer: manufacturer as CanonicalSystemBundle['manufacturer'],
      profiles: (profilesRes.data ?? []) as CanonicalProfile[],
      components,
      colours: (coloursRes.data ?? []) as CanonicalColour[],
      fieldVerifications,
      parserEvidence,
      reviewerRoles,
      systemSources,
      sourceDocuments,
      documentSummaries,
      knowledgeAssertions,
      assertionEvidence,
      systemRelationships,
      relationshipTargets,
    }
  } catch {
    return null // missing env/tables — caller 404s rather than crashing
  }
}

/** Lightweight catalogue row for /api/knowledge/index.jsonld. */
export type PublishedCardSummary = {
  manufacturerSlug: string
  manufacturerName: string
  cardSlug: string
  name: string
  updatedAt: string
}

export async function fetchPublishedCardIndex(): Promise<PublishedCardSummary[]> {
  try {
    const supabase = createStudioServiceClient()
    const { data } = await supabase
      .from('staged_systems')
      .select('slug, name, updated_at, verification_status, data_studio_manufacturers(slug, name)')
      .eq('verification_status', 'manufacturer_verified')
      .not('slug', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500)

    type Row = {
      slug: string; name: string; updated_at: string
      data_studio_manufacturers: { slug: string; name: string } | { slug: string; name: string }[] | null
    }
    return ((data ?? []) as unknown as Row[])
      .map((r) => {
        const mfr = Array.isArray(r.data_studio_manufacturers) ? r.data_studio_manufacturers[0] : r.data_studio_manufacturers
        if (!mfr) return null
        return {
          manufacturerSlug: mfr.slug,
          manufacturerName: mfr.name,
          cardSlug: r.slug,
          name: r.name,
          updatedAt: r.updated_at,
        }
      })
      .filter((r): r is PublishedCardSummary => r !== null)
  } catch {
    return []
  }
}
