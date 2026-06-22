// BuildQuote Data Studio — Parser insertion route skeleton.
//
// POST /api/parser/insert-plan
//
// SERVER-SIDE ONLY. This route handler will eventually call
// insertParserOutputServerSide → insert_parser_output_plan_v1 RPC.
//
// Current state: returns HTTP 501 with a disabled JSON response.
// No RPC call. No Supabase client. No env var reads. No data written.
//
// Blocked until (see docs/parser-insertion-adapter-design.md §12.5):
//   - EXECUTE granted to service_role on insert_parser_output_plan_v1
//   - lib/supabase-server.ts created with SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix)
//   - Studio auth wired (Supabase Auth + data_studio_user_profiles)
//
// Future request body shape:
//   {
//     sourceDocumentId: string   — must exist in source_documents
//     extractionRunId:  string   — must exist in extraction_runs for this document
//     parserOutput:     ParserOutput  — raw AI parser output; validated server-side
//   }
//
// Future response shape (success):
//   {
//     ok: true
//     mode: "inserted"
//     insertedCounts: { stagedSystems, stagedSystemProfiles, stagedComponents,
//                       stagedSystemColours, stagedSystemComponents,
//                       fieldVerifications, parserFieldEvidence }
//     idMaps: { systems, profiles, components, colours, links }
//   }

import { NextRequest, NextResponse } from 'next/server'

// Future import when enabled:
// import { insertParserOutputServerSide } from '../../../../lib/parser/server-insert'
// import type { ParserOutput } from '../../../../lib/parser/types'

// ----------------------------------------------------------
// Disabled-route response (current behaviour)
// ----------------------------------------------------------

const DISABLED_RESPONSE = {
  ok: false,
  mode: 'disabled' as const,
  message:
    'Parser insertion route is not enabled yet. ' +
    'The RPC (insert_parser_output_plan_v1) remains locked until ' +
    'the service_role EXECUTE grant, server-only Supabase client, ' +
    'and Studio auth are in place and approved. ' +
    'See docs/parser-insertion-adapter-design.md §12.',
}

// ----------------------------------------------------------
// POST handler
// ----------------------------------------------------------

export async function POST(_request: NextRequest): Promise<NextResponse> {
  // TODO(auth): When auth is wired, validate Studio session here before anything else.
  //   const authResult = await requireStudioUser()
  //   if (!authResult.ok) return NextResponse.json({ ok: false, message: 'Unauthorised' }, { status: 401 })

  // TODO(auth): Validate manufacturer membership or admin role.
  //   const { sourceDocumentId } = await request.json()
  //   const accessResult = await requireManufacturerAccess(authResult.context.manufacturerId)
  //   if (!accessResult.ok) return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })

  // TODO(insertion): When insertion is enabled, replace this block with:
  //   1. Parse and validate request body
  //   2. Call validateParserOutput(parserOutput) — must be ok: true
  //   3. Call planParserOutputInsertion(parserOutput, { extraction_run_id, manufacturer_id, source_document_id })
  //      — must be ok: true, planningErrors === 0
  //   4. Call insertParserOutputServerSide(parserOutput, context, plan)
  //   5. Return 200 with inserted counts and id_maps

  return NextResponse.json(DISABLED_RESPONSE, { status: 501 })
}

// ----------------------------------------------------------
// Reject non-POST methods explicitly
// ----------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, message: 'Method not allowed. Use POST.' },
    { status: 405 },
  )
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, message: 'Method not allowed. Use POST.' },
    { status: 405 },
  )
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, message: 'Method not allowed. Use POST.' },
    { status: 405 },
  )
}
