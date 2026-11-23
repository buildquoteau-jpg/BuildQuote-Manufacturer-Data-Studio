'use client'

import { Fragment } from 'react'
import { usePathname } from 'next/navigation'

export type NavItem = {
  label: string
  href: string
  step?: number
  matchPrefixes?: string[]
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true
  if (item.matchPrefixes) {
    return item.matchPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }
  return item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)
}

export function StudioNavBar({
  items,
  isFlow = false,
}: {
  items: NavItem[]
  isFlow?: boolean
}) {
  const pathname = usePathname() || ''

  return (
    <nav className="studio-nav" aria-label={isFlow ? 'Manufacturer workflow steps' : 'Studio navigation'}>
      <div className={`studio-nav-inner${isFlow ? ' studio-nav-flow' : ''}`}>
        {items.map((item, idx) => {
          const active = isItemActive(pathname, item)
          return (
            <Fragment key={item.href}>
              {isFlow && idx > 0 && (
                <span className="studio-nav-sep" aria-hidden="true">
                  ›
                </span>
              )}
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'studio-nav-link is-active' : 'studio-nav-link'}
              >
                {item.step != null && (
                  <span className={active ? 'studio-step-num is-active' : 'studio-step-num'}>
                    {item.step}
                  </span>
                )}
                <span>{item.label}</span>
              </a>
            </Fragment>
          )
        })}
      </div>
    </nav>
  )
}
