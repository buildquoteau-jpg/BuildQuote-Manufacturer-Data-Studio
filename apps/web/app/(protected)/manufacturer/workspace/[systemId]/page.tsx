import { notFound, redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import { StudioShell } from '@/components/studio/StudioShell'
import { SystemWorkspaceShell } from '@/components/workspace/SystemWorkspaceShell'
import { WORKSPACE_REDESIGN_ENABLED } from '@/lib/workspaceRedesignFlag'
import { fetchCanonicalSystemBundleById } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import {
  buildFromCanonical,
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

  // AI-facing facts + full JSON-LD object — same generator as the public
  // /api/cards/[slug]/knowledge.jsonld route, fetched by system ID so even
  // freshly staged systems without a slug yet load all extracted facts,
  // attributes, knowledge assertions, and their live JSON-LD blob.
  let allFacts: FactViewModel[] = []
  let applicationFacts: FactViewModel[] = []
  let coverage: Record<string, string> = NOT_YET_EXTRACTED_COVERAGE
  let knowledgeJsonLd: Record<string, unknown> | null = null
  let effectiveSlug = system.slug || previewSystem.slug

  const bundle = await fetchCanonicalSystemBundleById(system.id)
  if (bundle) {
    effectiveSlug = bundle.system.slug || effectiveSlug
    knowledgeJsonLd = buildFromCanonical(bundle) as unknown as Record<string, unknown>
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

    applicationFacts = buildApplicationFacts(bundle).map((f) => ({
      assertionId: f.assertionId,
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
      quote: f.quote,
      conditions: f.conditions,
      isCompanyLevel: f.isCompanyLevel,
    } satisfies FactViewModel))
    allFacts = [...allFacts, ...applicationFacts]
    coverage = buildCoverage(atomicAssertions, buildRelationships(bundle))

    // Surface relationships & negative constraints on the live preview card too
    const previewRels = bundle.systemRelationships
      .map((r) => {
        const targetName = r.target_staged_system_id
          ? bundle.relationshipTargets.get(r.target_staged_system_id)?.name ?? null
          : r.target_external?.name ?? null
        if (!targetName) return null
        return {
          relation: r.relation as NonNullable<typeof previewSystem.system_relationships>[number]['relation'],
          target_name: targetName,
          target_kind: r.target_staged_system_id
            ? ('internal' as const)
            : r.target_external?.kind === 'generic_class'
              ? ('generic_class' as const)
              : ('product' as const),
          reason: r.reason ?? null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    if (previewRels.length > 0) previewSystem.system_relationships = previewRels

    const hiddenStatuses = new Set(['disputed', 'not_applicable', 'superseded'])
    const previewConstraints = applicationFacts
      .filter((f) => {
        if (hiddenStatuses.has(f.epistemicStatus)) return false
        const p = f.predicate.toLowerCase()
        return (
          p.includes('notsuitable') ||
          p.includes('limitation') ||
          f.claimType === 'limitation' ||
          f.claimType === 'environmental_constraint'
        )
      })
      .map((f) => {
        const p = f.predicate.toLowerCase()
        const kind = p.includes('notsuitable')
          ? ('not_suitable_for' as const)
          : f.claimType === 'environmental_constraint'
            ? ('environmental' as const)
            : ('limitation' as const)
        return {
          kind,
          label: f.label,
          value: f.value,
          condition: f.conditions?.[0] ?? null,
          source: f.sourceLine ?? null,
        }
      })
    if (previewConstraints.length > 0) previewSystem.negative_constraints = previewConstraints
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
        previewSystem={{ ...previewSystem, slug: effectiveSlug }}
        identityFacts={identityFacts}
        attributeFacts={attributeFacts}
        applicationFacts={applicationFacts}
        allFacts={allFacts}
        coverage={coverage}
        knowledgeJsonLd={knowledgeJsonLd}
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
