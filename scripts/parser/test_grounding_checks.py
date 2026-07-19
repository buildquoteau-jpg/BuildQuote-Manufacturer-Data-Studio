"""Unit tests for run_grounding_checks() in run_parser.py — the deterministic,
non-LLM cross-check that grounds every extracted product_code/uom/dimension
against the source chunk text it was actually extracted from. Written for the
2026-07-18 audit's US71/US92 hallucination class: a product_code invented by
one chunk's isolated Claude call that never appears anywhere in that chunk's
source text.

    ./.venv-docling/Scripts/python.exe scripts/parser/test_grounding_checks.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_parser import run_grounding_checks  # noqa: E402

CHUNK_TEXT = (
    "AVENUE DECKING RANGE  Stocked Colours: Antique, Teak. Walnut  "
    "US92  138mm x 29mm  4.88m  40  7  1.43  2.7  P2  N/A  17  N/A  450mm  N/A  "
    "US93  138mm x 29mm  4.88m  40  7  1.43  2.9  P2  N/A  N/A  N/A  450mm  N/A"
)
CHUNKS = [{"chunk_no": 1, "page_start": 1, "page_end": 7, "text": CHUNK_TEXT}]


def _profile(**overrides):
    row = {
        "_chunk_no": 1, "profile_name": "US92 board", "product_code": "US92",
        "dimensions": "138mm x 29mm", "uom": "board",
        "length_mm": None, "width_mm": 138, "height_mm": None, "thickness_mm": None,
        "depth_mm": None, "gauge_mm": None, "diameter_mm": None, "roll_m": None, "length_m": None,
    }
    row.update(overrides)
    return row


class GroundingCheckTests(unittest.TestCase):
    def test_real_product_code_in_source_is_not_flagged(self):
        row = _profile()
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertEqual(issues, [])
        self.assertIsNone(row.get("parser_notes"))

    def test_hallucinated_product_code_is_flagged_high_severity(self):
        # US71H never appears anywhere in this chunk's text — the real-world
        # US71/US92 hallucination shape from the 2026-07-18 audit.
        row = _profile(profile_name="US71H board", product_code="US71H", dimensions="210mm x 36mm", width_mm=210)
        issues = run_grounding_checks([], [row], [], CHUNKS)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["type"], "product_code_not_in_source")
        self.assertEqual(issues[0]["severity"], "high")
        self.assertIn("US71H", issues[0]["detail"])

        # And it must land on the row's own parser_notes for Verify Systems.
        notes = row["parser_notes"]
        self.assertEqual(len(notes), 1)
        self.assertEqual(notes[0]["qa_flag"], "product_code_not_in_source")
        self.assertEqual(notes[0]["source"], "grounding_check")
        self.assertTrue(notes[0]["needs_human_review"])

    def test_product_code_from_a_different_chunk_is_flagged(self):
        # Code is real, but attributed to the wrong chunk — same failure mode
        # (misattribution across chunk boundaries), same flag.
        other_chunk_text = "US49C  138mm x 25mm  5.4m  50  7  1.3  3.9  P2/P5"
        chunks = CHUNKS + [{"chunk_no": 2, "page_start": 8, "page_end": 14, "text": other_chunk_text}]
        row = _profile(profile_name="US49C board", product_code="US49C", dimensions="138mm x 25mm")
        issues = run_grounding_checks([], [row], [], chunks)
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["type"], "product_code_not_in_source")

    def test_dimension_not_matching_raw_string_is_flagged(self):
        row = _profile(width_mm=999)  # source says 138mm x 29mm — 999 appears nowhere
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertTrue(any(i["type"] == "dimension_not_in_source_string" for i in issues))

    def test_small_rounding_noise_in_dimensions_is_not_flagged(self):
        row = _profile(width_mm=138.3)  # within tolerance of the "138" in the raw string
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertFalse(any(i["type"] == "dimension_not_in_source_string" for i in issues))

    def test_unrecognised_uom_is_flagged_low_severity(self):
        row = _profile(uom="sproings")
        issues = run_grounding_checks([], [row], [], CHUNKS)
        uom_issues = [i for i in issues if i["type"] == "uom_not_recognised"]
        self.assertEqual(len(uom_issues), 1)
        self.assertEqual(uom_issues[0]["severity"], "low")

    def test_known_uom_variants_are_not_flagged(self):
        for uom in ("board", "sheet", "each", "roll", "lm", "m2", "kg", "pack"):
            row = _profile(uom=uom)
            issues = run_grounding_checks([], [row], [], CHUNKS)
            self.assertFalse(
                any(i["type"] == "uom_not_recognised" for i in issues),
                f"uom '{uom}' should be in the allowlist",
            )

    def test_implausible_numeric_value_is_flagged(self):
        row = _profile(length_mm=99999999)
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertTrue(any(i["type"] == "numeric_implausible" for i in issues))

    def test_plausible_numeric_value_is_not_flagged(self):
        row = _profile(length_mm=4880)
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertFalse(any(i["type"] == "numeric_implausible" for i in issues))

    def test_grounding_applies_to_systems_and_components_too(self):
        system = {"_chunk_no": 1, "name": "sys", "product_code": "GHOST-CODE"}
        component = {"_chunk_no": 1, "name": "comp", "sku": "GHOST-SKU", "uom": "each"}
        issues = run_grounding_checks([system], [], [component], CHUNKS)
        types_and_targets = {(i["type"], i["detail"][:4]) for i in issues}
        self.assertTrue(any(i["type"] == "product_code_not_in_source" and "GHOST-CODE" in i["detail"] for i in issues))
        self.assertTrue(any(i["type"] == "product_code_not_in_source" and "GHOST-SKU" in i["detail"] for i in issues))

    def test_missing_chunk_is_a_no_op_not_a_crash(self):
        # A row with no _chunk_no (or one that doesn't match any known
        # chunk) can't be grounded — must be skipped silently, not flagged
        # as a false positive and not raise.
        row = _profile(_chunk_no=999)
        issues = run_grounding_checks([], [row], [], CHUNKS)
        self.assertEqual([i for i in issues if i["type"] == "product_code_not_in_source"], [])


if __name__ == "__main__":
    unittest.main()
