'use server'

// CSV import for a system's structured data (design doc addendum 3 §C5
// step 4, "download the CSV header guide and fill it out directly") — an
// alternative to the AI document-extraction pipeline for the fields a
// manufacturer already knows precisely: profiles/variants, colours,
// components/accessories, and technical attributes (BAL/fire/acoustic
// rating, structural grade, moisture resistant, Australian made map onto
// the existing typed staged_systems columns; anything else named as an
// attribute becomes a custom_technical_attributes entry). Applications,
// installation methods, sustainability narrative, span tables and similar
// free-text knowledge stay PDF/AI-extraction territory (knowledge_assertions)
// — deliberately not attempted here; a manufacturer who has that as
// structured data can still name it as a custom attribute.

import { createStudioServerClient } from '@/lib/supabase/server'
import { assertManufacturerAccess } from './verification-actions'

export const CSV_TEMPLATE_HEADERS = [
  'row_type', 'name', 'code_or_sku', 'length_mm', 'width_mm', 'height_mm', 'thickness_mm',
  'weight_kg', 'uom', 'pack_qty', 'pack_uom', 'role', 'description', 'category',
  'is_stocked', 'attribute_label', 'attribute_value',
] as const

export const CSV_TEMPLATE_SAMPLE_ROWS: string[][] = [
  ['profile', 'DeckMax 140 Board 5.4m', 'DM-140-5400', '5400', '140', '', '23', '9.8', 'lm', '50', 'boards', '', '', '', '', '', ''],
  ['colour', 'Silver Grey', 'SG', '', '', '', '', '', '', '', '', '', '', '', 'true', '', ''],
  ['component', 'DeckMax Hidden Fastener Clip', 'DM-CLIP-01', '', '', '', '', '', '', '', '', 'required', 'Stainless steel hidden fixing clip', 'Fixings', '', '', ''],
  ['attribute', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'BAL rating', 'BAL-29'],
]

// Typed staged_systems columns a row_type='attribute' label can map onto
// directly, instead of falling through to custom_technical_attributes.
const TYPED_ATTRIBUTE_COLUMNS: Record<string, { column: string; boolean?: boolean }> = {
  'bal rating': { column: 'bal_rating' },
  'fire rating': { column: 'fire_rating' },
  'acoustic rating': { column: 'acoustic_rating' },
  'structural grade': { column: 'structural_grade' },
  'moisture resistant': { column: 'moisture_resistant', boolean: true },
  'australian made': { column: 'australian_made', boolean: true },
}

export type CsvImportRow = {
  row_type: string
  name?: string
  code_or_sku?: string
  length_mm?: string
  width_mm?: string
  height_mm?: string
  thickness_mm?: string
  weight_kg?: string
  uom?: string
  pack_qty?: string
  pack_uom?: string
  role?: string
  description?: string
  category?: string
  is_stocked?: string
  attribute_label?: string
  attribute_value?: string
}

export type CsvImportResult =
  | { ok: true; counts: { profiles: number; colours: number; components: number; attributes: number }; rowErrors: string[] }
  | { ok: false; error: string }

function toNumber(v: string | undefined): number | null {
  if (!v || !v.trim()) return null
  const n = Number(v.trim())
  return Number.isFinite(n) ? n : null
}

function toBool(v: string | undefined): boolean {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'true' || s === 'yes' || s === '1'
}

