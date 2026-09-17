// Sourced-card container assembly (Step 5 of docs/sourced-system-card-architecture.md).
//
// At publish time we freeze, per card version, a self-contained text document =
// the structured card fields + the extracted text of every linked source
// (system_sources with include_in_container), plus a provenance manifest and a
// content hash for change-detection / re-embedding. This is what makes the card
// an AI-searchable, citable container that survives the manufacturer's URL going
// dead.
//
// Fails soft: if system_sources / document_chunks are missing or empty, the
// container is just the serialized fields — publishing is never blocked.

import { createHash } from 'crypto'
import type { createStudioServerClient } from '@/lib/supabase/server'
import type { SystemCardSystem } from '@/components/system-card-renderer/types'

type SupabaseClient = ReturnType<typeof createStudioServerClient>

export type CardContainerSource = {
  role: string
  label: string | null
  url: string
  source_document_id: string | null
  pages: { start: number | null; end: number | null } | null
}

export type CardContainer = {
  content_md: string
  content_hash: string
  sources_json: CardContainerSource[]
}

type SourceRow = {
  staged_system_id: string
  role: string
  label: string | null
  url: string
  source_document_id: string | null
  sort_order: number
}

type ChunkRow = {
  source_document_id: string
  chunk_index: number
  page_number: number | null
  raw_text: string | null
  docling_json: { endPage?: number | null } | null
}

// ─── Structured-field serialization (deterministic → stable hash) ──────────────

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  return `- ${label}: ${value}`
}

function yesNo(v: boolean | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return v ? 'yes' : 'no'
}

function serializeSystemFields(system: SystemCardSystem): string {
  const out: string[] = []
  out.push(`# ${system.name}`)

  const cat = [system.category, system.subcategory].filter(Boolean).join(' / ')
  if (cat) out.push(`Category: ${cat}`)
  if (system.product_code) out.push(`Product code: ${system.product_code}`)
  if (system.manufacturer?.name) out.push(`Manufacturer: ${system.manufacturer.name}`)
  if (system.description) out.push(`\n${system.description}`)

  const specs = [
    line('Australian made', yesNo(system.australian_made)),
    line('BAL rating', system.bal_rating),
    line('Fire rating', system.fire_rating),
    line('Acoustic rating', system.acoustic_rating),
    line('Structural grade', system.structural_grade),
    line('Moisture resistant', yesNo(system.moisture_resistant)),
  ].filter((l): l is string => l !== null)
  if (specs.length) out.push('\n## Specifications', ...specs)

  if (system.system_profiles?.length) {
    out.push('\n## Profiles')
    for (const p of system.system_profiles) {
      const name = p.profile_name || p.name || 'Profile'
      const bits = [
        p.product_code,
        p.dimensions,
        [p.length_mm, p.width_mm, p.height_mm, p.thickness_mm].some((v) => v != null)
          ? `${p.length_mm ?? '-'}×${p.width_mm ?? '-'}×${p.height_mm ?? '-'}×${p.thickness_mm ?? '-'}mm`
          : null,
        p.uom,
      ].filter(Boolean)
      out.push(`- ${name}${bits.length ? ` — ${bits.join(', ')}` : ''}`)
    }
  }

  if (system.system_components?.length) {
    out.push('\n## Components')
    for (const c of system.system_components) {
      const comp = c.components
      if (!comp) continue
      const bits = [comp.sku, comp.description, comp.category].filter(Boolean)
      out.push(`- ${c.role}: ${comp.name}${bits.length ? ` — ${bits.join(', ')}` : ''}`)
    }
  }

  if (system.system_colours?.length) {
    out.push('\n## Colours')
    out.push(system.system_colours.map((c) => c.colour_name).join(', '))
  }

  if (system.notes) out.push('\n## Notes', system.notes)

  return out.join('\n')
}

// ─── Container assembly ────────────────────────────────────────────────────────

