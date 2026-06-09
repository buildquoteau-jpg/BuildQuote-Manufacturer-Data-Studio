import { redirect } from 'next/navigation'
import { getStudioSession } from '@/lib/studio-auth/session'
import { getAdminImpersonatedManufacturerId, getManufacturerInfo } from '@/lib/studio-manufacturer/workspace'
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

  // Show exit banner when admin has entered a workspace via the gate
  let impersonationBanner: ReactNode = null
  if (session.globalRole === 'buildquote_admin') {
    const manufacturerId = await getAdminImpersonatedManufacturerId()
    if (manufacturerId) {
      const mfrResult = await getManufacturerInfo(manufacturerId)
      const mfrName = mfrResult.ok ? mfrResult.manufacturer.name : 'manufacturer workspace'
      impersonationBanner = (
        <div
          style={{
            background: '#1e3a5f',
            color: '#fff',
            padding: '0.55rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            fontSize: '0.82rem',
            fontWeight: 600,
            flexWrap: 'wrap',
          }}
        >
          <span>
            Admin view — viewing as <strong>{mfrName}</strong>
          </span>
          <ExitGateButton />
        </div>
      )
    }
  }

  return (
    <>
      {impersonationBanner}
      {children}
    </>
  )
}

function ExitGateButton() {
  return (
    <form
      action={async () => {
        'use server'
        const { cookies } = await import('next/headers')
        const jar = await cookies()
        jar.delete('admin_workspace_gate')
        const { redirect: serverRedirect } = await import('next/navigation')
        serverRedirect('/admin/manufacturers')
      }}
    >
      <button
        type="submit"
        style={{
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff',
          borderRadius: 6,
          padding: '0.25rem 0.75rem',
          fontSize: '0.78rem',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.02em',
        }}
      >
        Exit workspace →
      </button>
    </form>
  )
}
