// Shared shape between the (server) page loader and the (client) workspace
// components — a serializable view of one fact, independent of whether it's
// still generator-derived (pre-migration/pre-backfill) or a real
// knowledge_assertions row. Pure types only — no imports with server-only code.

import type { AssertionOrigin, ClaimType, EpistemicStatus } from '@/lib/knowledge/vocabulary'
import type { WorkspaceUiSection } from '@/lib/knowledge/buildSystemKnowledge'

export type FactViewModel = {
  predicate: string
  claimType: ClaimType
  uiSection: WorkspaceUiSection
  label: string
  value: string
  rawValue: unknown
  origin: AssertionOrigin
  epistemicStatus: EpistemicStatus
  sourceLine: string | null
  // Raw evidence-page identity, kept alongside the formatted sourceLine so
  // facts can be grouped by "same document, same page" without re-parsing a
  // display string (design doc §9.2 workload-killer #1 — evidence-group
  // bulk verification).
  sourceDocumentId: string | null
  sourcePageNumber: number | null
}