/**
 * Builds one container per card. Batched: two queries total regardless of card
 * count. Returns a map keyed by staged_system id (card_id). Cards with no
 * ingested sources still get a container (structured fields only).
 */
export async function buildCardContainers(
  supabase: SupabaseClient,
  cards: { cardId: string; system: SystemCardSystem }[],
): Promise<Map<string, CardContainer>> {
  const result = new Map<string, CardContainer>()
  if (cards.length === 0) return result

  const cardIds = cards.map((c) => c.cardId)

  // Gather included sources for all cards in one query. Fails soft.
  let sourceRows: SourceRow[] = []
  try {
    const { data, error } = await supabase
      .from('system_sources')
      .select('staged_system_id, role, label, url, source_document_id, sort_order')
      .in('staged_system_id', cardIds)
      .eq('include_in_container', true)
      .order('sort_order', { ascending: true })
    // Fails soft — but a container published without its sources should be
    // traceable to the query that failed, not look like "no sources ingested".
    if (error) console.error('[buildCardContainers] could not load system_sources:', error.message)
    sourceRows = (data ?? []) as SourceRow[]
  } catch (err) {
    console.error('[buildCardContainers] could not load system_sources:', err)
    sourceRows = []
  }

  // Gather chunk text for every referenced document in one query.
  const docIds = Array.from(
    new Set(sourceRows.map((s) => s.source_document_id).filter((id): id is string => !!id)),
  )
  const chunksByDoc = new Map<string, ChunkRow[]>()
  if (docIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('document_chunks')
        .select('source_document_id, chunk_index, page_number, raw_text, docling_json')
        .in('source_document_id', docIds)
        .order('chunk_index', { ascending: true })
      // No chunks — sources still listed in the manifest, just no text.
      if (error) console.error('[buildCardContainers] could not load document_chunks:', error.message)
      for (const row of (data ?? []) as ChunkRow[]) {
        const list = chunksByDoc.get(row.source_document_id) ?? []
        list.push(row)
        chunksByDoc.set(row.source_document_id, list)
      }
    } catch (err) {
      console.error('[buildCardContainers] could not load document_chunks:', err)
    }
  }

  const sourcesByCard = new Map<string, SourceRow[]>()
  for (const s of sourceRows) {
    const list = sourcesByCard.get(s.staged_system_id) ?? []
    list.push(s)
    sourcesByCard.set(s.staged_system_id, list)
  }

  for (const { cardId, system } of cards) {
    const parts: string[] = [serializeSystemFields(system)]
    const manifest: CardContainerSource[] = []
    const sources = sourcesByCard.get(cardId) ?? []

    if (sources.length) parts.push('\n## Linked sources')

    for (const src of sources) {
      const chunks = src.source_document_id ? chunksByDoc.get(src.source_document_id) ?? [] : []
      let startPage: number | null = null
      let endPage: number | null = null
      for (const ch of chunks) {
        if (ch.page_number != null) startPage = startPage == null ? ch.page_number : Math.min(startPage, ch.page_number)
        const chunkEnd = ch.docling_json?.endPage ?? ch.page_number
        if (chunkEnd != null) endPage = endPage == null ? chunkEnd : Math.max(endPage, chunkEnd)
      }

      const heading = src.label ? `${src.role} — ${src.label}` : src.role
      parts.push(`\n### ${heading}`)
      parts.push(src.url)
      const text = chunks.map((c) => (c.raw_text ?? '').trim()).filter(Boolean).join('\n\n')
      if (text) parts.push(`\n${text}`)

      manifest.push({
        role: src.role,
        label: src.label,
        url: src.url,
        source_document_id: src.source_document_id,
        pages: chunks.length ? { start: startPage, end: endPage } : null,
      })
    }

    const content_md = parts.join('\n')
    const content_hash = createHash('sha256').update(content_md).digest('hex')
    result.set(cardId, { content_md, content_hash, sources_json: manifest })
  }

  return result
}
