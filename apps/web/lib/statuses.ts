// Central status vocabulary for the System Card model.
//
// BuildQuote is the card factory, not the public card warehouse. The flow is:
//
//   Submitted → Under Review → Manufacturer Verified → BuildQuote Approved
//     → Ready to Package → Package Generated → Exported / Delivered
//
// DB values are deliberately unchanged (renaming them would touch the parser,
// publish RPCs and RLS-tested code). This module maps stored values to the
// new-model display language, so all UI copy comes from one place:
//
//   staged_systems.verification_status
//     pending_review        → "Submitted"          (extracted, awaiting manufacturer)
//     in_review             → "Under Review"       (manufacturer is checking it)
//     manufacturer_verified → "Manufacturer Verified"
//     archived              → hidden
//
//   production_system_id set → "BuildQuote Approved"
//     (the admin "publish batch" step is, in new-model language, BuildQuote
//      approving the card into the approved source data — NOT public hosting)
//
//   Package layer (card_packages / card_package_items):
//     approved + readiness checks pass → "Ready to Package"
//     included in a generated package  → "Package Generated"
//     package downloaded/delivered     → "Exported"

export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Submitted',
  in_review: 'Under Review',
  manufacturer_verified: 'Manufacturer Verified',
  rejected: 'Changes requested',
  needs_source_check: 'Needs source check',
  archived: 'Archived',
}

export function verificationStatusLabel(status: string): string {
  return VERIFICATION_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

// Card lifecycle stages for progress strips / badges.
export type CardStage =
  | 'submitted'
  | 'under_review'
  | 'manufacturer_verified'
  | 'buildquote_approved'
  | 'ready_to_package'
  | 'package_generated'
  | 'exported'

export const CARD_STAGE_LABELS: Record<CardStage, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  manufacturer_verified: 'Manufacturer Verified',
  buildquote_approved: 'BuildQuote Approved',
  ready_to_package: 'Ready to Package',
  package_generated: 'Package Generated',
  exported: 'Exported',
}

// Resolve the furthest stage a card has reached from what the DB records.
export function resolveCardStage(opts: {
  verificationStatus: string
  buildquoteApproved: boolean   // production_system_id !== null
  packageGenerated?: boolean    // appears in a generated package
  exported?: boolean            // that package was downloaded/delivered
}): CardStage {
  if (opts.exported) return 'exported'
  if (opts.packageGenerated) return 'package_generated'
  if (opts.buildquoteApproved) return 'buildquote_approved'
  if (opts.verificationStatus === 'manufacturer_verified') return 'manufacturer_verified'
  if (opts.verificationStatus === 'in_review') return 'under_review'
  return 'submitted'
}

// Package record statuses (card_packages.status).
export const PACKAGE_STATUS_LABELS: Record<string, string> = {
  generating: 'Generating…',
  generated: 'Package Generated',
  downloaded: 'Exported / Delivered',
  failed: 'Generation failed',
  superseded: 'Superseded',
}

export function packageStatusLabel(status: string): string {
  return PACKAGE_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}
