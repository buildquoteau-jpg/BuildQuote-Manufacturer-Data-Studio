'use client'

// "Layered reveal" JSON viewer for the Agent Ready tab — collapsible nested
// sections via native <details>/<summary> (no library needed). Top-level
// sections start open so the shape is visible at a glance; deeper nesting
// starts collapsed.

const KEY_COLOR = '#7c3aed'
const STRING_COLOR = '#15803d'
const NUMBER_COLOR = '#1d4ed8'
const PUNCT_COLOR = 'var(--ds-text-faint, #9ca3af)'

function Primitive({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span style={{ color: PUNCT_COLOR }}>null</span>
  if (typeof value === 'string') return <span style={{ color: STRING_COLOR }}>&quot;{value}&quot;</span>
  if (typeof value === 'number' || typeof value === 'boolean') return <span style={{ color: NUMBER_COLOR }}>{String(value)}</span>
  return <span>{String(value)}</span>
}

function JsonNode({ value, depth }: { value: unknown; depth: number }) {
  if (value === null || typeof value !== 'object') {
    return <Primitive value={value} />
  }

  const isArray = Array.isArray(value)
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)

  if (entries.length === 0) {
    return <span style={{ color: PUNCT_COLOR }}>{isArray ? '[]' : '{}'}</span>
  }

  return (
    <details open={depth < 2} style={{ marginLeft: depth === 0 ? 0 : 14 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--ds-text-muted, #6b7280)', userSelect: 'none' }}>
        {isArray ? `Array (${entries.length})` : `Object (${entries.length} ${entries.length === 1 ? 'key' : 'keys'})`}
      </summary>
      <div style={{ borderLeft: '1px solid var(--ds-border, #e5e7eb)', paddingLeft: '0.7rem', marginTop: '0.2rem' }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ fontSize: '0.8rem', fontFamily: 'ui-monospace, monospace', padding: '0.1rem 0', lineHeight: 1.6 }}>
            {!isArray && <span style={{ color: KEY_COLOR, fontWeight: 600 }}>{k}</span>}
            {!isArray && <span style={{ color: PUNCT_COLOR }}>: </span>}
            <JsonNode value={v} depth={depth + 1} />
          </div>
        ))}
      </div>
    </details>
  )
}

export function JsonTreeView({ data }: { data: unknown }) {
  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>
      <JsonNode value={data} depth={0} />
    </div>
  )
}
