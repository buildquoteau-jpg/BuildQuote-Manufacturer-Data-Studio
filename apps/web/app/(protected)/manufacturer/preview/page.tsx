// Studio-only internal preview — not a public customer-facing route.
// Renders each staged system through the master System Card renderer
// (components/system-card-renderer), so what the manufacturer approves here
// is exactly what the public System Card will look like.
//
// Shopping list + PNG share run client-side only in the wrapper; nothing on
// this page writes to Supabase.

import { getStudioSession } from '@/lib/studio-auth/session'
import {
  resolveWorkspaceContextFromRequest,
  getManufacturerVerificationData,
  getManufacturerInfo,
} from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { StudioStatusBadge } from '@/components/studio/StudioStatusBadge'
import { adaptStagedSystem } from '@/components/system-card-renderer/adaptStagedSystem'
import { SystemCardPreviewWrapper } from '@/components/system-card-renderer/SystemCardPreviewWrapper'
import type { SystemCardManufacturerPage } from '@/components/system-card-renderer/types'

export default async function ManufacturerPreviewPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Preview">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Preview public System Cards</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access. Select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)

  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Preview">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Preview public System Cards</h1>
        <div className="studio-warn">Could not load preview data: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result
  const cardSystems = systems.map((sys) => adaptStagedSystem(sys, manufacturer))

  // Hero image lives on data_studio_manufacturers but isn't part of the
  // verification payload — fetch it so the landing-page hero matches v6.
  const infoResult = await getManufacturerInfo(ctx.manufacturerId)
  const manufacturerPage: SystemCardManufacturerPage = {
    name: manufacturer.name,
    slug: manufacturer.slug,
    description: manufacturer.description,
    website_url: manufacturer.websiteUrl,
    logo_url: null,
    hero_image_url: infoResult.ok ? infoResult.manufacturer.heroImageUrl : null,
  }

  return (
    <StudioShell role="manufacturer" subtitle="Preview">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem' }}>Preview public System Cards</h1>
        <span className="studio-badge studio-badge-draft">Studio only</span>
      </div>

      <div className="studio-info" style={{ marginBottom: '0.75rem' }}>
        This is exactly what the public will see once published — your manufacturer page, and each
        System Card with selectable line items, shopping list and share behaviour. Click a system
        tile to open its card. Nothing here is live, and interactions in this preview are not saved.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <StudioStatusBadge
          current="draft"
          note="— BuildQuote approval and package generation require BuildQuote admin action."
        />
      </div>

      <div className="studio-preview-frame">
        <div className="studio-preview-bar">
          <span>🔍 Studio preview — not live</span>
          <span style={{ marginLeft: 'auto' }}>
            {manufacturer.status} · Preview only
          </span>
        </div>

        <SystemCardPreviewWrapper manufacturer={manufacturerPage} systems={cardSystems} />
      </div>

      <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--ds-text-faint)' }}>
        Cards must be manufacturer verified and BuildQuote approved before they can be included
        in your System Card website package. Package generation is not available from this screen.
      </div>
    </StudioShell>
  )
}
