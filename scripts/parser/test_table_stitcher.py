"""Unit tests for table_stitcher.py.

Stdlib-only (unittest) so it runs in .venv-docling, which has no pytest:

    ./.venv-docling/Scripts/python.exe scripts/parser/test_table_stitcher.py

The split-table fixtures below model the real NewTechWood failure this was
written for: the Terrace/Coastal/Avenue decking spec table (product codes
US49C, US63C, US54C, US142C, US92, US93 — see
.local/docling-output/newtechwood_merged.md) landed with its header + first
rows in one 7-page Docling chunk and its remaining rows as a headerless
continuation at the very start of the next chunk.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from table_stitcher import stitch_split_tables  # noqa: E402


def _chunk(chunk_no, page_start, page_end, text):
    return {"chunk_no": chunk_no, "page_start": page_start, "page_end": page_end, "text": text}


class StitchSplitTablesTests(unittest.TestCase):
    def test_stitches_headerless_continuation_rows_into_prior_chunk(self):
        # NewTechWood decking spec table: header + 2 rows land in chunk 1
        # (end of page 7), the remaining 4 rows spill into chunk 2 (page 8)
        # with no header of their own.
        chunk1 = _chunk(1, 1, 7, (
            "## DECKING SPECIFICATION TABLE\n\n"
            "| Profile Code | Dimensions | Length | Qty/Pack |\n"
            "|---|---|---|---|\n"
            "| US92 | 138mm x 29mm | 4.88m | 40 |\n"
            "| US93 | 138mm x 29mm | 4.88m | 40 |\n"
        ))
        chunk2 = _chunk(2, 8, 14, (
            "| US49C | 138mm x 25mm | 5.4m | 50 |\n"
            "| US63C | 138mm x 25mm | 5.4m | 30 |\n"
            "| US54C | 210mm x 23mm | 4.88m | 50 |\n"
            "| US142C | 138mm x 23mm | 4.88m | 30 |\n"
            "\n"
            "## FASCIA INSTALLATION\n"
            "\n"
            "Some unrelated prose that follows the table.\n"
        ))

        stitched = stitch_split_tables([chunk1, chunk2])

        self.assertEqual(len(stitched), 2, "chunk count must be unchanged")
        self.assertEqual(stitched[0]["page_start"], 1)
        self.assertEqual(stitched[0]["page_end"], 7)
        self.assertEqual(stitched[1]["page_start"], 8)
        self.assertEqual(stitched[1]["page_end"], 14)

        merged_text = stitched[0]["text"]
        for code in ("US92", "US93", "US49C", "US63C", "US54C", "US142C"):
            self.assertIn(code, merged_text, f"{code} row should now be in chunk 1")

        # All 6 data rows must land in chunk 1 exactly once — no drops, no dupes.
        self.assertEqual(merged_text.count("| US"), 6)

        # The rows must be gone from chunk 2's text (not duplicated).
        for code in ("US49C", "US63C", "US54C", "US142C"):
            self.assertNotIn(code, stitched[1]["text"], f"{code} must not remain in chunk 2 (would duplicate)")

        # Content that followed the table in chunk 2 must survive untouched.
        self.assertIn("FASCIA INSTALLATION", stitched[1]["text"])
        self.assertIn("Some unrelated prose", stitched[1]["text"])

    def test_does_not_merge_a_genuinely_new_table_at_chunk_start(self):
        # Chunk 2 opens with its OWN header + separator — a fresh table, not
        # a continuation. Must be left alone even though the column count
        # happens to match.
        chunk1 = _chunk(1, 1, 7, (
            "| Profile Code | Dimensions | Length | Qty/Pack |\n"
            "|---|---|---|---|\n"
            "| US92 | 138mm x 29mm | 4.88m | 40 |\n"
        ))
        chunk2 = _chunk(2, 8, 14, (
            "| Accessory Code | Description | Screw Options | Notes |\n"
            "|---|---|---|---|\n"
            "| MG3 | Starter Clip | Timber Fix | Use if starting a deck |\n"
        ))

        stitched = stitch_split_tables([chunk1, chunk2])

        self.assertEqual(stitched[0]["text"], chunk1["text"])
        self.assertEqual(stitched[1]["text"], chunk2["text"])

    def test_does_not_merge_mismatched_column_counts(self):
        chunk1 = _chunk(1, 1, 7, (
            "| Profile Code | Dimensions | Length |\n"
            "|---|---|---|\n"
            "| US92 | 138mm x 29mm | 4.88m |\n"
        ))
        chunk2 = _chunk(2, 8, 14, (
            "| MG3 | Starter Clip | Timber Fix | Use if starting a deck |\n"
        ))

        stitched = stitch_split_tables([chunk1, chunk2])

        self.assertEqual(stitched[0]["text"], chunk1["text"])
        self.assertEqual(stitched[1]["text"], chunk2["text"])

    def test_no_table_at_boundary_is_a_no_op(self):
        chunk1 = _chunk(1, 1, 7, "## Some heading\n\nJust prose, no tables here.\n")
        chunk2 = _chunk(2, 8, 14, "More prose in the next chunk.\n")

        stitched = stitch_split_tables([chunk1, chunk2])

        self.assertEqual(stitched[0]["text"], chunk1["text"])
        self.assertEqual(stitched[1]["text"], chunk2["text"])

    def test_stitches_across_multiple_boundaries_independently(self):
        # Two separate split tables, each spanning its own chunk pair.
        chunk1 = _chunk(1, 1, 7, "| A | B |\n|---|---|\n| US92 | 40 |\n")
        chunk2 = _chunk(2, 8, 14, "| US93 | 40 |\n")
        chunk3 = _chunk(3, 15, 21, "| C | D | E |\n|---|---|---|\n| US54C | 4.88m | 50 |\n")
        chunk4 = _chunk(4, 22, 28, "| US142C | 4.88m | 30 |\n")

        stitched = stitch_split_tables([chunk1, chunk2, chunk3, chunk4])

        self.assertIn("US93", stitched[0]["text"])
        self.assertNotIn("US93", stitched[1]["text"])
        self.assertIn("US142C", stitched[2]["text"])
        self.assertNotIn("US142C", stitched[3]["text"])

    def test_input_list_and_dicts_are_not_mutated(self):
        chunk1 = _chunk(1, 1, 7, "| A | B |\n|---|---|\n| US92 | 40 |\n")
        chunk2 = _chunk(2, 8, 14, "| US93 | 40 |\n")
        original_text_1 = chunk1["text"]
        original_text_2 = chunk2["text"]

        stitch_split_tables([chunk1, chunk2])

        self.assertEqual(chunk1["text"], original_text_1)
        self.assertEqual(chunk2["text"], original_text_2)


if __name__ == "__main__":
    unittest.main()
