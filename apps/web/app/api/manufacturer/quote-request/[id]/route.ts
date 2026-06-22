import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { resolveWorkspaceContextFromRequest } from '@/lib/studio-manufacturer/workspace'
import { createStudioServiceClient } from '@/lib/supabase/service'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getStudioSession()
  if (!session.profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await resolveWorkspaceContextFromRequest(session)
  if (!ctx.found) return NextResponse.json({ error: 'No workspace' }, { status: 403 })

  const studio = createStudioServiceClient()
  const { error } = await studio
    .from('widget_quote_requests')
    .delete()
    .eq('id', params.id)
    .eq('manufacturer_id', ctx.manufacturerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
