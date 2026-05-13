import type { ReactNode } from 'react'

type Role = 'admin' | 'manufacturer'

type NavItem = { label: string; href: string }

const ADMIN_NAV: NavItem[] = [
  { label: 'Manufacturers', href: '/admin/manufacturers' },
]

const MFR_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/manufacturer/dashboard' },
  { label: 'Documents', href: '/manufacturer/documents' },
  { label: 'Review', href: '/manufacturer/review' },
  { label: 'Preview', href: '/manufacturer/preview' },
  { label: 'Help', href: '/manufacturer/help' },
]

type Props = {
  role: Role
  subtitle?: string
  children: ReactNode
}

export function StudioShell({ role, subtitle, children }: Props) {
  const nav = role === 'admin' ? ADMIN_NAV : MFR_NAV
  const badgeClass = role === 'admin' ? 'studio-badge studio-badge-admin' : 'studio-badge studio-badge-mfr'
  const badgeLabel = role === 'admin' ? 'Admin' : 'Manufacturer'

  return (
    <div className="studio-page">
      <header className="studio-header">
        <a href="/dashboard">BuildQuote Data Studio</a>
        <span className={badgeClass}>{badgeLabel}</span>
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
        <div className="studio-warn">
          ⚠ Auth not wired yet — protected shell only. All pages are accessible without login during development.
        </div>
        {children}
      </main>
    </div>
  )
}
