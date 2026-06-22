import type { ReactNode } from 'react'

type Props = {
  type?: 'warn' | 'info'
  children: ReactNode
}

export function StudioNotice({ type = 'warn', children }: Props) {
  return <div className={type === 'info' ? 'studio-info' : 'studio-warn'}>{children}</div>
}
