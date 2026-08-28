import { notFound, redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { StudioShell } from '@/components/studio/StudioShell'
import { WORKSPACE_REDESIGN_ENABLED } from '@/lib/workspaceRedesignFlag'
import { CmsEditor } from './CmsEditor'

export const dynamic = 'force-dynamic'

export default async function CmsEditorPage({
  params,
}: {
  params: { systemId: string }
}) {
  // The System Workspace is the real editor now — see workspaceRedesignFlag.ts.
  // No stale link or bookmark should ever land a manufacturer on the old
  // CmsEditor while the flag is on; CmsEditor itself stays in the codebase,
  // just unreachable, until it's deleted for real (design doc §14 step 10).
  if (WORKSPACE_REDESIGN_ENABLED) {
    redirect(`/manufacturer/workspace/${params.systemId}`)
  }

  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Asset picker">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const [result, assetsResult, linkLibraryResult] = await Promise.all([
    getManufacturerVerificationData(ctx.manufacturerId),
    getManufacturerAssets(ctx.manufacturerId),
    getManufacturerLinkLibrary(ctx.manufacturerId),
  ])
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Asset picker">
        <div className="studio-warn">Could not load card: {result.error}</div>
      </StudioShell>
    )
  }

  const system = result.systems.find((s) => s.id === params.systemId)
  if (!system) notFound()

  const assets = assetsResult.ok ? assetsResult.assets : []
  const linkLibrary = linkLibraryResult.ok ? linkLibraryResult.links : []

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Edit card`}>
      <CmsEditor
        manufacturerId={ctx.manufacturerId}
        manufacturer={result.manufacturer}
        initialSystem={system}
        assets={assets}
        linkLibrary={linkLibrary}
      />
    </StudioShell>
  )
}
