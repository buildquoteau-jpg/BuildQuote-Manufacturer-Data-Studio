import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { fetchCanonicalSystemBundle } from '@/lib/knowledge/fetchCanonicalKnowledgeData'
import { buildFromCanonical } from '@/lib/knowledge/buildSystemKnowledge'
import { renderKnowledgeMarkdown } from '@/lib/knowledge/renderKnowledgeMarkdown'
import { StudioShell } from '@/components/studio/StudioShell'
import { AgentReadyClient } from './AgentReadyClient'

// Agent Ready detail — the actual JSON-LD knowledge object (top half, as a
// collapsible "layered reveal" tree) and the same object rendered as
// markdown (bottom half), per the user's exact spec. A human verifies or
// makes changes (via the same Verify-systems Workspace this reads from —
// this page views and signs off, it doesn't duplicate the editing surface)
// and signs off that it's accurate.

export const dynamic = 'force-dynamic'

export default async function AgentReadyDetailPage({
  params,
}: {
  params: Promise<{ systemId: string }>
}) {
  const { systemId } = await params
  const session = await getStudioSession()
  const ctx = await resolveWorkspaceContextFromRequest(session)

  if (!ctx.found) {
    return (
      <StudioShell role="manufacturer" subtitle="Agent Ready">
        <div className="studio-info">No manufacturer workspace assigned. Contact BuildQuote admin.</div>
      </StudioShell>
    )
  }

  const result = await getManufacturerVerificationData(ctx.manufacturerId)
  if (!result.ok) {
    return (
      <StudioShell role="manufacturer" subtitle="Agent Ready">
        <div className="studio-warn">Could not load system: {result.error}</div>
      </StudioShell>
    )
  }

  const system = result.systems.find((s) => s.id === systemId)
  if (!system) notFound()

  if (!system.slug) {
    return (
      <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Agent Ready`}>
        <BackLink />
        <div className="studio-info">
          {system.name} doesn&apos;t have a slug yet — it needs to go through Verify systems at
          least once before its knowledge object can be generated.
        </div>
      </StudioShell>
    )
  }

  const bundle = await fetchCanonicalSystemBundle(result.manufacturer.slug, system.slug)
  if (!bundle) {
    return (
      <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Agent Ready`}>
        <BackLink />
        <div className="studio-warn">Could not assemble the knowledge object for {system.name} yet.</div>
      </StudioShell>
    )
  }

  const knowledgeObject = buildFromCanonical(bundle)
  const markdown = renderKnowledgeMarkdown(knowledgeObject)

  let signedOffAt: string | null = null
  let signedOffNotes: string | null = null
  try {
    const supabase = createStudioServerClient()
    const { data } = await supabase
      .from('staged_systems')
      .select('agent_ready_verified_at, agent_ready_notes')
      .eq('id', systemId)
      .maybeSingle()
    const row = data as { agent_ready_verified_at: string | null; agent_ready_notes: string | null } | null
    signedOffAt = row?.agent_ready_verified_at ?? null
    signedOffNotes = row?.agent_ready_notes ?? null
  } catch {
    // pre-068 environment
  }

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Agent Ready`}>
      <BackLink />
      <AgentReadyClient
        systemId={systemId}
        manufacturerId={ctx.manufacturerId}
        systemName={system.name}
        knowledgeObject={knowledgeObject}
        markdown={markdown}
        signedOffAt={signedOffAt}
        signedOffNotes={signedOffNotes}
      />
    </StudioShell>
  )
}

function BackLink() {
  return (
    <Link href="/manufacturer/agent-ready" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-muted, #6b7280)', textDecoration: 'none', display: 'inline-block', marginBottom: '0.8rem' }}>
      ← All systems
    </Link>
  )
}
