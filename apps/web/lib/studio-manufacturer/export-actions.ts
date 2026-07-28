'use server'

// Validation exports for the manufacturer workspace:
//   * getAuditTrailCsv    — CSV audit trail (field_verifications + versions)
//   * getCertificateData  — data for a printable validation certificate per
//                           card version (client renders + prints to PDF,
//                           same pattern as QuoteCardClient)
//
// Both are read-only; per card or across the workspace with a date range.

import { assertManufacturerAccess } from './access'
import {
  isMissingSchemaError,
  makeStudioClient,
} from '@/lib/supabase/helpers'

function csvEscape(v: string | null | undefined): string {
  const s = v ?? ''
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ─── CSV audit trail ──────────────────────────────────────────────────────────

export type AuditCsvResult =
  | { ok: true; csv: string; filename: string; rowCount: number }
  | { ok: false; error: string }

export async function getAuditTrailCsv(
  manufacturerId: string,
  opts: { cardId?: string; fromIso?: string; toIso?: string } = {},
): Promise<AuditCsvResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  // Cards in scope
  let cardsQuery = supabase
    .from('staged_systems')
    .select('id, name, slug')
    .eq('manufacturer_id', manufacturerId)
  if (opts.cardId) cardsQuery = cardsQuery.eq('id', opts.cardId)
  const { data: cardRows, error: cardsError } = await cardsQuery
  if (cardsError) return { ok: false, error: cardsError.message }
  const cards = (cardRows ?? []) as { id: string; name: string; slug: string | null }[]
  if (cards.length === 0) return { ok: false, error: 'No cards found for this export.' }
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const cardIds = cards.map((c) => c.id)

  // Field verifications in scope
  let fvQuery = supabase
    .from('field_verifications')
    .select('entity_id, field_name, extracted_value, verified_value, status, source_document_id, source_page_number, reviewer_id, reviewed_at, notes')
    .eq('entity_type', 'staged_system')
    .in('entity_id', cardIds)
    .order('reviewed_at', { ascending: true })
  if (opts.fromIso) fvQuery = fvQuery.gte('reviewed_at', opts.fromIso)
  if (opts.toIso) fvQuery = fvQuery.lte('reviewed_at', opts.toIso)
  const { data: fvRows, error: fvError } = await fvQuery
  if (fvError) return { ok: false, error: fvError.message }
  const verifications = (fvRows ?? []) as {
    entity_id: string; field_name: string; extracted_value: string | null
    verified_value: string | null; status: string; source_document_id: string | null
    source_page_number: number | null; reviewer_id: string | null
    reviewed_at: string | null; notes: string | null
  }[]

  // Source document names
  const docIds = Array.from(new Set(verifications.map((v) => v.source_document_id).filter(Boolean))) as string[]
  const docNameById = new Map<string, string>()
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('source_documents')
      .select('id, document_name')
      .in('id', docIds)
    for (const d of (docs ?? []) as { id: string; document_name: string }[]) {
      docNameById.set(d.id, d.document_name)
    }
  }

  // Reviewer names
  const reviewerIds = Array.from(new Set(verifications.map((v) => v.reviewer_id).filter(Boolean))) as string[]
  const reviewerById = new Map<string, string>()
  if (reviewerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('data_studio_user_profiles')
      .select('auth_user_id, full_name, email')
      .in('auth_user_id', reviewerIds)
    for (const p of (profiles ?? []) as { auth_user_id: string; full_name: string | null; email: string }[]) {
      reviewerById.set(p.auth_user_id, p.full_name || p.email)
    }
  }

  // Latest published version per card (card_versions, 049) — blank when the
  // migration isn't applied or the card was never packaged.
  const versionByCard = new Map<string, number>()
  {
    const { data: versionRows, error: vError } = await supabase
      .from('card_versions')
      .select('card_id, version')
      .eq('manufacturer_id', manufacturerId)
      .in('card_id', cardIds)
      .order('version', { ascending: false })
    if (!vError) {
      for (const r of (versionRows ?? []) as { card_id: string; version: number }[]) {
        if (!versionByCard.has(r.card_id)) versionByCard.set(r.card_id, r.version)
      }
    } else if (!isMissingSchemaError(vError)) {
      return { ok: false, error: vError.message }
    }
  }

  const header = [
    'Card', 'Card slug', 'Field', 'Extracted value', 'Verified value', 'Status',
    'Source document', 'Source page', 'Current version', 'Validated by', 'Timestamp', 'Notes',
  ]
  const lines = [header.join(',')]
  for (const v of verifications) {
    const card = cardById.get(v.entity_id)
    if (!card) continue
    lines.push([
      csvEscape(card.name),
      csvEscape(card.slug),
      csvEscape(v.field_name),
      csvEscape(v.extracted_value),
      csvEscape(v.verified_value),
      csvEscape(v.status),
      csvEscape(v.source_document_id ? docNameById.get(v.source_document_id) ?? v.source_document_id : ''),
      csvEscape(v.source_page_number != null ? String(v.source_page_number) : ''),
      csvEscape(versionByCard.has(v.entity_id) ? `v${versionByCard.get(v.entity_id)}` : ''),
      csvEscape(v.reviewer_id ? reviewerById.get(v.reviewer_id) ?? v.reviewer_id : ''),
      csvEscape(v.reviewed_at ?? ''),
      csvEscape(v.notes),
    ].join(','))
  }

  const scope = opts.cardId
    ? (cardById.get(opts.cardId)?.slug || 'card')
    : 'all-cards'
  const stamp = new Date().toISOString().slice(0, 10)
  return {
    ok: true,
    csv: lines.join('\r\n'),
    filename: `validation-audit-${scope}-${stamp}.csv`,
    rowCount: lines.length - 1,
  }
}

