import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import type { ReactNode } from 'react'

/**
 * Admin route guard.
 *
 * Allowed: buildquote_admin, buildquote_reviewer (read-only context; pages may
 * further restrict reviewer access once the review workspace is built).
 *
 * Denied: manufacturer_user — redirected to their own workspace at /dashboard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getStudioSession()

  if (!session.profile) redirect('/login')

  if (session.globalRole === 'manufacturer_user') {
    redirect('/dashboard')
  }

  return <>{children}</>
}
