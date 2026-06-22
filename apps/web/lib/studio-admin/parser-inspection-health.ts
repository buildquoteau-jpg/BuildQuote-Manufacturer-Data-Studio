// Read-only health check helpers for the admin parser inspection view.
// Pure functions — no I/O, no DB access, no writes.
//
// Produces a list of HealthWarning items from staged parser data.
// Warnings are advisory only — they surface things worth manually reviewing.

import type {
  ParserStagedSystem,
  ParserStagedProfile,
  ParserStagedComponent,
  ParserStagedColour,
  ParserStagedLink,
  ParserInspectionCounts,
} from './parser-inspection'

// ============================================================
// Types
// ============================================================

export type HealthSeverity = 'error' | 'warn' | 'info'

export type HealthWarning = {
  severity: HealthSeverity
  code: string
  message: string
}

// ============================================================
// Keyword sets (mirrors dry-run-report.ts heuristics)
// ============================================================

// Things that are always components, never profiles.
const COMPONENT_KEYWORDS = [
  'fascia board', 'edge board', 'corner trim', 'end cap', 'end trim',
  'starter clip', 'hidden clip', 'hidden fix', 'fixing clip', 'joist clip',
  'decking screw', 'screw', 'bolt', 'bracket', 'anchor', 'joiner',
  'adhesive', 'sealant', 'foam tape', 'gasket',
  'flashing', 'cover strip', 'cover plate', 'joiner strip',
  'gutter', 'downpipe',
]

// Things that are clearly profiles/sizes, not standalone components.
const PROFILE_KEYWORDS = [
  'x 25mm', 'x 29mm', 'x 15mm', 'x 23mm', '×', 'length 5.4', 'length 4.88',
  '5400mm', '2900mm', '4880mm',
]

function nameLower(name: string): string {
  return name.toLowerCase()
}

function looksLikeComponent(name: string): boolean {
  const n = nameLower(name)
  return COMPONENT_KEYWORDS.some((kw) => n.includes(kw))
}

function looksLikeProfile(name: string): boolean {
  const n = nameLower(name)
  return PROFILE_KEYWORDS.some((kw) => n.includes(kw))
}

// ============================================================
// Health checks
// ============================================================

