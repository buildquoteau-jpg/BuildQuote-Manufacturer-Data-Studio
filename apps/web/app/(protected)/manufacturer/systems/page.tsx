import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'
import { SystemsTable, type SystemRow } from './SystemsTable'

// The Systems list (design doc addendum 3 §C5) — replaces /manufacturer/cms
// as the "Systems" nav destination. Spreadsheet-style: name (inline-
// editable), a live count of photos and linked documents, and a plain-
// English setup status, so a manufacturer can see at a glance which of
// their systems still need attention and click straight into the one that
// does. Row click goes to the guided setup flow (/manufacturer/systems/
// [id]/setup), not the Verify-systems workspace — this list is about
// getting a system's assets and documents in, not correcting extracted
// facts.

export const dynamic = 'force-dynamic'

function setupStatus(s: {
  photosCount: number
  linksCount: number
  documentsCount: number
  hasStructuredData: boolean
}): SystemRow['setupStatus'] {
  if (s.photosCount === 0 && s.linksCount === 0 && s.documentsCount === 0) return 'not_started'
  if (s.hasStructuredData) return 'ready_to_verify'
  return 'in_progress'
}

export default async function SystemsListPage() {
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Systems</h1>
        <div className="studio-info">
          {ctx.reason === 'admin_no_context'
            ? 'Admin support access — select a manufacturer workspace from the admin panel first.'
            : 'No manufacturer workspace assigned. Contact BuildQuote admin.'}
        </div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Systems">
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Systems</h1>
        <div className="studio-warn">Could not load systems: {result.error}</div>
      </StudioShell>
    )
  }

  const { manufacturer, systems } = result

  // Documents-linked-per-system count (system_sources, migration 051).
  // Degrades to an empty map — every row just shows 0 documents — rather
  // than breaking the page, same convention as every other pre-051 guard.
  const documentCounts = new Map<string, number>()
  try {
    const supabase = createStudioServerClient()
    const { data, error } = await supabase
      .from('system_sources')
      .select('staged_system_id')
      .eq('manufacturer_id', ctx.manufacturerId)
    if (!error) {
      for (const row of (data ?? []) as { staged_system_id: string | null }[]) {
        if (!row.staged_system_id) continue
        documentCounts.set(row.staged_system_id, (documentCounts.get(row.staged_system_id) ?? 0) + 1)
      }
    }
  } catch {
    /* system_sources not available yet — every row shows 0 documents */
  }

  const rows: SystemRow[] = systems.map((s) => {
    const photosCount = s.gallery_images?.length ?? 0
    const linksCount = s.custom_document_links?.length ?? 0
    const documentsCount = documentCounts.get(s.id) ?? 0
    const hasStructuredData =
      s.profiles.length > 0 || s.colours.length > 0 || s.components.length > 0 ||
      (s.custom_technical_attributes?.length ?? 0) > 0
    return {
      id: s.id,
      name: s.name,
      photosCount,
      linksCount,
      documentsCount,
      setupStatus: setupStatus({ photosCount, linksCount, documentsCount, hasStructuredData }),
    }
  })

  return (
    <StudioShell role="manufacturer" subtitle={`${manufacturer.name} · Systems`}>
      <div style={{ marginBottom: '0.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Systems</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0.5rem 0 0', lineHeight: 1.65, maxWidth: 640 }}>
          List every building product you want turned into a System Card. Add
          a system, then click into it to upload photos, links and source
          documents — one system at a time, so the setup for each one stays
          quick and focused.
        </p>
      </div>

      <SystemsTable manufacturerId={ctx.manufacturerId} initialRows={rows} />
    </StudioShell>
  )
}
