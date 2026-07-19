"""Unit tests for run_extraction_eval.py's scoring logic — no API calls, no
subprocess. Builds synthetic plans directly (in the same shape run_parser.py
saves to .local/parser-dry-run/plan_*.json) against the real james-hardie
golden fixture, so the diffing logic itself is proven correct independent of
whether any real docling-output/manufacturer-id is available locally.

    ./.venv-docling/Scripts/python.exe scripts/eval/test_run_extraction_eval.py
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_extraction_eval import (  # noqa: E402
    flatten_golden, flatten_plan, score_systems, score_profiles, DIMENSION_FIELDS,
)

GOLDEN_PATH = Path(__file__).resolve().parent / "golden" / "james-hardie.json"


def _plan_from_golden(golden, drop_systems=(), drop_profile_codes=(), mutate_profile_code=None, mutate_field=None,
                       add_extra_system=None, add_extra_profile=None):
    """Build a plan dict (same shape as plan_*.json) from the golden fixture,
    with optional deliberate corruptions to exercise missing/extra/mismatch."""
    staged_systems = []
    for i, s in enumerate(golden["systems"]):
        if s["name"] in drop_systems:
            continue
        staged_systems.append({"_temp_key": f"system_{i}", "name": s["name"], "product_code": s.get("product_code")})

    name_to_key = {s["name"]: s["_temp_key"] for s in staged_systems}

    staged_profiles = []
    pi = 0
    for s in golden["systems"]:
        if s["name"] in drop_systems:
            continue
        for p in s.get("profiles", []):
            if p.get("product_code") in drop_profile_codes:
                pi += 1
                continue
            row = {"_temp_key": f"profile_{pi}", "_staged_system_temp_key": name_to_key[s["name"]]}
            row.update({f: p.get(f) for f in ("profile_name", "product_code", "dimensions", "uom")})
            for f in DIMENSION_FIELDS:
                row[f] = p.get(f)
            if mutate_profile_code and p.get("product_code") == mutate_profile_code:
                row[mutate_field[0]] = mutate_field[1]
            staged_profiles.append(row)
            pi += 1

    if add_extra_system:
        staged_systems.append({"_temp_key": "system_extra", "name": add_extra_system, "product_code": None})
    if add_extra_profile:
        staged_profiles.append({
            "_temp_key": "profile_extra",
            "_staged_system_temp_key": staged_systems[0]["_temp_key"],
            "profile_name": add_extra_profile, "product_code": "NOT-IN-GOLDEN",
            "dimensions": "999 x 999 mm", "uom": "each",
            **{f: None for f in DIMENSION_FIELDS},
        })

    return {"stagedSystems": staged_systems, "stagedSystemProfiles": staged_profiles,
            "stagedSystemColours": [], "stagedComponents": [], "stagedSystemComponents": []}


class ScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
        cls.golden_systems, cls.golden_profiles = flatten_golden(cls.golden)

    def test_perfect_plan_scores_1_0(self):
        plan = _plan_from_golden(self.golden)
        plan_systems, plan_profiles = flatten_plan(plan)

        sm = score_systems(self.golden_systems, plan_systems)
        pm = score_profiles(self.golden_profiles, plan_profiles)

        self.assertEqual(sm["precision"], 1.0)
        self.assertEqual(sm["recall"], 1.0)
        self.assertEqual(sm["f1"], 1.0)
        self.assertEqual(sm["missing"], [])
        self.assertEqual(sm["extra"], [])

        self.assertEqual(pm["precision"], 1.0)
        self.assertEqual(pm["recall"], 1.0)
        self.assertEqual(pm["f1"], 1.0)
        self.assertEqual(pm["missing"], [])
        self.assertEqual(pm["extra"], [])
        self.assertEqual(pm["mismatched"], [])

    def test_dropped_system_and_its_profiles_reduce_recall_not_precision(self):
        dropped_name = self.golden["systems"][0]["name"]
        plan = _plan_from_golden(self.golden, drop_systems={dropped_name})
        plan_systems, plan_profiles = flatten_plan(plan)

        sm = score_systems(self.golden_systems, plan_systems)
        self.assertEqual(sm["missing"], [dropped_name])
        self.assertEqual(sm["precision"], 1.0, "everything the plan DID emit was correct")
        self.assertLess(sm["recall"], 1.0)

        pm = score_profiles(self.golden_profiles, plan_profiles)
        dropped_profile_names = {p["profile_name"] for p in self.golden["systems"][0]["profiles"]}
        missing_names = {m["profile_name"] for m in pm["missing"]}
        self.assertTrue(dropped_profile_names.issubset(missing_names))

    def test_hallucinated_product_code_shows_as_extra_and_drags_precision(self):
        plan = _plan_from_golden(self.golden, add_extra_profile="Totally Invented Profile")
        plan_systems, plan_profiles = flatten_plan(plan)
        pm = score_profiles(self.golden_profiles, plan_profiles)

        self.assertEqual(len(pm["extra"]), 1)
        self.assertEqual(pm["extra"][0]["product_code"], "NOT-IN-GOLDEN")
        self.assertEqual(pm["recall"], 1.0, "nothing real was missed")
        self.assertLess(pm["precision"], 1.0, "the hallucinated row must cost precision")

    def test_dimension_mismatch_is_flagged_but_still_counts_as_a_match(self):
        some_code = self.golden["systems"][0]["profiles"][0]["product_code"]
        plan = _plan_from_golden(
            self.golden,
            mutate_profile_code=some_code,
            mutate_field=("length_mm", 999999),  # wildly different from golden
        )
        plan_systems, plan_profiles = flatten_plan(plan)
        pm = score_profiles(self.golden_profiles, plan_profiles)

        self.assertEqual(pm["recall"], 1.0, "still matched by product_code — a mismatch is not a miss")
        self.assertEqual(len(pm["mismatched"]), 1)
        self.assertIn("length_mm", pm["mismatched"][0]["mismatched_fields"])
        self.assertEqual(pm["mismatched"][0]["product_code"], some_code)

    def test_small_rounding_difference_is_not_flagged(self):
        some_code = self.golden["systems"][0]["profiles"][0]["product_code"]
        golden_len = self.golden["systems"][0]["profiles"][0]["length_mm"]
        plan = _plan_from_golden(
            self.golden,
            mutate_profile_code=some_code,
            mutate_field=("length_mm", golden_len + 0.3),  # within tolerance
        )
        plan_systems, plan_profiles = flatten_plan(plan)
        pm = score_profiles(self.golden_profiles, plan_profiles)

        self.assertEqual(pm["mismatched"], [])

    def test_extra_system_reduces_precision_not_recall(self):
        plan = _plan_from_golden(self.golden, add_extra_system="Invented System That Does Not Exist")
        plan_systems, plan_profiles = flatten_plan(plan)
        sm = score_systems(self.golden_systems, plan_systems)

        self.assertEqual(sm["recall"], 1.0)
        self.assertLess(sm["precision"], 1.0)
        self.assertIn("Invented System That Does Not Exist", sm["extra"])


if __name__ == "__main__":
    unittest.main()