// ─── Validation certificate data ─────────────────────────────────────────────

export type CertificateVersion = { version: number; created_at: string }

export type CertificateData = {
  manufacturerName: string
  cardName: string
  cardSlug: string
  version: number
  packagedAt: string | null
  validatedBy: string | null      // reviewer_notes label, e.g. "Verified by MB on 04/07/26"
  validatedAt: string | null
  fieldSummary: { field: string; value: string | null; status: string; sourceDocument: string | null; reviewedAt: string | null }[]
  generatedAt: string
}

export type CertificateResult =
  | { ok: true; data: CertificateData; availableVersions: CertificateVersion[] }
  | { ok: false; error: string }

export async function getCertificateData(
  manufacturerId: string,
  cardId: string,
  version?: number,
): Promise<CertificateResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const clientResult = makeStudioClient()
  if (!clientResult.ok) return { ok: false, error: clientResult.error }
  const supabase = clientResult.supabase

  const { data: mfr } = await supabase
    .from('data_studio_manufacturers')
    .select('name')
    .eq('id', manufacturerId)
    .single()

  const { data: versionRows, error: vError } = await supabase
    .from('card_versions')
    .select('version, slug, name, validated_by, validated_at, created_at')
    .eq('manufacturer_id', manufacturerId)
    .eq('card_id', cardId)
    .order('version', { ascending: false })
  if (vError) {
    if (isMissingSchemaError(vError)) {
      return { ok: false, error: 'Version history is not set up yet (migration 049). Generate a package to create the first version.' }
    }
    return { ok: false, error: vError.message }
  }
  const versions = (versionRows ?? []) as {
    version: number; slug: string; name: string
    validated_by: string | null; validated_at: string | null; created_at: string
  }[]
  if (versions.length === 0) {
    return { ok: false, error: 'This card has no published versions yet — generate a package first.' }
  }
  const row = version != null ? versions.find((r) => r.version === version) : versions[0]
  if (!row) return { ok: false, error: `Version ${version} not found for this card.` }

  // Field-level verification detail
  const { data: fvRows } = await supabase
    .from('field_verifications')
    .select('field_name, verified_value, extracted_value, status, source_document_id, reviewed_at')
    .eq('entity_type', 'staged_system')
    .eq('entity_id', cardId)
    .order('field_name', { ascending: true })
  const fieldRows = (fvRows ?? []) as {
    field_name: string; verified_value: string | null; extracted_value: string | null
    status: string; source_document_id: string | null; reviewed_at: string | null
  }[]

  const docIds = Array.from(new Set(fieldRows.map((f) => f.source_document_id).filter(Boolean))) as string[]
  const docNameById = new Map<string, string>()
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from('source_documents')
      .select('id, document_name')
      .in('id', docIds)
    for (const d of (docs ?? []) as { id: string; document_name: string }[]) {
      docNameById.set(d.id, d.document_name)
    }
  }

  return {
    ok: true,
    data: {
      manufacturerName: (mfr as { name: string } | null)?.name ?? 'Manufacturer',
      cardName: row.name,
      cardSlug: row.slug,
      version: row.version,
      packagedAt: row.created_at,
      validatedBy: row.validated_by,
      validatedAt: row.validated_at,
      fieldSummary: fieldRows.map((f) => ({
        field: f.field_name,
        value: f.verified_value ?? f.extracted_value,
        status: f.status,
        sourceDocument: f.source_document_id ? docNameById.get(f.source_document_id) ?? null : null,
        reviewedAt: f.reviewed_at,
      })),
      generatedAt: new Date().toISOString(),
    },
    availableVersions: versions.map((r) => ({ version: r.version, created_at: r.created_at })),
  }
}
