"""table_stitcher.py — merge markdown table rows split across a Docling chunk boundary.

WHY: extract_docling_chunked.py splits large PDFs into 7-page chunks purely to
stay under Docling's memory ceiling (see that script's docstring) — it is not
a semantic boundary. run_parser.py's split_into_chunks() then reuses those
exact same boundaries as the LLM context windows for extraction. When a spec
table straddles page 7/8 of a chunk pair, its header + first rows land in
chunk N and its remaining rows land as an orphan headerless block at the very
start of chunk N+1. Each chunk is parsed by an isolated Claude call with no
visibility into the other, so the tail rows are either dropped (chunk N+1's
extractor has no header to make sense of the columns) or duplicated (both
extractors independently reconstruct the same product from partial context).
This happened on NewTechWood's US49C / US54C / US92 decking spec tables.

This module detects exactly that shape — a table's rows ending at the very
end of chunk N, continued by same-width headerless rows at the very start of
chunk N+1 — and moves the continuation rows back into chunk N before the
chunks are ever sent to Claude. Original page ranges are left untouched on
both chunks; this only relocates markdown text for LLM-context purposes, it
does not change provenance.
"""

import re

_TABLE_ROW_RE = re.compile(r'^\|.*\|$')
_TABLE_SEP_RE = re.compile(r'^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$')


def _cell_count(row):
    """Number of columns in a `| a | b | c |` row, ignoring the outer pipes."""
    stripped = row.strip()
    if stripped.startswith('|'):
        stripped = stripped[1:]
    if stripped.endswith('|'):
        stripped = stripped[:-1]
    return len(stripped.split('|'))


def _trailing_table_block(text):
    """Contiguous run of `| ... |` rows at the very end of `text` (trailing
    blank lines ignored). Returns (lines_before_block, block_lines)."""
    lines = text.splitlines()
    end = len(lines)
    while end > 0 and not lines[end - 1].strip():
        end -= 1
    start = end
    while start > 0 and _TABLE_ROW_RE.match(lines[start - 1].strip()):
        start -= 1
    return lines[:start], lines[start:end]


def _leading_continuation_block(text):
    """Contiguous run of `| ... |` rows at the very start of `text` — but
    only if they are NOT a fresh table's header (a header is immediately
    followed by a `|---|---|` separator row; a continuation never is,
    because its header already lives in the previous chunk).

    Returns (block_start_line_idx, block_end_line_idx, all_lines). An empty
    block (start == end) means "nothing to stitch here"."""
    lines = text.splitlines()
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    start = i
    if start >= len(lines) or not _TABLE_ROW_RE.match(lines[start].strip()):
        return start, start, lines
    if start + 1 < len(lines) and _TABLE_SEP_RE.match(lines[start + 1].strip()):
        return start, start, lines  # header + separator => a NEW table
    end = start
    while (end < len(lines)
           and _TABLE_ROW_RE.match(lines[end].strip())
           and not _TABLE_SEP_RE.match(lines[end].strip())):
        end += 1
    return start, end, lines


def stitch_split_tables(chunks):
    """Given the list of chunk dicts from split_into_chunks() (each with
    chunk_no / page_start / page_end / text), return a new list with the
    same chunks, but with any table rows that spilled into the start of a
    following chunk relocated back into the chunk whose table they belong
    to. Chunk count, order, and page ranges are unchanged — only `text`
    is edited, and only chunks that actually needed stitching change.
    """
    chunks = [dict(c) for c in chunks]  # don't mutate the caller's list/dicts
    stitched = 0

    for i in range(len(chunks) - 1):
        cur, nxt = chunks[i], chunks[i + 1]

        prefix_lines, trailing_rows = _trailing_table_block(cur["text"])
        if not trailing_rows:
            continue
        # Column count of the last row cur's table ends on — the join key
        # that tells us whether nxt's leading rows are really this table's
        # continuation, or an unrelated table that happens to start at the
        # top of the next chunk.
        target_width = _cell_count(trailing_rows[-1])

        block_start, block_end, nxt_lines = _leading_continuation_block(nxt["text"])
        if block_start == block_end:
            continue

        matching = []
        for row in nxt_lines[block_start:block_end]:
            if _cell_count(row) != target_width:
                break
            matching.append(row)
        if not matching:
            continue

        cur["text"] = "\n".join(prefix_lines + trailing_rows + matching).rstrip("\n") + "\n"
        remaining_lines = nxt_lines[:block_start] + nxt_lines[block_start + len(matching):]
        nxt["text"] = "\n".join(remaining_lines).strip("\n")
        stitched += 1

    if stitched:
        print(f"  [stitch] merged split table rows across {stitched} chunk boundary/boundaries")

    return chunks
