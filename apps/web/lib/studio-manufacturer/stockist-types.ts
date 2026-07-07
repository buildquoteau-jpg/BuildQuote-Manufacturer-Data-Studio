// Shared stockist constants/types importable from both server actions and
// client components ('use server' modules may only export async functions).

export const AU_STATES = ['WA', 'NSW', 'VIC', 'QLD', 'SA', 'TAS', 'NT', 'ACT'] as const
export type AuState = (typeof AU_STATES)[number]

export type StockistRecord = {
  id: string
  manufacturer_id: string
  business_name: string
  suburb: string | null
  state: string | null
  phone: string | null
  website_url: string | null
  trade_desk_email: string | null
  all_cards: boolean
  confirm_token: string
  confirm_status: 'unconfirmed' | 'confirmed'
  confirmed_at: string | null
  archived: boolean
  created_at: string
  /** card ids linked when all_cards = false */
  card_ids: string[]
}

export type StockistInput = {
  businessName: string
  suburb: string | null
  state: string | null
  phone: string | null
  websiteUrl: string | null
  tradeDeskEmail: string | null
}

export type StockistActionResult = { ok: true } | { ok: false; error: string }
export type StockistListResult =
  | { ok: true; stockists: StockistRecord[] }
  | { ok: false; error: string; missingSchema?: boolean }

export type StockistImportResult =
  | { ok: true; inserted: number; skipped: { row: number; reason: string }[] }
  | { ok: false; error: string }
