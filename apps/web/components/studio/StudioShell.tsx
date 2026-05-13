import type { ReactNode } from 'react'

export type StudioRole = 'admin' | 'manufacturer' | 'dashboard'

type NavItem = { label: string; href: string }

const COMMON_NAV: NavItem[] = [
  { label: 'Login', href: '/login' },
  { label: 'Dashboard', href: '/dashboard' },
]

const ADMIN_NAV: NavItem[] = [
  ...COMMON_NAV,
  { label: 'Manufacturers', href: '/admin/manufacturers' },
]

const MFR_NAV: NavItem[] = [
  ...COMMON_NAV,
  { label: 'Mfr. dashboard', href: '/manufacturer/dashboard' },
  { label: 'Documents', href: '/manufacturer/documents' },
  { label: 'Review', href: '/manufacturer/review' },
  { label: 'Preview', href: '/manufacturer/preview' },
  { label: 'Help', href: '/manufacturer/help' },
]

const DASHBOARD_NAV: NavItem[] = [
  ...COMMON_NAV,
  { label: 'Admin', href: '/admin/manufacturers' },
  { label: 'Mfr. dashboard', href: '/manufacturer/dashboard' },
]

const NAV_BY_ROLE: Record<StudioRole, NavItem[]> = {
  admin: ADMIN_NAV,
  manufacturer: MFR_NAV,
  dashboard: DASHBOARD_NAV,
}

const BADGE_BY_ROLE: Record<StudioRole, { className: string; label: string }> = {
  admin:        { className: 'studio-badge studio-badge-admin', label: 'Admin shell' },
  manufacturer: { className: 'studio-badge studio-badge-mfr',   label: 'Manufacturer shell' },
  dashboard:    { className: 'studio-badge studio-badge-draft',  label: 'Dashboard' },
}

const DEFAULT_NOTICE =
  'Auth shell only — real sign-in and route protection are not active yet. All pages are accessible during development.'

type Props = {
  role: StudioRole
  /** Short context string shown faintly in the header, e.g. "All manufacturers". */
  subtitle?: string
  /**
   * Override the default auth shell notice with a page-specific message.
   * Pass null to suppress the notice entirely (use sparingly).
   */
  notice?: string | null
  children: ReactNode
}

export function StudioShell({ role, subtitle, notice, children }: Props) {
  const nav = NAV_BY_ROLE[role]
  const badge = BADGE_BY_ROLE[role]
  const noticeText = notice === null ? null : (notice ?? DEFAULT_NOTICE)

  return (
    <div className="studio-page">
      <header className="studio-header">
        <a href="/dashboard">BuildQuote Data Studio</a>
        <span className={badge.className}>{badge.label}</span>
        {subtitle && (
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', opacity: 0.75 }}>
            {subtitle}
          </span>
        )}
      </header>

      <nav className="studio-nav">
        {nav.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
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
