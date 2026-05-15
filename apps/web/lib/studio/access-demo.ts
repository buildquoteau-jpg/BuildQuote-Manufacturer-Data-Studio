// BuildQuote Data Studio — Access helper dry-run demo.
//
// Demonstrates the pure access-check functions in access.ts using
// hand-constructed mock contexts. No database access, no auth session needed.
//
// All five scenarios:
//   1. buildquote_admin      → universal access, can publish
//   2. buildquote_reviewer   → review access, cannot publish
//   3. manufacturer_admin    → own workspace only, cannot publish
//   4. manufacturer_reviewer → own workspace review, cannot publish
//   5. manufacturer_viewer   → own workspace read-only, cannot review or publish
//
// Run with:
//   npx tsx apps/web/lib/studio/access-demo.ts

import {
  canAccessManufacturer,
  canPublishToProduction,
  canReviewManufacturerData,
  type StudioAccessContext,
} from './access'

// ============================================================
// Mock contexts
// ============================================================

const MFR_A = 'mfr-00000000-aaaa-0000-0000-000000000001'
const MFR_B = 'mfr-00000000-bbbb-0000-0000-000000000002'

const ctxAdmin: StudioAccessContext = {
  isAuthWired: false,
  user: { id: 'u1', email: 'admin@buildquote.com.au', displayName: 'BQ Admin', globalRole: 'buildquote_admin', status: 'active' },
  memberships: [],
}

const ctxReviewer: StudioAccessContext = {
  isAuthWired: false,
  user: { id: 'u2', email: 'reviewer@buildquote.com.au', displayName: 'BQ Reviewer', globalRole: 'buildquote_reviewer', status: 'active' },
  memberships: [],
}

const ctxMfrAdmin: StudioAccessContext = {
  isAuthWired: false,
  user: { id: 'u3', email: 'admin@acmealuminium.com.au', displayName: 'Acme Admin', globalRole: 'manufacturer_user', status: 'active' },
  memberships: [
    { manufacturerId: MFR_A, role: 'manufacturer_admin', status: 'active' },
  ],
}

const ctxMfrReviewer: StudioAccessContext = {
  isAuthWired: false,
  user: { id: 'u4', email: 'reviewer@acmealuminium.com.au', displayName: 'Acme Reviewer', globalRole: 'manufacturer_user', status: 'active' },
  memberships: [
    { manufacturerId: MFR_A, role: 'manufacturer_reviewer', status: 'active' },
  ],
}

const ctxMfrViewer: StudioAccessContext = {
  isAuthWired: false,
  user: { id: 'u5', email: 'viewer@acmealuminium.com.au', displayName: 'Acme Viewer', globalRole: 'manufacturer_user', status: 'active' },
  memberships: [
    { manufacturerId: MFR_A, role: 'manufacturer_viewer', status: 'active' },
  ],
}

// ============================================================
// Helpers
// ============================================================

function pass(result: boolean, expected: boolean, label: string): string {
  const ok = result === expected
  return `  ${ok ? '✓' : '✗'} ${label}: ${result} (expected ${expected})${ok ? '' : '  ← FAIL'}`
}

function section(title: string) {
  console.log(`\n${'─'.repeat(56)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(56))
}

// ============================================================
// Scenarios
// ============================================================

section('1. buildquote_admin')
console.log(pass(canAccessManufacturer(ctxAdmin, MFR_A),   true,  'canAccessManufacturer(MFR_A)'))
console.log(pass(canAccessManufacturer(ctxAdmin, MFR_B),   true,  'canAccessManufacturer(MFR_B) — all manufacturers'))
console.log(pass(canPublishToProduction(ctxAdmin),          true,  'canPublishToProduction'))
console.log(pass(canReviewManufacturerData(ctxAdmin, MFR_A), true, 'canReviewManufacturerData(MFR_A)'))
console.log(pass(canReviewManufacturerData(ctxAdmin, MFR_B), true, 'canReviewManufacturerData(MFR_B)'))

section('2. buildquote_reviewer')
console.log(pass(canAccessManufacturer(ctxReviewer, MFR_A),   true,  'canAccessManufacturer(MFR_A)'))
console.log(pass(canAccessManufacturer(ctxReviewer, MFR_B),   true,  'canAccessManufacturer(MFR_B) — all manufacturers'))
console.log(pass(canPublishToProduction(ctxReviewer),          false, 'canPublishToProduction — cannot publish'))
console.log(pass(canReviewManufacturerData(ctxReviewer, MFR_A), true, 'canReviewManufacturerData(MFR_A)'))

section('3. manufacturer_admin (MFR_A only)')
console.log(pass(canAccessManufacturer(ctxMfrAdmin, MFR_A),   true,  'canAccessManufacturer(MFR_A) — own workspace'))
console.log(pass(canAccessManufacturer(ctxMfrAdmin, MFR_B),   false, 'canAccessManufacturer(MFR_B) — other workspace blocked'))
console.log(pass(canPublishToProduction(ctxMfrAdmin),          false, 'canPublishToProduction — cannot publish'))
console.log(pass(canReviewManufacturerData(ctxMfrAdmin, MFR_A), true, 'canReviewManufacturerData(MFR_A)'))
console.log(pass(canReviewManufacturerData(ctxMfrAdmin, MFR_B), false, 'canReviewManufacturerData(MFR_B) — no membership'))

section('4. manufacturer_reviewer (MFR_A only)')
console.log(pass(canAccessManufacturer(ctxMfrReviewer, MFR_A),    true,  'canAccessManufacturer(MFR_A)'))
console.log(pass(canAccessManufacturer(ctxMfrReviewer, MFR_B),    false, 'canAccessManufacturer(MFR_B) — blocked'))
console.log(pass(canPublishToProduction(ctxMfrReviewer),           false, 'canPublishToProduction — cannot publish'))
console.log(pass(canReviewManufacturerData(ctxMfrReviewer, MFR_A), true, 'canReviewManufacturerData(MFR_A)'))

section('5. manufacturer_viewer (MFR_A only — read-only)')
console.log(pass(canAccessManufacturer(ctxMfrViewer, MFR_A),    true,  'canAccessManufacturer(MFR_A)'))
console.log(pass(canAccessManufacturer(ctxMfrViewer, MFR_B),    false, 'canAccessManufacturer(MFR_B) — blocked'))
console.log(pass(canPublishToProduction(ctxMfrViewer),           false, 'canPublishToProduction — cannot publish'))
console.log(pass(canReviewManufacturerData(ctxMfrViewer, MFR_A), false, 'canReviewManufacturerData — viewer cannot verify'))

// ============================================================
// Summary
// ============================================================

console.log(`\n${'─'.repeat(56)}`)
console.log('  Note: isAuthWired is false in all contexts above.')
console.log('  The pure functions work correctly regardless.')
console.log('  Stub guards (requireStudioUser etc.) return')
console.log('  { ok: false, reason: "AUTH_NOT_WIRED" } until')
console.log('  Supabase Auth is connected.')
console.log('─'.repeat(56))
