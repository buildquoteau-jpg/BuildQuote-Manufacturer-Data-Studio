import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerInfo, getManufacturerDocuments } from '@/lib/studio-manufacturer/workspace'
import { StudioShell } from '@/components/studio/StudioShell'
import { createStudioServerClient } from '@/lib/supabase/server'
import { PipelineClient } from './PipelineClient'

export const dynamic = 'force-dynamic'

async function getPipelineFunnelStats(manufacturerId: string) {
  const supabase = await createStudioServerClient()

  // Get source document IDs for this manufacturer first (chunks join through source_documents)
  const { data: sourceDocs } = await supabase
    .from('source_documents')
    .select('id')
    .eq('manufacturer_id', manufacturerId)

  const sourceDocIds = sourceDocs?.map(d => d.id) ?? []

  const [
    { count: chunkCount },
    { count: systemCount },
    { count: profileCount },
    { count: componentCount },
    { data: systems },
  ] = await Promise.all([
    sourceDocIds.length > 0
      ? supabase.from('document_chunks').select('*', { count: 'exact', head: true }).in('source_document_id', sourceDocIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('staged_systems').select('*', { count: 'exact', head: true }).eq('manufacturer_id', manufacturerId),
    supabase.from('staged_system_profiles').select('staged_systems!inner(manufacturer_id)', { count: 'exact', head: true }).eq('staged_systems.manufacturer_id', manufacturerId),
    supabase.from('staged_components').select('*', { count: 'exact', head: true }).eq('manufacturer_id', manufacturerId),
    supabase.from('staged_systems').select('id,name,verification_status').eq('manufacturer_id', manufacturerId).order('name'),
  ])

  const docCount = sourceDocIds.length

  const verifiedCount = systems?.filter(s => s.verification_status === 'approved').length ?? 0
  const pendingCount = systems?.filter(s => s.verification_status === 'pending_review').length ?? 0

  return {
    documents: docCount ?? 0,
    chunks: chunkCount ?? 0,
    systems: systemCount ?? 0,
    profiles: profileCount ?? 0,
    components: componentCount ?? 0,
    verified: verifiedCount,
    pending: pendingCount,
    systemList: systems ?? [],
  }
}

export default async function PipelinePage() {
  const session = await getStudioSession()

  // Pipeline is admin-only
  if (session.globalRole !== 'buildquote_admin') {
    redirect('/manufacturer/dashboard')
  }

  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Pipeline" showPipelineNav>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Pipeline</h1>
        <div className="studio-info">
          Select a manufacturer workspace from the admin panel first.
        </div>
      </StudioShell>
    )
  }

  const [mfrResult, docsResult, stats] = await Promise.all([
    getManufacturerInfo(ctx.manufacturerId),
    getManufacturerDocuments(ctx.manufacturerId),
    getPipelineFunnelStats(ctx.manufacturerId),
  ])

  const mfrName = mfrResult.ok ? mfrResult.manufacturer.name : 'Manufacturer'
  const mfrSlug = mfrResult.ok ? (mfrResult.manufacturer as any).slug ?? '' : ''
  const documents = docsResult.ok ? docsResult.documents : []

  return (
    <StudioShell role="manufacturer" workspaceName={mfrName} subtitle="Pipeline" showPipelineNav>
      <PipelineClient
        manufacturerId={ctx.manufacturerId}
        manufacturerName={mfrName}
        manufacturerSlug={mfrSlug}
        documents={documents}
        stats={stats}
      />
    </StudioShell>
  )
}
