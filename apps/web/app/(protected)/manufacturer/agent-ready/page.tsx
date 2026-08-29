import Link from 'next/link'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest, getManufacturerVerificationData } from '@/lib/studio-manufacturer/workspace'
import { createStudioServerClient } from '@/lib/supabase/server'
import { StudioShell } from '@/components/studio/StudioShell'

// Agent Ready — replaces the "See what the AI knows" callout that used to
// live on Start Here. One list, one status per system: has a human signed
// off that the machine-readable knowledge object (the JSON-LD blob shown on
// the detail page) is accurate for an AI agent to read and cite. Distinct
// from "Verify systems", which signs off the human-facing card fields.

export const dynamic = 'force-dynamic'

export default async function AgentReadyListPage() {
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
        <div className="studio-warn">Could not load systems: {result.error}</div>
      </StudioShell>
    )
  }

  // Isolated, separately-caught query (not part of getManufacturerVerificationData's
  // shared select) so a pre-068 environment degrades to "everything needs
  // review" rather than breaking this page.
  const signOffs = new Map<string, string>()
  try {
    const supabase = createStudioServerClient()
    const { data } = await supabase
      .from('staged_systems')
      .select('id, agent_ready_verified_at')
      .eq('manufacturer_id', ctx.manufacturerId)
      .not('agent_ready_verified_at', 'is', null)
    for (const row of (data ?? []) as { id: string; agent_ready_verified_at: string }[]) {
      signOffs.set(row.id, row.agent_ready_verified_at)
    }
  } catch {
    // pre-068 environment — no sign-off column yet
  }

  const systems = result.systems

  return (
    <StudioShell role="manufacturer" subtitle={`${result.manufacturer.name} · Agent Ready`}>
      <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.4rem' }}>Agent Ready</h1>
      <p style={{ fontSize: '0.875rem', color: 'var(--ds-text-muted)', margin: '0 0 1.25rem', lineHeight: 1.65, maxWidth: 680 }}>
        The machine-readable knowledge object behind each System Card — the same facts an AI agent
        reads to answer a builder&apos;s question. Open a system to see it as JSON-LD and as markdown,
        make any changes needed, and sign off that it&apos;s accurate.
      </p>

      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 160px 100px', gap: '0.6rem',
          padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--ds-border)',
          background: 'var(--ds-surface, rgba(255,255,255,0.03))',
          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          color: 'var(--ds-text-faint)',
        }}>
          <div>System name</div>
          <div>Agent Ready status</div>
          <div />
        </div>

        {systems.length === 0 && (
          <div style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--ds-text-muted)' }}>
            No systems yet — add one on the Systems tab first.
          </div>
        )}

        {systems.map((s) => {
          const signedOff = signOffs.has(s.id)
          return (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: 'minmax(160px, 2fr) 160px 100px', gap: '0.6rem',
              alignItems: 'center', padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--ds-border)',
            }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{s.name}</div>
              <div>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 700, color: signedOff ? '#16a34a' : '#94a3b8',
                  background: signedOff ? 'rgba(22,163,74,0.12)' : 'rgba(148,163,184,0.14)',
                  borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
                }}>
                  {signedOff ? 'Signed off' : 'Needs review'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Link href={`/manufacturer/agent-ready/${s.id}`} style={{ fontSize: '0.78rem', fontWeight: 700, color: '#185D7A', textDecoration: 'none' }}>
                  Open →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </StudioShell>
  )
}