export function computeHealthWarnings(args: {
  systems: ParserStagedSystem[]
  profiles: ParserStagedProfile[]
  components: ParserStagedComponent[]
  colours: ParserStagedColour[]
  links: ParserStagedLink[]
  counts: ParserInspectionCounts
  orphanLinkCount: number
  entitiesWithEvidence: number
  entitiesTotal: number
}): HealthWarning[] {
  const { systems, profiles, components, colours, links, counts, orphanLinkCount, entitiesWithEvidence, entitiesTotal } = args
  const warnings: HealthWarning[] = []

  // ── Empty state ───────────────────────────────────────────────────────────
  if (counts.stagedSystems === 0 && counts.stagedComponents === 0) {
    warnings.push({
      severity: 'info',
      code: 'NO_STAGED_DATA',
      message: 'No staged systems or components found for this document. Run parser:insert-local first.',
    })
    return warnings // nothing more to check
  }

  // ── Orphan links ──────────────────────────────────────────────────────────
  if (orphanLinkCount > 0) {
    warnings.push({
      severity: 'error',
      code: 'ORPHAN_LINKS',
      message: `${orphanLinkCount} system–component link${orphanLinkCount !== 1 ? 's' : ''} reference a staged_component not found in this document's scope.`,
    })
  }

  // ── Duplicate product codes ───────────────────────────────────────────────
  const sysProductCodes = systems.map((s) => s.productCode).filter(Boolean) as string[]
  const sysCodeSet = new Set<string>()
  const dupeCodes = new Set<string>()
  for (const c of sysProductCodes) {
    if (sysCodeSet.has(c)) dupeCodes.add(c)
    sysCodeSet.add(c)
  }
  if (dupeCodes.size > 0) {
    warnings.push({
      severity: 'warn',
      code: 'DUPLICATE_PRODUCT_CODES',
      message: `Duplicate product_code value${dupeCodes.size !== 1 ? 's' : ''} across staged_systems: ${Array.from(dupeCodes).slice(0, 5).join(', ')}`,
    })
  }

  // ── Duplicate SKUs ────────────────────────────────────────────────────────
  const compSkus = components.map((c) => c.sku).filter(Boolean) as string[]
  const skuSet = new Set<string>()
  const dupeSkus = new Set<string>()
  for (const s of compSkus) {
    if (skuSet.has(s)) dupeSkus.add(s)
    skuSet.add(s)
  }
  if (dupeSkus.size > 0) {
    warnings.push({
      severity: 'warn',
      code: 'DUPLICATE_SKUS',
      message: `Duplicate SKU value${dupeSkus.size !== 1 ? 's' : ''} across staged_components: ${Array.from(dupeSkus).slice(0, 5).join(', ')}`,
    })
  }

  // ── Component classified as profile ───────────────────────────────────────
  const profilesLookingLikeComponents = profiles.filter((p) =>
    looksLikeComponent(p.profileName ?? p.name ?? ''),
  )
  if (profilesLookingLikeComponents.length > 0) {
    warnings.push({
      severity: 'warn',
      code: 'PROFILE_LOOKS_LIKE_COMPONENT',
      message: `${profilesLookingLikeComponents.length} staged_system_profile${profilesLookingLikeComponents.length !== 1 ? 's' : ''} ${profilesLookingLikeComponents.length !== 1 ? 'have names that' : 'has a name that'} look like a component (clip, screw, trim, etc.): ${profilesLookingLikeComponents.map((p) => p.profileName ?? p.name ?? '?').slice(0, 3).join(', ')}`,
    })
  }

  // ── Profile classified as component ───────────────────────────────────────
  const componentsLookingLikeProfiles = components.filter((c) =>
    looksLikeProfile(c.name),
  )
  if (componentsLookingLikeProfiles.length > 0) {
    warnings.push({
      severity: 'warn',
      code: 'COMPONENT_LOOKS_LIKE_PROFILE',
      message: `${componentsLookingLikeProfiles.length} staged_component${componentsLookingLikeProfiles.length !== 1 ? 's' : ''} ${componentsLookingLikeProfiles.length !== 1 ? 'have names that' : 'has a name that'} look like a profile size variant: ${componentsLookingLikeProfiles.map((c) => c.name).slice(0, 3).join(', ')}`,
    })
  }

  // ── Systems with no profiles ──────────────────────────────────────────────
  const systemsWithNoProfiles = systems.filter((s) => s.profileCount === 0)
  if (systemsWithNoProfiles.length > 0 && systems.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'SYSTEMS_WITHOUT_PROFILES',
      message: `${systemsWithNoProfiles.length} of ${systems.length} system${systems.length !== 1 ? 's' : ''} ${systemsWithNoProfiles.length !== 1 ? 'have' : 'has'} no profiles. Confirm this is expected.`,
    })
  }

  // ── Systems with no colours ───────────────────────────────────────────────
  const systemsWithNoColours = systems.filter((s) => s.colourCount === 0)
  if (systemsWithNoColours.length > 0 && systems.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'SYSTEMS_WITHOUT_COLOURS',
      message: `${systemsWithNoColours.length} of ${systems.length} system${systems.length !== 1 ? 's' : ''} ${systemsWithNoColours.length !== 1 ? 'have' : 'has'} no colour variants. Confirm this is expected.`,
    })
  }

  // ── Components with no UOM ────────────────────────────────────────────────
  const componentsNoUom = components.filter((c) => !c.uom)
  if (componentsNoUom.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'COMPONENTS_MISSING_UOM',
      message: `${componentsNoUom.length} staged_component${componentsNoUom.length !== 1 ? 's' : ''} ${componentsNoUom.length !== 1 ? 'are' : 'is'} missing a unit of measure (uom).`,
    })
  }

  // ── Profiles with no dimensions ───────────────────────────────────────────
  const profilesNoDims = profiles.filter((p) =>
    p.lengthMm === null && p.widthMm === null && p.thicknessMm === null &&
    p.heightMm === null && p.depthMm === null && p.diameterMm === null && p.rollM === null,
  )
  if (profilesNoDims.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'PROFILES_MISSING_DIMENSIONS',
      message: `${profilesNoDims.length} staged_system_profile${profilesNoDims.length !== 1 ? 's' : ''} ${profilesNoDims.length !== 1 ? 'have' : 'has'} no dimension values (length, width, thickness, etc.).`,
    })
  }

  // ── Evidence coverage ─────────────────────────────────────────────────────
  if (entitiesTotal > 0 && entitiesWithEvidence === 0) {
    warnings.push({
      severity: 'warn',
      code: 'NO_EVIDENCE_COVERAGE',
      message: 'No parser_field_evidence rows found for this extraction run. Evidence insertion may have failed.',
    })
  } else if (entitiesTotal > 0 && entitiesWithEvidence < entitiesTotal) {
    const missing = entitiesTotal - entitiesWithEvidence
    warnings.push({
      severity: 'info',
      code: 'PARTIAL_EVIDENCE_COVERAGE',
      message: `${missing} of ${entitiesTotal} entities (systems + components) have no parser field evidence. They may have no extractable fields, or evidence was not written.`,
    })
  }

  // ── Unlinked components ───────────────────────────────────────────────────
  const linkedComponentIds = new Set(links.map((l) => l.stagedComponentId))
  const unlinkedComponents = components.filter((c) => !linkedComponentIds.has(c.id))
  if (unlinkedComponents.length > 0 && systems.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'UNLINKED_COMPONENTS',
      message: `${unlinkedComponents.length} staged_component${unlinkedComponents.length !== 1 ? 's' : ''} ${unlinkedComponents.length !== 1 ? 'are' : 'is'} not linked to any system. Confirm this is expected for standalone accessories.`,
    })
  }

  // ── Colour with no SKU suffix ─────────────────────────────────────────────
  const coloursNoSku = colours.filter((c) => !c.sku && !c.skuSuffix)
  if (coloursNoSku.length > 0) {
    warnings.push({
      severity: 'info',
      code: 'COLOURS_MISSING_SKU',
      message: `${coloursNoSku.length} colour${coloursNoSku.length !== 1 ? 's' : ''} ${coloursNoSku.length !== 1 ? 'have' : 'has'} no sku or sku_suffix. Confirm this is expected.`,
    })
  }

  return warnings
}
