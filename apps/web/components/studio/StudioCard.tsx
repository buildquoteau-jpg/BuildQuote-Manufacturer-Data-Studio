type Props = {
  title: string
  description?: string
  href?: string
  disabled?: boolean
  icon?: string
}

export function StudioCard({ title, description, href, disabled, icon }: Props) {
  const className = `studio-card${disabled ? ' disabled' : ''}`

  const inner = (
    <>
      {icon && <span className="studio-card-icon">{icon}</span>}
      <div className="studio-card-title">{title}</div>
      {description && <p className="studio-card-desc">{description}</p>}
    </>
  )

  if (disabled || !href) {
    return <div className={className}>{inner}</div>
  }

  return (
    <a href={href} className={className}>
      {inner}
    </a>
  )
}
