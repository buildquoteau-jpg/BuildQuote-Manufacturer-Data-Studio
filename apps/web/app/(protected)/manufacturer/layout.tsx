import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import type { ReactNode } from 'react'

/**
 * Manufacturer workspace route guard.
 *
 * Allowed:
 *   - manufacturer_user with at least one active membership
 *   - buildquote_admin (support / preview access)
 *
 * Denied:
 *   - buildquote_reviewer — no manufacturer workspace access yet
 *   - manufacturer_user with no active memberships — sent to dashboard
 *     which shows the "no workspace assigned" message
 */
export default async function ManufacturerLayout({ children }: { children: ReactNode }) {
  const session = await getStudioSession()

  if (!session.profile) redirect('/login')

  if (session.globalRole === 'buildquote_reviewer') {
    redirect('/dashboard')
  }

  if (session.globalRole === 'manufacturer_user' && session.memberships.length === 0) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
