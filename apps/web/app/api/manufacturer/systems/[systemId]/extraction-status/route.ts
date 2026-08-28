// Manufacturer-facing read side of the self-serve extraction flow — lets the
// setup page (design doc addendum 3 §C5 step 4) poll for completion after
// "Set up my System Card" without needing buildquote_admin access, unlike
// /api/pipeline/jobs (the admin funnel feed this deliberately does not
// reuse, since that route is intentionally staff-only).

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ systemId: string }> }) {
  const { systemId } = await params
  if (!UUID_RE.test(systemId)) {
    return NextResponse.json({ error: 'Invalid system id.' }, { status: 400 })
  }

  const session = await getStudioSession()
  if (!session.profile || !session.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId')
  if (!manufacturerId || !UUID_RE.test(manufacturerId)) {
    return NextResponse.json({ error: 'manufacturerId is required.' }, { status: 400 })
  }

  if (session.globalRole !== 'buildquote_admin') {
    if (session.globalRole !== 'manufacturer_user') {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }
    const hasMembership = session.memberships.some(
      (m) => m.manufacturerId === manufacturerId && m.status === 'active',
    )
    if (!hasMembership) {
      return NextResponse.json({ error: 'Not a member of this workspace.' }, { status: 403 })
    }
  }

  let supabase: ReturnType<typeof createStudioServiceClient>
  try {
    supabase = createStudioServiceClient()
  } catch {
    return NextResponse.json({ error: 'Service role not configured.' }, { status: 500 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: jobs, error } = await supabase
    .from('pipeline_jobs')
    .select('id, job_type, status, error_message, created_at, completed_at')
    .eq('manufacturer_id', manufacturerId)
    .filter('payload->>staged_system_id', 'eq', systemId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    if (/does not exist|42P01|42703/i.test(error.message)) {
      return NextResponse.json({ jobs: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    jobs: (jobs ?? []).map((j: { id: string; job_type: string; status: string; error_message: string | null; created_at: string; completed_at: string | null }) => ({
      id: j.id,
      jobType: j.job_type,
      status: j.status,
      errorMessage: j.error_message,
      createdAt: j.created_at,
      completedAt: j.completed_at,
    })),
  })
}
