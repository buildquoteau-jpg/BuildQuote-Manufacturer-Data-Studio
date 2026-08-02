// Single source-controlled switch between the original system-card-renderer
// (components/system-card-renderer/HostedCardPage) and System Card V2
// (components/system-card-v2/HostedCardPageV2) on the real hosted card
// routes: /cards/[mfr]/[slug] and /cards/[mfr]/[slug]/v/[version].
//
// To revert to the original renderer, flip this back to false — nothing
// else needs to change. The original renderer is untouched and still fully
// present in the repo either way.
export const SYSTEM_CARD_V2_ENABLED = true
