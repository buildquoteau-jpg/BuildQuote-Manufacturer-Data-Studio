import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import { getManufacturerAssets } from '@/lib/studio-manufacturer/assets'
import { getManufacturerLinkLibrary } from '@/lib/studio-manufacturer/link-library'
import { StudioShell } from '@/components/studio/StudioShell'
import { AssetsClient, type AssetView } from './AssetsClient'
import { LinkLibraryManager } from './LinkLibraryManager'

// Assets = the public visual files that ship inside the static System Card
// website package (logos, heroes, banners, product shots). Distinct from
// Documents, which are private source/reference files.

export default async function ManufacturerAssetsPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Assets">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Assets</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const [assetsResult, mfrResult, linkLibraryResult] = await Promise.all([
    getManufacturerAssets(ctx.manufacturerId),
    getManufacturerInfo(ctx.manufacturerId),
    getManufacturerLinkLibrary(ctx.manufacturerId),
  ])
  const linkLibrary = linkLibraryResult.ok ? linkLibraryResult.links : []
  const workspaceName = mfrResult.ok ? mfrResult.manufacturer.name : undefined

  const assets: AssetView[] = assetsResult.ok
    ? assetsResult.assets.map((a) => ({
        id: a.id,
        assetType: a.assetType,
        title: a.title,
        altText: a.altText,
        caption: a.caption,
        sourceUrl: a.sourceUrl,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        width: a.width,
        height: a.height,
        focalX: a.focalX,
        focalY: a.focalY,
        approvedForPublication: a.approvedForPublication,
        archived: a.archived,
        createdAt: a.createdAt,
        displayUrl: a.displayUrl,
        usedBy: a.usedBy,
      }))
    : []

  return (
    <StudioShell role="manufacturer" workspaceName={workspaceName} subtitle="Assets">
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Assets</h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-muted)', marginBottom: '1.5rem', maxWidth: 720 }}>
        Public images used in your System Cards and website package: logo, hero images, banners,
        product shots. Source documents (catalogues, data sheets, install guides) stay in{' '}
        <a href="/manufacturer/documents" style={{ color: 'var(--ds-teal)' }}>Documents</a>.
        When a package is generated, these assets are copied into it as local files — cards never
        rely on external image URLs.
      </p>

      {assetsResult.ok === false && (
        <div className={assetsResult.migrationMissing ? 'studio-info' : 'studio-warn'} style={{ marginBottom: '1rem' }}>
          {assetsResult.error}
        </div>
      )}

      <AssetsClient manufacturerId={ctx.manufacturerId} assets={assets} />

      {linkLibraryResult.ok ? (
        <LinkLibraryManager manufacturerId={ctx.manufacturerId} initialLinks={linkLibrary} />
      ) : (
        <div className={linkLibraryResult.migrationMissing ? 'studio-info' : 'studio-warn'} style={{ marginTop: '2.5rem' }}>
          {linkLibraryResult.migrationMissing
            ? "The link library isn't set up yet — ask BuildQuote admin to apply migration 056."
            : linkLibraryResult.error}
        </div>
      )}
    </StudioShell>
  )
}
