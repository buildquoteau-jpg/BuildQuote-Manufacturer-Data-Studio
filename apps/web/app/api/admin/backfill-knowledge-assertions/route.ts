// POST /api/admin/backfill-knowledge-assertions
//   ?dryRun=true                    — report what would be inserted, write nothing (default: true)
//   &manufacturerId=<uuid>          — scope to one manufacturer
//   &systemSlug=<slug>              — scope to one system (combine with manufacturerId)
//
// One-off admin operation (design doc §14 step 3 / task #3): turns existing
// field_verifications + parser_field_evidence + custom_technical_attributes
// data into knowledge_assertions + assertion_evidence rows, using the exact
// same resolution logic the live knowledge.jsonld route runs (see
// lib/knowledge/backfillAssertions.ts's header comment for why that reuse
// matters). Idempotent — safe to re-run, only ever inserts.
//
// Requires migration 065 applied first; returns a clear per-system error
// (rather than a 500) if knowledge_assertions doesn't exist yet.
//
// buildquote_admin only — this writes data, unlike the read-only
// /api/admin/orphans report it's modelled on.

import { NextRequest, NextResponse } from 'next/server'
import { getStudioSession } from '@/lib/studio-auth/session'
import { createStudioServiceClient } from '@/lib/supabase/service'
import { backfillKnowledgeAssertions } from '@/lib/knowledge/backfillAssertions'

export async function POST(req: NextRequest) {
  const session = await getStudioSession()
  if (session.globalRole !== 'buildquote_admin') {
    return NextResponse.json({ error: 'Forbidden — buildquote_admin only' }, { status: 403 })
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') !== 'false' // default true — an explicit ?dryRun=false is required to write
  const manufacturerId = req.nextUrl.searchParams.get('manufacturerId') ?? undefined
  const systemSlug = req.nextUrl.searchParams.get('systemSlug') ?? undefined

  const supabase = createStudioServiceClient()
  const summary = await backfillKnowledgeAssertions(supabase, { dryRun, manufacturerId, systemSlug })

  if (!summary.ok) {
    return NextResponse.json({ error: summary.error }, { status: 500 })
  }
  return NextResponse.json(summary)
}
