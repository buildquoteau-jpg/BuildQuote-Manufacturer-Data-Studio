# RPC test suite

Tests for `insert_parser_output_plan_v1` (migrations 010/012/057/058). All
assertion failures `RAISE EXCEPTION`, so a failing test exits non-zero — no
eyeballing NOTICE output.

## When to run

**After every migration that touches a `staged_*` table or the parser RPC.**
The 2026-07-18 audit found migration 026 broke every live parser insert for
weeks; running `012_05` once after applying 026 would have caught it the same
day. `012_06` additionally catches the *silent* class — fields the RPC
quietly drops (the `australian_made`/`sheet_format` bug fixed in 058).

## How to run

Supabase SQL editor: paste each file and run — an error banner = failure.

psql (stops at the first failure):

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 `
  -f supabase/tests/012_01_null_payload.sql `
  -f supabase/tests/012_02_missing_keys.sql `
  -f supabase/tests/012_03_unresolved_link.sql `
  -f supabase/tests/012_05_valid_insert.sql `
  -f supabase/tests/012_06_round_trip_field_loss.sql
```

`012_04_row_counts.sql` is a manual before/after snapshot helper, not an
assertion. `012_05` and `012_06` are self-cleaning — they delete every row
they insert. Both need one manufacturer with a `source_documents` row and an
`extraction_runs` row to exist (any real onboarded manufacturer qualifies).
