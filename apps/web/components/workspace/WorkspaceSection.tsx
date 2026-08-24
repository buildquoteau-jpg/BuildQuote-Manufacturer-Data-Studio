'use client'

// Accordion section for the System Workspace (design doc §7): one open at a
// time by default, each header showing a lightweight status summary so a
// manufacturer can see what needs them without opening every section.

import { useState, type ReactNode } from 'react'

export type SectionStatus = 'ok' | 'warn' | 'attention' | 'empty'

const STATUS_DOT: Record<SectionStatus, string> = {
  ok: '#16a34a',
  warn: '#d97706',
  attention: '#b91c1c',
  empty: '#d1d5db',
}

export function WorkspaceSection({
  title, statusLabel, status = 'empty', defaultOpen, children,
}: {
  title: string
  statusLabel?: string
  status?: SectionStatus
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ borderBottom: '1px solid var(--ds-border, #e5e7eb)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.8rem 0.2rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-faint, #9ca3af)', width: '0.8rem' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ds-text, #0f172a)', flex: 1 }}>{title}</span>
        {statusLabel && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.76rem', color: 'var(--ds-text-muted, #6b7280)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[status] }} />
            {statusLabel}
          </span>
        )}
      </button>
      {open && <div style={{ paddingBottom: '0.9rem' }}>{children}</div>}
    </div>
  )
}
