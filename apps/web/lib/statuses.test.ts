import { describe, it, expect } from 'vitest'
import {
  VERIFICATION_STATUS_LABELS,
  verificationStatusLabel,
  CARD_STAGE_LABELS,
  resolveCardStage,
  PACKAGE_STATUS_LABELS,
  packageStatusLabel,
  type CardStage,
} from './statuses'

describe('verificationStatusLabel', () => {
  it.each([
    ['pending_review', 'Submitted'],
    ['in_review', 'Under Review'],
    ['manufacturer_verified', 'Manufacturer Verified'],
    ['rejected', 'Changes requested'],
    ['needs_source_check', 'Needs source check'],
    ['archived', 'Archived'],
  ])('maps the DB value %p to %p', (status, label) => {
    expect(verificationStatusLabel(status)).toBe(label)
  })

  it('humanises an unmapped status instead of showing a raw enum', () => {
    expect(verificationStatusLabel('some_new_status')).toBe('some new status')
  })

  it('covers every documented status label', () => {
    for (const [status, label] of Object.entries(VERIFICATION_STATUS_LABELS)) {
      expect(verificationStatusLabel(status)).toBe(label)
    }
  })
})

describe('resolveCardStage', () => {
  it('returns submitted for a freshly extracted card', () => {
    expect(resolveCardStage({ verificationStatus: 'pending_review', buildquoteApproved: false })).toBe(
      'submitted',
    )
  })

  it('returns under_review while the manufacturer is checking it', () => {
    expect(resolveCardStage({ verificationStatus: 'in_review', buildquoteApproved: false })).toBe(
      'under_review',
    )
  })

  it('returns manufacturer_verified once verified but not approved', () => {
    expect(
      resolveCardStage({ verificationStatus: 'manufacturer_verified', buildquoteApproved: false }),
    ).toBe('manufacturer_verified')
  })

  it('returns buildquote_approved once production_system_id is set', () => {
    expect(
      resolveCardStage({ verificationStatus: 'manufacturer_verified', buildquoteApproved: true }),
    ).toBe('buildquote_approved')
  })

  it('returns package_generated over approval', () => {
    expect(
      resolveCardStage({
        verificationStatus: 'manufacturer_verified',
        buildquoteApproved: true,
        packageGenerated: true,
      }),
    ).toBe('package_generated')
  })

  it('returns exported as the furthest stage', () => {
    expect(
      resolveCardStage({
        verificationStatus: 'manufacturer_verified',
        buildquoteApproved: true,
        packageGenerated: true,
        exported: true,
      }),
    ).toBe('exported')
  })

  it('reports the furthest stage reached even when earlier signals are absent', () => {
    // A card exported before its verification flag was updated still shows as
    // exported — the stage is "furthest reached", not a strict state machine.
    expect(resolveCardStage({ verificationStatus: 'pending_review', buildquoteApproved: false, exported: true })).toBe(
      'exported',
    )
  })

  it('falls back to submitted for an unrecognised status', () => {
    expect(resolveCardStage({ verificationStatus: 'archived', buildquoteApproved: false })).toBe(
      'submitted',
    )
  })

  it('has a label for every stage it can return', () => {
    const stages: CardStage[] = [
      'submitted',
      'under_review',
      'manufacturer_verified',
      'buildquote_approved',
      'package_generated',
      'exported',
    ]
    for (const stage of stages) expect(CARD_STAGE_LABELS[stage]).toBeTruthy()
  })
})

describe('packageStatusLabel', () => {
  it.each(Object.entries(PACKAGE_STATUS_LABELS))('maps %p to %p', (status, label) => {
    expect(packageStatusLabel(status)).toBe(label)
  })

  it('humanises an unmapped package status', () => {
    expect(packageStatusLabel('queued_for_retry')).toBe('queued for retry')
  })
})
