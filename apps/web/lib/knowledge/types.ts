// TypeScript shape of the generated AI knowledge object. Mirrors the JSON-LD
// examples in the design doc, but is intentionally looser than a strict
// JSON-LD typing library — this is an internal authoring type, not a schema
// validator. buildSystemKnowledge.ts is the only place that constructs these.

import type {
  AnswerPolicy,
  AssertionOrigin,
  ClaimType,
  EpistemicStatus,
  TrustLevel,
} from './vocabulary'

export type QuantitativeValue = {
  '@type': 'QuantitativeValue'
  value?: number
  minValue?: number
  maxValue?: number
  unitCode?: string
  unitText?: string
  description?: string
}

export type Assertion = {
  '@id': string
  '@type': ['bq:Assertion', 'prov:Entity']
  'bq:subject'?: { '@id': string }
  'bq:predicate': string
  'bq:objectValue'?: unknown
  'bq:origin': AssertionOrigin
  'bq:epistemicStatus': EpistemicStatus
  'bq:trustLevel': TrustLevel
  'bq:confidence'?: number
  'bq:assertedBy'?: Record<string, unknown>
  'bq:assertedAt'?: string
  'bq:verifiedBy'?: { '@id'?: string; name?: string }
  'bq:verifiedAt'?: string
  'bq:supersedes'?: { '@id': string }
  'bq:correctionNote'?: string
  'bq:evidence'?: EvidenceReference[]
}

export type EvidenceReference = {
  '@type': 'bq:EvidenceReference'
  'bq:document'?: { '@id': string }
  'bq:sourceKind'?: 'document' | 'web_page' | 'manufacturer_statement' | 'derivation'
  'bq:pageStart'?: number | null
  'bq:pageEnd'?: number | null
  'bq:locator'?: string
  'bq:quote'?: string
  'bq:chunkId'?: string
}

export type SourceDocumentNode = {
  '@id': string
  '@type': ['bq:SourceDocument', 'DigitalDocument']
  name: string
  'bq:documentRole': string
  url?: string
  'bq:ingestStatus'?: string
  'bq:includedInContainer'?: boolean
}

export type KnowledgeGap = {
  '@type': 'bq:KnowledgeGap'
  '@id'?: string
  'bq:about': string
  'bq:status': 'unknown' | 'not_applicable' | 'disputed'
  'bq:reason': string
  'bq:resolution'?: string
}

export type SourceSummary = {
  documentName: string
  revision?: string | null
  page?: number | null
  section?: string | null
  verifiedBy?: string | null
  verifiedAt?: string | null
}

export type AtomicAssertion = {
  '@id': string
  '@type': 'bq:AtomicAssertion'
  'bq:system': { '@id': string }
  'bq:manufacturer': { '@id': string }
  'bq:subject': string
  'bq:claim': string
  'bq:claimType': ClaimType
  'bq:value'?: unknown
  'bq:appliesTo'?: Record<string, string>
  'bq:conditions'?: string[]
  'bq:reason'?: string
  'bq:epistemicStatus': EpistemicStatus
  'bq:trustLevel': TrustLevel
  'bq:answerPolicy': AnswerPolicy
  'bq:sourceSummary'?: SourceSummary
  'bq:requiredResolution'?: string
  'bq:retrievalText': string
  'bq:canonicalAssertion'?: { '@id': string }
  'bq:queryTerms'?: { concept: string; synonyms: string[] }[]
}

export type RetrievalDocument = {
  '@id': string
  'bq:type': string
  'bq:title': string
  'bq:text': string
}

export type KnowledgeSection = {
  'bq:knowledgeVersion': string
  'bq:retrievalEnabled': true
  'bq:atomicAssertions': AtomicAssertion[]
  'bq:retrievalDocuments': RetrievalDocument[]
  'bq:queryTerms': { concept: string; synonyms: string[] }[]
}

export type KnowledgeObject = Record<string, unknown> & {
  '@context': unknown
  '@id': string
  '@type': string[]
  'bq:format': string
  'bq:formatVersion': string
  'bq:generatedAt': string
  'bq:canonicalUrl': string
  'bq:knowledge': KnowledgeSection
  'bq:assertions': Assertion[]
  'bq:knowledgeGaps': KnowledgeGap[]
  'bq:coverage': Record<string, string>
  'bq:dataLicence': {
    status: string
    permissions: Record<string, boolean>
  }
}
