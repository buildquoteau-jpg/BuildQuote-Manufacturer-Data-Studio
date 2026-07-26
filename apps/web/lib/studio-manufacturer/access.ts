// Workspace access gate shared by every studio-manufacturer server action.
//
// Rules (migration 013): a buildquote_admin passes for any workspace; a
// manufacturer_user needs an active membership row for that manufacturer;
// everyone else is denied.
//
// Not a 'use server' module on purpose — server actions may only export async
// functions, so the gate lives here and each action file imports it.

import { getStudioSession } from '@/lib/studio-auth/session'

export type ManufacturerAccessResult =
  | { allowed: true; userId: string; label: string }
  | { allowed: false; error: string }

export async function assertManufacturerAccess(
  manufacturerId: string,
): Promise<ManufacturerAccessResult> {
  const session = await getStudioSession()
  if (!session.profile) return { allowed: false, error: 'Not authenticated.' }

  const label = session.profile.fullName || session.profile.email || 'unknown'

  if (session.globalRole === 'buildquote_admin') {
    return { allowed: true, userId: session.user!.id, label }
  }
  if (session.globalRole !== 'manufacturer_user') {
    return { allowed: false, error: 'Access denied.' }
  }

  const hasMembership = session.memberships.some(
    (m) => m.manufacturerId === manufacturerId && m.status === 'active',
  )
  if (!hasMembership) return { allowed: false, error: 'Not a member of this workspace.' }

  return { allowed: true, userId: session.user!.id, label }
}
