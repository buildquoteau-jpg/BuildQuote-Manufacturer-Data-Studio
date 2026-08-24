// Single source-controlled switch for the new System Workspace (design doc
// Part B — replaces Verify systems + Asset picker + Preview + Publish-card
// with one page per system). Same pattern as systemCardV2Flag.ts.
//
// While false, /manufacturer/workspace/[systemId] redirects to the existing
// /manufacturer/cms/[systemId] editor — nothing about the old workspace
// changes until this flips true and stays flipped through real use (design
// doc §14 step 10: delete the old UI only after that).
export const WORKSPACE_REDESIGN_ENABLED = true
