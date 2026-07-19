import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { reportOrphans } from '@/lib/studio-admin/publish'

// GET /api/admin/orphans?manufacturerId=<uuid>
//
// Read-only production-hygiene report: production systems/system_profiles/
// system_colours/components for this manufacturer that no staged row still
// points at via production_*_id. Never deletes anything — see
// apps/web/lib/studio-admin/publish.ts#reportOrphans for the full rationale.
// Same underlying data as the admin panel; this route exists for scripted/CI
// use (e.g. a scheduled check that alerts if the orphan count grows).

export async function GET(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin' && session.globalRole !== 'buildquote_reviewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')
  if (!manufacturerId) {
    return NextResponse.json({ error: 'manufacturerId query param is required' }, { status: 400 })
  }

  const report = await reportOrphans(manufacturerId)
  if (!report.ok) {
    return NextResponse.json({ error: report.error }, { status: 500 })
  }

  return NextResponse.json(report)
}
