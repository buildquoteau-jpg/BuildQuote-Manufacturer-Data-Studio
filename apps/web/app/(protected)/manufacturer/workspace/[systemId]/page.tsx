import { notFound, redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import { StudioShell } from '@/components/studio/StudioShell'
import { SystemWorkspaceShell } from '@/components/workspace/SystemWorkspaceShell'
import { WORKSPACE_REDESIGN_ENABLED } from '@/lib/workspaceRedesignFlag'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import {
  buildFactsForCanonicalSystem,
  buildApplicationFacts,
  buildCoverage,
  buildRelationships,
  SYSTEM_FIELD_DESCRIPTORS,
  NOT_YET_EXTRACTED_COVERAGE,
} from '@/lib/knowledge/buildSystemKnowledge'
import type { FactViewModel } from '@/components/workspace/factViewModel'
import type { SlotAsset } from '@/app/(protected)/manufacturer/profile/AssetSlotControl'

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

  const assetsResult = await getManufacturerAssets(ctx.manufacturerId)
  const pickerAssets: SlotAsset[] = assetsResult.ok
    ? assetsResult.assets.map((a) => ({
        id: a.id, assetType: a.assetType, title: a.title,
        displayUrl: a.displayUrl, publicUrl: a.publicUrl, approvedForPublication: a.approvedForPublication,
      }))
    : []

  // AI-facing facts — same generator as the public knowledge.jsonld route
  // (lib/knowledge/buildSystemKnowledge.ts), so this view and what an agent
  // actually receives can never disagree. Fails soft: a system with no slug
  // yet, or an environment where the canonical bundle can't be assembled,
  // just shows an empty facts list rather than breaking the page.
  let allFacts: FactViewModel[] = []
  let applicationFacts: FactViewModel[] = []
  let coverage: Record<string, string> = NOT_YET_EXTRACTED_COVERAGE
  if (system.slug) {
    const bundle = await fetchCanonicalSystemBundle(result.manufacturer.slug, system.slug)
    if (bundle) {
      const { compactAssertions, atomicAssertions } = buildFactsForCanonicalSystem(bundle)
      const byPredicate = new Map(compactAssertions.map((a) => [a['bq:predicate'], a]))
      allFacts = SYSTEM_FIELD_DESCRIPTORS
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
            uiSection: d.uiSection,
            label: d.label,
            value: String(assertion['bq:objectValue'] ?? ''),
            rawValue: assertion['bq:objectValue'],
            origin: assertion['bq:origin'],
            epistemicStatus: assertion['bq:epistemicStatus'],
            sourceLine,
            sourceDocumentId: pe?.source_document_id ?? null,
            sourcePageNumber: pe?.source_page_number ?? null,
          } satisfies FactViewModel
        })
        .filter((f): f is FactViewModel => f !== null)

      // knowledge_assertions facts (installation/application/performance +
      // inherited company-wide answers) — the read side the knowledge
      // parser and Company Knowledge panel never had until now.
      applicationFacts = buildApplicationFacts(bundle).map((f) => ({
        predicate: f.predicate,
        claimType: f.claimType,
        uiSection: 'applications',
        label: f.label,
        value: f.value,
        rawValue: f.rawValue,
        origin: f.origin,
        epistemicStatus: f.epistemicStatus,
        sourceLine: f.sourceLine,
        sourceDocumentId: f.sourceDocumentId,
        sourcePageNumber: f.sourcePageNumber,
        isCompanyLevel: f.isCompanyLevel,
      } satisfies FactViewModel))
      allFacts = [...allFacts, ...applicationFacts]
      coverage = buildCoverage(atomicAssertions, buildRelationships(bundle))
    }
  }

  const identityFacts = allFacts.filter((f) => f.uiSection === 'identity')
  const attributeFacts = allFacts.filter((f) => f.uiSection === 'attributes')

  const linkLibraryResult = await getManufacturerLinkLibrary(ctx.manufacturerId)
  const linkLibrary = linkLibraryResult.ok ? linkLibraryResult.links : []

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Product workspace`}>
      <SystemWorkspaceShell
        systemId={system.id}
        systemName={system.name}
        manufacturerId={ctx.manufacturerId}
        manufacturerName={result.manufacturer.name}
        manufacturerSlug={result.manufacturer.slug}
        verificationStatus={system.verification_status}
        previewSystem={previewSystem}
        identityFacts={identityFacts}
        attributeFacts={attributeFacts}
        applicationFacts={applicationFacts}
        allFacts={allFacts}
        coverage={coverage}
        customAttributes={system.custom_technical_attributes ?? []}
        profiles={system.profiles}
        colours={system.colours}
        components={system.components}
        pickerAssets={pickerAssets}
        heroAssetId={system.hero_image_asset_id}
        heroUrl={system.hero_image_url}
        galleryImages={system.gallery_images ?? []}
        ownSystems={result.systems.filter((s) => s.id !== system.id).map((s) => ({ id: s.id, name: s.name }))}
        sourceDocumentId={system.source_document_id}
        customDocumentLinks={system.custom_document_links ?? []}
        linkLibrary={linkLibrary}
      />
    </StudioShell>
  )
}