export async function importSystemCsvRows(
  systemId: string,
  manufacturerId: string,
  rows: CsvImportRow[],
): Promise<CsvImportResult> {
  const auth = await assertManufacturerAccess(manufacturerId)
  if (!auth.allowed) return { ok: false, error: auth.error }

  const supabase = createStudioServerClient()
  const counts = { profiles: 0, colours: 0, components: 0, attributes: 0 }
  const rowErrors: string[] = []
  const customAttributes: { label: string; value: string }[] = []
  const typedAttributeUpdates: Record<string, unknown> = {}

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowType = (row.row_type ?? '').trim().toLowerCase()
    const rowLabel = `Row ${i + 2}`

    try {
      if (rowType === 'profile') {
        if (!row.name?.trim()) { rowErrors.push(`${rowLabel}: profile needs a name.`); continue }
        const { error } = await supabase.from('staged_system_profiles').insert({
          staged_system_id: systemId,
          profile_name: row.name.trim(),
          product_code: row.code_or_sku?.trim() || null,
          length_mm: toNumber(row.length_mm),
          width_mm: toNumber(row.width_mm),
          height_mm: toNumber(row.height_mm),
          thickness_mm: toNumber(row.thickness_mm),
          weight_kg: toNumber(row.weight_kg),
          uom: row.uom?.trim() || null,
          supplier_pack_qty: toNumber(row.pack_qty),
          supplier_pack_uom: row.pack_uom?.trim() || null,
          verification_status: 'pending_review',
        })
        if (error) { rowErrors.push(`${rowLabel}: ${error.message}`); continue }
        counts.profiles++
      } else if (rowType === 'colour') {
        if (!row.name?.trim()) { rowErrors.push(`${rowLabel}: colour needs a name.`); continue }
        const { error } = await supabase.from('staged_system_colours').insert({
          staged_system_id: systemId,
          colour_name: row.name.trim(),
          sku_suffix: row.code_or_sku?.trim() || null,
          is_stocked: row.is_stocked?.trim() ? toBool(row.is_stocked) : true,
        })
        if (error) { rowErrors.push(`${rowLabel}: ${error.message}`); continue }
        counts.colours++
      } else if (rowType === 'component') {
        if (!row.name?.trim()) { rowErrors.push(`${rowLabel}: component needs a name.`); continue }
        const { data: comp, error: compError } = await supabase.from('staged_components').insert({
          manufacturer_id: manufacturerId,
          name: row.name.trim(),
          sku: row.code_or_sku?.trim() || null,
          description: row.description?.trim() || null,
          category: row.category?.trim() || null,
          verification_status: 'pending_review',
        }).select('id').single()
        if (compError || !comp) { rowErrors.push(`${rowLabel}: ${compError?.message ?? 'insert failed'}`); continue }
        const role = row.role?.trim().toLowerCase()
        const validRole = role === 'optional' || role === 'accessory' ? role : 'required'
        const { error: linkError } = await supabase.from('staged_system_components').insert({
          staged_system_id: systemId,
          staged_component_id: (comp as { id: string }).id,
          role: validRole,
        })
        if (linkError) { rowErrors.push(`${rowLabel}: ${linkError.message}`); continue }
        counts.components++
      } else if (rowType === 'attribute') {
        const label = row.attribute_label?.trim()
        const value = row.attribute_value?.trim()
        if (!label || !value) { rowErrors.push(`${rowLabel}: attribute needs both a label and a value.`); continue }
        const typed = TYPED_ATTRIBUTE_COLUMNS[label.toLowerCase()]
        if (typed) {
          typedAttributeUpdates[typed.column] = typed.boolean ? toBool(value) : value
        } else {
          customAttributes.push({ label, value })
        }
        counts.attributes++
      } else if (rowType) {
        rowErrors.push(`${rowLabel}: unrecognised row_type "${row.row_type}" — expected profile, colour, component or attribute.`)
      }
    } catch (e) {
      rowErrors.push(`${rowLabel}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (Object.keys(typedAttributeUpdates).length > 0 || customAttributes.length > 0) {
    if (customAttributes.length > 0) {
      const { data: existing } = await supabase
        .from('staged_systems')
        .select('custom_technical_attributes')
        .eq('id', systemId)
        .maybeSingle()
      const merged = [
        ...((existing as { custom_technical_attributes: { label: string; value: string }[] | null } | null)?.custom_technical_attributes ?? []),
        ...customAttributes,
      ]
      typedAttributeUpdates.custom_technical_attributes = merged
    }
    const { error } = await supabase
      .from('staged_systems')
      .update({ ...typedAttributeUpdates, updated_at: new Date().toISOString() })
      .eq('id', systemId)
    if (error) rowErrors.push(`Attributes: ${error.message}`)
  }

  return { ok: true, counts, rowErrors }
}
