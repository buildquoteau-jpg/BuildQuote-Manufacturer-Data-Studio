import { notFound, redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import { StudioShell } from '@/components/studio/StudioShell'
import { SystemWorkspaceShell } from '@/components/workspace/SystemWorkspaceShell'
import { WORKSPACE_REDESIGN_ENABLED } from '@/lib/workspaceRedesignFlag'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import {
  buildFactsForCanonicalSystem,
  SYSTEM_FIELD_DESCRIPTORS,
  NOT_YET_EXTRACTED_COVERAGE,
} from '@/lib/knowledge/buildSystemKnowledge'
import type { FactViewModel } from '@/components/workspace/factViewModel'

export const dynamic = 'force-dynamic'

export default async function SystemWorkspacePage({
  params,
}: {
  params: { systemId: string }
}) {
  // Flag off — nothing about the old workspace changes. See
  // lib/workspaceRedesignFlag.ts.
  if (!WORKSPACE_REDESIGN_ENABLED) {
    redirect(`/manufacturer/cms/${params.systemId}`)
  }

  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Product workspace">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Product workspace">
        <div className="studio-warn">Could not load product: {result.error}</div>
      </StudioShell>
    )
  }

  const system = result.systems.find((s) => s.id === params.systemId)
  if (!system) notFound()

  const previewSystem = adaptStagedSystem(system, result.manufacturer)

  // AI-facing facts — same generator as the public knowledge.jsonld route
  // (lib/knowledge/buildSystemKnowledge.ts), so this view and what an agent
  // actually receives can never disagree. Fails soft: a system with no slug
  // yet, or an environment where the canonical bundle can't be assembled,
  // just shows an empty facts list rather than breaking the page.
  let identityFacts: FactViewModel[] = []
  if (system.slug) {
    const bundle = await fetchCanonicalSystemBundle(result.manufacturer.slug, system.slug)
    if (bundle) {
      const { compactAssertions } = buildFactsForCanonicalSystem(bundle)
      const byPredicate = new Map(compactAssertions.map((a) => [a['bq:predicate'], a]))
      identityFacts = SYSTEM_FIELD_DESCRIPTORS
        .map((d) => {
          const assertion = byPredicate.get(d.predicate)
          if (!assertion) return null
          const pe = bundle.parserEvidence.find((p) => p.field_name === d.fieldName)
          const doc = pe?.source_document_id ? bundle.sourceDocuments.get(pe.source_document_id) : undefined
          const sourceLine = doc
            ? `${doc.document_name}${pe?.source_page_number ? `, page ${pe.source_page_number}` : ''}`
            : null
          return {
            predicate: d.predicate,
            claimType: d.claimType,
            label: d.label,
            value: String(assertion['bq:objectValue'] ?? ''),
            rawValue: assertion['bq:objectValue'],
            origin: assertion['bq:origin'],
            epistemicStatus: assertion['bq:epistemicStatus'],
            sourceLine,
          } satisfies FactViewModel
        })
        .filter((f): f is FactViewModel => f !== null)
    }
  }

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Product workspace`}>
      <SystemWorkspaceShell
        systemId={system.id}
        systemName={system.name}
        manufacturerId={ctx.manufacturerId}
        manufacturerSlug={result.manufacturer.slug}
        verificationStatus={system.verification_status}
        previewSystem={previewSystem}
        identityFacts={identityFacts}
        coverage={NOT_YET_EXTRACTED_COVERAGE}
      />
    </StudioShell>
  )
}
