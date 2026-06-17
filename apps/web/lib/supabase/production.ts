import { createClient } from '@supabase/supabase-js'

/**
 * Creates a service-role Supabase client for the RFQ/MFP PRODUCTION project
 * (oxvhmulxuvlfjyjzleki — buildquote.com.au / mfp.buildquote.com.au).
 *
 * This is a different Supabase project from the rest of this app. Every other
 * client in this codebase (createStudioServerClient, the browser client) talks
 * to the Data Studio project. This one writes into the live, customer-facing
 * catalogue (manufacturers/systems/components/etc.) that Product Search and
 * Trade Desk read from.
 *
 * Use ONLY from apps/web/lib/studio-admin/publish.ts (the publish job) and its
 * server actions/API routes. Never import this from a Client Component, never
 * expose PRODUCTION_SUPABASE_SERVICE_ROLE_KEY via NEXT_PUBLIC_*, and never use
 * it for anything except writing approved publish_batch_items.
 *
 * Service role bypasses RLS entirely — every query made with this client has
 * unrestricted read/write access to the production database. Treat every call
 * site as security-sensitive.
 */
export function createProductionServiceClient() {
  const url = process.env.PRODUCTION_SUPABASE_URL
  const serviceKey = process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing env var: PRODUCTION_SUPABASE_URL')
  if (!serviceKey) throw new Error('Missing env var: PRODUCTION_SUPABASE_SERVICE_ROLE_KEY')

  console.log('[prod-supabase] url:', url)
  console.log('[prod-supabase] key prefix:', serviceKey.slice(0, 30) + '...')
  console.log('[prod-supabase] key length:', serviceKey.length)

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
