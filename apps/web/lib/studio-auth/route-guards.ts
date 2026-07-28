// Route-handler flavour of the workspace access gate.
//
// Server actions use assertManufacturerAccess (lib/studio-manufacturer/access.ts)
// and return result envelopes; API routes need the same rules expressed as HTTP
// responses. Returns null when the caller may proceed.

import { NextResponse } from 'next/server'
import type { StudioSession } from '@/lib/studio-auth/session'

export function manufacturerMembershipError(
  session: StudioSession,
  manufacturerId: string,
): NextResponse | null {
  if (session.globalRole === 'buildquote_admin') return null
  if (session.globalRole !== 'manufacturer_user') {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
  }
  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) {
    return NextResponse.json({ error: 'Not a member of this workspace.' }, { status: 403 })
  }
  return null
}
