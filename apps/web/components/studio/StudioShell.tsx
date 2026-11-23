import type { ReactNode } from 'react'
import { logout } from '@/lib/studio-auth/actions'
import { StudioNavBar, type NavItem } from './StudioNavBar'

export type StudioRole = 'admin' | 'reviewer' | 'manufacturer' | 'dashboard'

const ADMIN_NAV: NavItem[] = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Manufacturers', href: '/admin/manufacturers' },
  { label: 'Messages', href: '/admin/messages' },
  { label: 'AI Knowledge Gaps', href: '/admin/knowledge-gaps' },
  { label: 'Approval queue', href: '/admin/publish' },
  { label: 'User profile', href: '/manufacturer/account' },
]

const REVIEWER_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
]

// Clean 5-step manufacturer workflow — every secondary link (Account, Help, Sign out)
// lives quietly in the top header; admin-only Pipeline lives in the Admin view bar.
const MFR_NAV: NavItem[] = [
  { step: 1, label: 'Brand',        href: '/manufacturer/profile',     matchPrefixes: ['/manufacturer/profile'] },
  { step: 2, label: 'Add products', href: '/manufacturer/start-here',  matchPrefixes: ['/manufacturer/start-here'] },
  { step: 3, label: 'Verify',       href: '/manufacturer/review',      matchPrefixes: ['/manufacturer/review', '/manufacturer/workspace', '/manufacturer/systems'] },
  { step: 4, label: 'Agent Ready',  href: '/manufacturer/agent-ready', matchPrefixes: ['/manufacturer/agent-ready'] },
  { step: 5, label: 'Publish',      href: '/manufacturer/publish',     matchPrefixes: ['/manufacturer/publish'] },
]

const DASHBOARD_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
]

const NAV_BY_ROLE: Record<StudioRole, NavItem[]> = {
  admin: ADMIN_NAV,
  reviewer: REVIEWER_NAV,
  manufacturer: MFR_NAV,
  dashboard: DASHBOARD_NAV,
}

const BADGE_BY_ROLE: Record<StudioRole, { className: string; label: string }> = {
  admin:        { className: 'studio-badge studio-badge-admin', label: 'Admin' },
  reviewer:     { className: 'studio-badge studio-badge-draft', label: 'Reviewer' },
  manufacturer: { className: 'studio-badge studio-badge-mfr',   label: 'Manufacturer' },
  dashboard:    { className: 'studio-badge studio-badge-draft', label: 'Dashboard' },
}

type Props = {
  role: StudioRole
  /** Short context string shown faintly in the header, e.g. "All manufacturers". */
  subtitle?: string
  /** Workspace name shown in the header when in a manufacturer context. */
  workspaceName?: string
  /**
   * A page-specific notice to show at the top of main content.
   * Pass null to suppress any notice (default: no notice).
   */
  notice?: string | null
  /** Kept for backwards compatibility with existing callers; Pipeline now lives in the Admin bar. */
  showPipelineNav?: boolean
  children: ReactNode
}

export async function StudioShell({ role, subtitle, workspaceName, notice, children }: Props) {
  const nav = NAV_BY_ROLE[role]
  const badge = BADGE_BY_ROLE[role]
  const noticeText = notice ?? null

  return (
    <div className="studio-page">
      <header className="studio-header">
        <div className="studio-inner">
          <a href="/dashboard">BuildQuote Data Studio</a>
          <span className={badge.className}>{badge.label}</span>
          {workspaceName && (
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--ds-header-text, #fff)',
                opacity: 0.9,
              }}
            >
              {workspaceName}
            </span>
          )}
          {!workspaceName && subtitle && (
            <span
              style={{
                marginLeft: '0.5rem',
                fontSize: '0.82rem',
                opacity: 0.72,
              }}
            >
              {subtitle}
            </span>
          )}

          {/* Utility links neatly tucked in the top-right header bar */}
          <div className="studio-header-utils">
            {role === 'manufacturer' && (
              <>
                <a href="/manufacturer/account" className="studio-header-util-link">
                  Account
                </a>
                <a href="/manufacturer/help" className="studio-header-util-link">
                  Help
                </a>
              </>
            )}
            <form action={logout} style={{ margin: 0, display: 'inline-flex', alignItems: 'center' }}>
              <button type="submit" className="studio-header-util-btn">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <StudioNavBar items={nav} isFlow={role === 'manufacturer'} />

      <main className="studio-main">
        {noticeText !== null && (
          <div className="studio-warn" style={{ marginBottom: '1.5rem' }}>
            ⚠ {noticeText}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
