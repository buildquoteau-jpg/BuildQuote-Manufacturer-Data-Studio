# Claude Build Plan

Do not build the whole palace.
Build one strong room first.

---

## First Strong Room

Upload one manufacturer product guide, extract it, generate one draft system card, visually verify it beside the source PDF, and export approved data.

That is the complete first vertical slice.

Nothing else matters until that loop closes end-to-end.

---

## Rules for Building

- Prefer working software over complete software.
- Each phase must be demoable before the next phase starts.
- AI suggestions are drafts. Humans close the loop.
- Do not touch production until Phase 6 and only with explicit confirmation.
- If a decision is uncertain, document it in the relevant doc and flag it — do not guess silently.

---

## Starting a New Claude Session

Every new Claude Code session working in this repo should begin by reading:

**[`docs/foundation-summary.md`](./foundation-summary.md)**

It contains the canonical project briefing: three-repo boundaries, storage rules, database layers, parser contract rules, uom naming, dimension fields, the first implementation slice, and Claude Code safety rules.

Do not begin implementation work without reading it first.
