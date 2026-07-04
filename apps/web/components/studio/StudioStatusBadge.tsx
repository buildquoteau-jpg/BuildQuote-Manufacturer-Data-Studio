type State = 'draft' | 'approved' | 'published'

const LABELS: Record<State, string> = {
  draft: 'Draft',
  approved: 'BuildQuote Approved',
  published: 'Package Generated',
}

const STATES: State[] = ['draft', 'approved', 'published']

type Props = {
  /** The state that is currently active — others are shown dimmed. */
  current: State
  /** Optional explanatory note shown after the badges. */
  note?: string
}

export function StudioStatusBadge({ current, note }: Props) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {STATES.map((state) => (
        <span
          key={state}
          className={`studio-badge studio-badge-${state}`}
          style={state !== current ? { opacity: 0.35 } : undefined}
        >
          {LABELS[state]}
        </span>
      ))}
      {note && (
        <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-faint)', marginLeft: '0.25rem' }}>
          {note}
        </span>
      )}
    </div>
  )
}
