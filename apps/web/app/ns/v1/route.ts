// Dereferenceable JSON-LD context + vocabulary document for the bq: terms
// used across the knowledge layer. Design doc §11 (closes gap G14 — "no
// dereferenceable vocabulary").
//
// Only documents terms the generator (buildSystemKnowledge.ts) actually
// emits today. Extend this list in lockstep with the generator — this file
// is documentation of real output, not a spec for future output.

import { NextResponse } from 'next/server'
import { KNOWLEDGE_CONTEXT, BQ_NAMESPACE } from '@/lib/knowledge/vocabulary'

const TERMS: { term: string; comment: string }[] = [
  { term: 'bq:ConstructionSystem', comment: 'A BuildQuote system/product card, the root type of a knowledge object.' },
  { term: 'bq:SystemProfile', comment: 'A primary sellable dimensional variant of a system (schema.org Product subtype).' },
  { term: 'bq:Component', comment: 'An accessory, fixing, trim or consumable that belongs to a system.' },
  { term: 'bq:componentRole', comment: 'required | optional | accessory — how a component relates to its system.' },
  { term: 'bq:FinishOption', comment: 'A colour or finish option for a system.' },
  { term: 'bq:isStocked', comment: 'Whether a finish option is currently stocked.' },
  { term: 'bq:documentedBy', comment: 'Source documents evidencing facts about this system.' },
  { term: 'bq:SourceDocument', comment: 'A manufacturer document — installation guide, technical data sheet, design guide.' },
  { term: 'bq:documentRole', comment: 'install_guide | design_guide | tech_data | website | source_catalogue.' },
  { term: 'bq:Assertion', comment: 'A single reified fact, carrying its own origin, evidence and verification standing.' },
  { term: 'bq:AtomicAssertion', comment: 'A self-contained, denormalized view of an Assertion — safe to retrieve in isolation.' },
  { term: 'bq:origin', comment: 'manufacturer_supplied | document_extracted | web_extracted | derived | buildquote_editorial.' },
  { term: 'bq:epistemicStatus', comment: 'The verification standing of a fact — see /api/knowledge/manifest.json for the full enum and its rules.' },
  { term: 'bq:trustLevel', comment: 'Collapsed single-token trust signal: verified | checked | extracted | unknown.' },
  { term: 'bq:claimType', comment: 'What kind of claim a fact is (identity, dimension, performance_claim, …) — independent of which entity it is about.' },
  { term: 'bq:answerPolicy', comment: 'What an agent may do with a fact: answer_directly | answer_with_conditions | answer_with_source | answer_with_warning | do_not_infer | manufacturer_confirmation_required | not_applicable | unknown.' },
  { term: 'bq:evidence', comment: 'Evidence references supporting an assertion.' },
  { term: 'bq:EvidenceReference', comment: 'A document, page, chunk and (where captured) verbatim quote supporting a fact.' },
  { term: 'bq:sourceSummary', comment: 'A pre-joined, flattened evidence summary on an AtomicAssertion — document, page, verifier, date.' },
  { term: 'bq:retrievalText', comment: 'Self-contained natural-language rendering of a fact — manufacturer, product, claim, conditions, status, source.' },
  { term: 'bq:canonicalAssertion', comment: 'Points from a denormalized AtomicAssertion back to its canonical Assertion.' },
  { term: 'bq:knowledgeGaps', comment: 'Explicitly declared unknowns, not-applicable or disputed facts. Never silence.' },
  { term: 'bq:KnowledgeGap', comment: 'A declared gap: what is not known, why, and what would resolve it.' },
  { term: 'bq:coverage', comment: 'Which fact categories BuildQuote has not yet built extraction for — distinct from a per-product knowledge gap.' },
  { term: 'bq:knowledge', comment: 'The denormalized retrieval layer: atomic assertions, retrieval documents, query vocabulary.' },
  { term: 'bq:retrievalDocuments', comment: 'Small, topic-coherent, self-contained text units for embedding/RAG ingestion.' },
  { term: 'bq:queryTerms', comment: 'Trade and consumer vernacular synonyms mapped onto a predicate — never changes the underlying fact.' },
  { term: 'bq:dataLicence', comment: 'Redistribution/training permissions, separate from verification. Currently declarative only — see /api/knowledge/manifest.json.' },
  { term: 'bq:sellUnit', comment: 'The unit a profile or component is sold/quoted in (e.g. "ea", "lm", "sheet").' },
  { term: 'bq:supplierPack', comment: 'Manufacturer full-pack quantity — a logistics value, never the RFQ order quantity.' },
]

export async function GET() {
  return NextResponse.json(
    {
      '@context': KNOWLEDGE_CONTEXT,
      '@id': BQ_NAMESPACE.replace(/#$/, ''),
      'rdfs:comment': 'BuildQuote AI knowledge layer vocabulary. Schema.org and PROV-O are used wherever they fit; bq: terms exist only where construction relationships have no standard equivalent.',
      terms: TERMS,
    },
    { headers: { 'Content-Type': 'application/ld+json', 'Cache-Control': 'public, max-age=3600' } },
  )
}
