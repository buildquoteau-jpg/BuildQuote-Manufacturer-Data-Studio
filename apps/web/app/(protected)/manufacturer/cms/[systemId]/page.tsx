import { notFound } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { StudioShell } from '@/components/studio/StudioShell'
import { CmsEditor } from './CmsEditor'

export const dynamic = 'force-dynamic'

export default async function CmsEditorPage({
  params,
}: {
  params: { systemId: string }
}) {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="System Cards">
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
      <StudioShell role="manufacturer" subtitle="System Cards">
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
