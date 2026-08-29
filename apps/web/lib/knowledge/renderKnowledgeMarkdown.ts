// Markdown rendering of the SAME knowledge object the JSON-LD viewer shows
// (Agent Ready tab) — not a separate document, not the customer-card
// container (lib/packages/card-container.ts, a different shape built for
// embeddings). Pure function, no Supabase — same "generator has no side
// effects" discipline as buildSystemKnowledge.ts.

import type { AtomicAssertion, KnowledgeObject } from './types'

function h(level: number, text: string): string {
  return `${'#'.repeat(level)} ${text}\n`
}

function claimTypeHeading(claimType: string): string {
  return claimType
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

export function renderKnowledgeMarkdown(obj: KnowledgeObject): string {
  const lines: string[] = []

  lines.push(h(1, String(obj.name ?? 'Untitled system')))
  const manufacturer = obj.manufacturer as { name?: string } | undefined
  if (manufacturer?.name) lines.push(`**Manufacturer:** ${manufacturer.name}\n`)
  if (obj.sku) lines.push(`**SKU:** ${obj.sku}\n`)
  if (obj.category) lines.push(`**Category:** ${obj.category}\n`)
  if (obj.description) lines.push(`\n${obj.description}\n`)

  const profiles = (obj['bq:contains'] as Record<string, unknown>[] | undefined) ?? []
  if (profiles.length > 0) {
    lines.push(h(2, 'Variants & profiles'))
    for (const p of profiles) {
      const dims = ['length', 'width', 'height'].map((k) => {
        const v = p[k] as { value?: number; unitCode?: string } | undefined
        return v?.value != null ? `${v.value}${v.unitCode ?? ''}` : null
      }).filter(Boolean).join(' × ')
      lines.push(`- **${p.name}**${p.sku ? ` (${p.sku})` : ''}${dims ? ` — ${dims}` : ''}${p['bq:sellUnit'] ? `, sold by ${p['bq:sellUnit']}` : ''}`)
    }
    lines.push('')
  }

  for (const [key, heading] of [['bq:requires', 'Required components'], ['bq:optionalComponent', 'Optional components'], ['bq:accessory', 'Accessories']] as const) {
    const items = (obj[key] as Record<string, unknown>[] | undefined) ?? []
    if (items.length === 0) continue
    lines.push(h(2, heading))
    for (const c of items) {
      lines.push(`- **${c.name}**${c.sku ? ` (${c.sku})` : ''}${c.description ? ` — ${c.description}` : ''}`)
    }
    lines.push('')
  }

  const colours = (obj['bq:finishOption'] as Record<string, unknown>[] | undefined) ?? []
  if (colours.length > 0) {
    lines.push(h(2, 'Colours & finishes'))
    for (const c of colours) {
      lines.push(`- ${c.name}${c.sku ? ` (${c.sku})` : ''}${c['bq:isStocked'] === false ? ' — special order' : ''}`)
    }
    lines.push('')
  }

  const relationHeadings: [string, string][] = [
    ['bq:compatibleWith', 'Compatible with'],
    ['bq:incompatibleWith', 'Not compatible with'],
    ['bq:supersedes', 'Supersedes'],
    ['bq:supersededBy', 'Superseded by'],
    ['bq:substituteFor', 'Substitute for'],
    ['bq:requiresSystem', 'Requires'],
  ]
  for (const [key, heading] of relationHeadings) {
    const rels = (obj[key] as { 'bq:target'?: { name?: string }; 'bq:note'?: string; 'bq:reason'?: string }[] | undefined) ?? []
    if (rels.length === 0) continue
    lines.push(h(2, heading))
    for (const r of rels) {
      const detail = r['bq:reason'] ?? r['bq:note']
      lines.push(`- **${r['bq:target']?.name ?? 'Unknown'}**${detail ? ` — ${detail}` : ''}`)
    }
    lines.push('')
  }

  // Facts, grouped by claim type — the same atomic assertions the JSON-LD
  // panel shows, read as prose instead of raw objects.
  const knowledge = obj['bq:knowledge'] as { 'bq:atomicAssertions'?: AtomicAssertion[] } | undefined
  const atomics = knowledge?.['bq:atomicAssertions'] ?? []
  if (atomics.length > 0) {
    lines.push(h(2, 'What the AI knows'))
    const groups = new Map<string, AtomicAssertion[]>()
    for (const a of atomics) {
      const list = groups.get(a['bq:claimType']) ?? []
      list.push(a)
      groups.set(a['bq:claimType'], list)
    }
    groups.forEach((facts, claimType) => {
      lines.push(h(3, claimTypeHeading(claimType)))
      for (const f of facts) {
        const statusTag = f['bq:epistemicStatus'] === 'manufacturer_verified' || f['bq:epistemicStatus'] === 'manufacturer_corrected'
          ? '✓ verified'
          : f['bq:epistemicStatus'] === 'buildquote_checked' ? '✓ checked'
          : f['bq:epistemicStatus'] === 'unknown' || f['bq:epistemicStatus'] === 'not_specified' ? '? unknown'
          : f['bq:epistemicStatus'] === 'not_applicable' ? '– n/a'
          : f['bq:epistemicStatus'] === 'disputed' ? '⚑ disputed'
          : '~ unverified'
        lines.push(`- ${f['bq:claim']} *(${statusTag})*`)
      }
      lines.push('')
    })
  }

  const gaps = (obj['bq:knowledgeGaps'] as { 'bq:about': string; 'bq:reason': string }[] | undefined) ?? []
  if (gaps.length > 0) {
    lines.push(h(2, 'Known gaps'))
    for (const g of gaps) lines.push(`- **${g['bq:about']}** — ${g['bq:reason']}`)
    lines.push('')
  }

  const docs = (obj['bq:documentedBy'] as { name?: string; 'bq:documentRole'?: string; 'bq:summary'?: string }[] | undefined) ?? []
  if (docs.length > 0) {
    lines.push(h(2, 'Source documents'))
    for (const d of docs) {
      lines.push(`- **${d.name}** (${d['bq:documentRole']})${d['bq:summary'] ? ` — ${d['bq:summary']}` : ''}`)
    }
    lines.push('')
  }

  const coverage = (obj['bq:coverage'] as Record<string, string> | undefined) ?? {}
  const coverageKeys = Object.keys(coverage)
  if (coverageKeys.length > 0) {
    lines.push(h(2, 'Not yet covered'))
    for (const k of coverageKeys) lines.push(`- ${k}: ${coverage[k]}`)
    lines.push('')
  }

  if (obj['bq:usageNote']) {
    lines.push(h(2, 'Usage note'))
    lines.push(`${obj['bq:usageNote']}\n`)
  }

  return lines.join('\n')
}
