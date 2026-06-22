import { describe, it, expect } from 'vitest'
import {
  canAccessManufacturer,
  canPublishToProduction,
  canReviewManufacturerData,
  requireStudioUser,
  requireBuildQuoteAdmin,
  requireManufacturerAccess,
  type StudioAccessContext,
  type StudioGlobalRole,
  type ManufacturerMembershipRole,
  type ManufacturerMembershipStatus,
} from './access'

// ============================================================
// Fixtures
// ============================================================

const MFR_A = 'mfr-aaaa'
const MFR_B = 'mfr-bbbb'

function ctx(
  globalRole: StudioGlobalRole | null,
  memberships: Array<{
    manufacturerId: string
    role: ManufacturerMembershipRole
    status?: ManufacturerMembershipStatus
  }> = [],
): StudioAccessContext {
  return {
    isAuthWired: false,
    user: globalRole
      ? { id: 'u', email: 'u@example.com', displayName: null, globalRole, status: 'active' }
      : null,
    memberships: memberships.map((m) => ({
      manufacturerId: m.manufacturerId,
      role: m.role,
      status: m.status ?? 'active',
    })),
  }
}

const anonymous = ctx(null)
const bqAdmin = ctx('buildquote_admin')
const bqReviewer = ctx('buildquote_reviewer')
const mfrAdmin = ctx('manufacturer_user', [{ manufacturerId: MFR_A, role: 'manufacturer_admin' }])
const mfrReviewer = ctx('manufacturer_user', [{ manufacturerId: MFR_A, role: 'manufacturer_reviewer' }])
const mfrViewer = ctx('manufacturer_user', [{ manufacturerId: MFR_A, role: 'manufacturer_viewer' }])
const mfrNoMembership = ctx('manufacturer_user', [])
const mfrSuspended = ctx('manufacturer_user', [
  { manufacturerId: MFR_A, role: 'manufacturer_admin', status: 'suspended' },
])

// ============================================================
// canAccessManufacturer
// ============================================================

describe('canAccessManufacturer', () => {
  it('denies when there is no user', () => {
    expect(canAccessManufacturer(anonymous, MFR_A)).toBe(false)
  })

  it('grants BuildQuote admin universal access', () => {
    expect(canAccessManufacturer(bqAdmin, MFR_A)).toBe(true)
    expect(canAccessManufacturer(bqAdmin, MFR_B)).toBe(true)
  })

  it('grants BuildQuote reviewer universal access', () => {
    expect(canAccessManufacturer(bqReviewer, MFR_A)).toBe(true)
    expect(canAccessManufacturer(bqReviewer, MFR_B)).toBe(true)
  })

  it('grants manufacturer users only their own active workspace', () => {
    expect(canAccessManufacturer(mfrAdmin, MFR_A)).toBe(true)
    expect(canAccessManufacturer(mfrAdmin, MFR_B)).toBe(false)
  })

  it('denies manufacturer users with no membership', () => {
    expect(canAccessManufacturer(mfrNoMembership, MFR_A)).toBe(false)
  })

  it('denies access through a suspended membership', () => {
    expect(canAccessManufacturer(mfrSuspended, MFR_A)).toBe(false)
  })
})

// ============================================================
// canPublishToProduction
// ============================================================

describe('canPublishToProduction', () => {
  it('allows only BuildQuote admin', () => {
    expect(canPublishToProduction(bqAdmin)).toBe(true)
  })

  it('denies everyone else', () => {
    expect(canPublishToProduction(anonymous)).toBe(false)
    expect(canPublishToProduction(bqReviewer)).toBe(false)
    expect(canPublishToProduction(mfrAdmin)).toBe(false)
    expect(canPublishToProduction(mfrReviewer)).toBe(false)
    expect(canPublishToProduction(mfrViewer)).toBe(false)
  })
})

// ============================================================
// canReviewManufacturerData
// ============================================================

describe('canReviewManufacturerData', () => {
  it('denies when there is no user', () => {
    expect(canReviewManufacturerData(anonymous, MFR_A)).toBe(false)
  })

  it('allows BuildQuote admin and reviewer for any manufacturer', () => {
    expect(canReviewManufacturerData(bqAdmin, MFR_A)).toBe(true)
    expect(canReviewManufacturerData(bqAdmin, MFR_B)).toBe(true)
    expect(canReviewManufacturerData(bqReviewer, MFR_A)).toBe(true)
    expect(canReviewManufacturerData(bqReviewer, MFR_B)).toBe(true)
  })

  it('allows manufacturer admin and reviewer for their own workspace', () => {
    expect(canReviewManufacturerData(mfrAdmin, MFR_A)).toBe(true)
    expect(canReviewManufacturerData(mfrReviewer, MFR_A)).toBe(true)
  })

  it('denies manufacturer viewer (read-only) from verifying', () => {
    expect(canReviewManufacturerData(mfrViewer, MFR_A)).toBe(false)
  })

  it('denies review of a manufacturer the user has no membership for', () => {
    expect(canReviewManufacturerData(mfrAdmin, MFR_B)).toBe(false)
    expect(canReviewManufacturerData(mfrNoMembership, MFR_A)).toBe(false)
  })

  it('denies review through a suspended membership', () => {
    expect(canReviewManufacturerData(mfrSuspended, MFR_A)).toBe(false)
  })
})

// ============================================================
// Guard stubs — lock in the current "not wired" behaviour.
// When real Supabase auth is wired into getCurrentStudioAccessContext(),
// these expectations should be updated deliberately (a failing test here
// is the signal that the guards changed behaviour).
// ============================================================

describe('require* guards (auth not wired yet)', () => {
  it('requireStudioUser returns AUTH_NOT_WIRED', async () => {
    await expect(requireStudioUser()).resolves.toEqual({ ok: false, reason: 'AUTH_NOT_WIRED' })
  })

  it('requireBuildQuoteAdmin returns AUTH_NOT_WIRED', async () => {
    await expect(requireBuildQuoteAdmin()).resolves.toEqual({ ok: false, reason: 'AUTH_NOT_WIRED' })
  })

  it('requireManufacturerAccess returns AUTH_NOT_WIRED', async () => {
    await expect(requireManufacturerAccess(MFR_A)).resolves.toEqual({
      ok: false,
      reason: 'AUTH_NOT_WIRED',
    })
  })
})
