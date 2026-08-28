import type { ReactNode } from 'react'
import { logout } from '@/lib/studio-auth/actions'
import { getStudioSession } from '@/lib/studio-auth/session'

export type StudioRole = 'admin' | 'reviewer' | 'manufacturer' | 'dashboard'

type NavItem = { label: string; href: string }

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

const MFR_NAV: NavItem[] = [
  { label: 'Start Here',      href: '/manufacturer/start-here' },
  { label: 'Brand profile',   href: '/manufacturer/profile' },
  { label: 'User profile',    href: '/manufacturer/account' },
  { label: 'Documents',       href: '/manufacturer/documents' },
  { label: 'Asset upload',    href: '/manufacturer/assets' },
  { label: 'Products',        href: '/manufacturer/cms' },
  { label: 'Verify systems',  href: '/manufacturer/review' },
  { label: 'AI Questions',    href: '/manufacturer/ai-questions' },
  { label: 'Stockists',       href: '/manufacturer/stockists' },
  { label: 'Publish',         href: '/manufacturer/publish' },
  { label: 'Packages',        href: '/manufacturer/packages' },
  { label: 'Embeds & Links',  href: '/manufacturer/widgets' },
  { label: 'Analytics',       href: '/manufacturer/analytics' },
  { label: 'Inbox',           href: '/manufacturer/inbox' },
  { label: 'Help',            href: '/manufacturer/help' },
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
  dashboard:    { className: 'studio-badge studio-badge-draft',  label: 'Dashboard' },
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
  /** When true, renders the Pipeline nav item (admin-only). */
  showPipelineNav?: boolean
  children: ReactNode
}

export async function StudioShell({ role, subtitle, workspaceName, notice, showPipelineNav, children }: Props) {
  const session = await getStudioSession()
  const isAdmin = session.globalRole === 'buildquote_admin'
  const baseNav = NAV_BY_ROLE[role]
  const showPipeline = showPipelineNav ?? isAdmin
  const nav = (role === 'manufacturer' && showPipeline)
    ? [...baseNav.filter(n => n.href !== '/manufacturer/help'), { label: 'Pipeline', href: '/manufacturer/pipeline' }, { label: 'Help', href: '/manufacturer/help' }]
    : baseNav
  const badge = BADGE_BY_ROLE[role]
  // Default: no notice. Pages opt in by passing a string.
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
                marginLeft: '0.75rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--ds-header-text, #fff)',
                opacity: 0.9,
              }}
            >
              {workspaceName}
              {subtitle && (
                <span style={{ fontWeight: 400, opacity: 0.65, marginLeft: '0.4rem' }}>
                  — {subtitle}
                </span>
              )}
            </span>
          )}
          {!workspaceName && subtitle && (
            <span style={{ marginLeft: 'auto', fontSize: '0.85rem', opacity: 0.75 }}>
              {subtitle}
            </span>
          )}
        </div>
      </header>

      <nav className="studio-nav">
        <div className="studio-nav-inner">
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          {/* Sign-out is a server action — form POST, no client JS needed */}
          <form action={logout} style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'inherit',
                color: 'var(--ds-text-muted)',
                padding: '0',
                lineHeight: 'inherit',
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

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
