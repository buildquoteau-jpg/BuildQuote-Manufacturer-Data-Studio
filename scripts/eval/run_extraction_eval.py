#!/usr/bin/env python3
"""run_extraction_eval.py — regression eval for the AI parser's extraction
accuracy against a hand-verified golden fixture.

Turns "does the parser still work" from an eyeball check into a number, so
prompt / model / chunking changes (structured outputs, table stitching,
model migrations, ...) can be tested instead of trusted on vibes.

Two ways to get a plan to score:

  1. Live run (costs API tokens): point at a manufacturer's Docling output
     and a manufacturer_id, and this re-runs the AI parser in --dry-run mode
     and scores the plan it produces.

         python scripts/eval/run_extraction_eval.py \
             --manufacturer james-hardie \
             --docling-input ".local/docling-output/<run>/output.md" \
             --manufacturer-id "<uuid>"

  2. Score an existing plan (no API calls, no side effects) — the mode used
     by CI / this repo's own test suite, and the fast path for re-scoring a
     plan you already extracted:

         python scripts/eval/run_extraction_eval.py \
             --manufacturer james-hardie \
             --plan ".local/parser-dry-run/plan_20260719T120000Z.json"

Golden fixtures live in scripts/eval/golden/<slug>.json — see
scripts/eval/golden/build_from_csv.py for how they're built from the
existing hand-verified apps/web/data/extractions/<slug>/*.csv exports.

Exits non-zero if the combined (systems + profiles) F1 score falls below
--threshold (default 0.8), so this is usable as a CI gate.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
GOLDEN_DIR = Path(__file__).resolve().parent / "golden"

sys.path.insert(0, str(REPO_ROOT / "scripts" / "parser"))
from run_parser import normalize_system_name  # noqa: E402 — single source of truth for name matching

DIMENSION_FIELDS = [
    "length_mm", "width_mm", "height_mm", "thickness_mm", "depth_mm",
    "gauge_mm", "diameter_mm", "roll_m", "length_m",
    "weight_kg", "weight_g", "volume_ml", "pieces",
]
NUMERIC_TOLERANCE = 0.51  # absolute — tolerates rounding/unit-format noise, not real mismatches


def _norm_code(code):
    return re.sub(r'\s+', '', (code or "")).strip().upper()


def _num_close(a, b, tol=NUMERIC_TOLERANCE):
    if a is None or b is None:
        return a is None and b is None
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


# ============================================================
# Load a plan — either straight from disk, or by running the parser
# ============================================================

def run_parser_and_load_plan(docling_input, manufacturer_id, manufacturer_name, hints=None, model=None, stage="1"):
    dry_run_dir = REPO_ROOT / ".local/parser-dry-run"
    dry_run_dir.mkdir(parents=True, exist_ok=True)
    before = {p.name for p in dry_run_dir.glob("plan_*.json")}

    cmd = [
        sys.executable, str(REPO_ROOT / "scripts/parser/run_parser.py"),
        "--input", str(docling_input),
        "--manufacturer-id", manufacturer_id,
        "--manufacturer-name", manufacturer_name,
        "--dry-run", "--stage", stage,
    ]
    if hints:
        cmd += ["--hints", str(hints)]
    if model:
        cmd += ["--model", model]

    print(f"[eval] running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        sys.exit(f"[ERROR] parser run failed (exit {result.returncode})")

    after = {p for p in dry_run_dir.glob("plan_*.json") if p.name not in before}
    if not after:
        sys.exit(f"[ERROR] parser run produced no new plan file in {dry_run_dir}")
    plan_path = max(after, key=lambda p: p.stat().st_mtime)
    print(f"[eval] scoring plan: {plan_path}")
    return json.loads(plan_path.read_text(encoding="utf-8")), plan_path


def load_plan_file(plan_path):
    return json.loads(Path(plan_path).read_text(encoding="utf-8")), Path(plan_path)


# ============================================================
# Flatten plan + golden into comparable rows
# ============================================================

def flatten_plan(plan):
    """Returns (systems, profiles) where each profile carries its resolved
    system name (via the plan's own _temp_key / _staged_system_temp_key —
    saved verbatim in plan_*.json alongside the allow-listed fields)."""
    systems_by_key = {}
    systems = []
    for s in plan.get("stagedSystems", []):
        key = s.get("_temp_key")
        systems_by_key[key] = s.get("name")
        systems.append({"name": s.get("name"), "product_code": s.get("product_code")})

    profiles = []
    for p in plan.get("stagedSystemProfiles", []):
        system_name = systems_by_key.get(p.get("_staged_system_temp_key"))
        row = {
            "system_name": system_name,
            "profile_name": p.get("profile_name") or p.get("name"),
            "product_code": p.get("product_code"),
            "dimensions": p.get("dimensions"),
            "uom": p.get("uom"),
        }
        for field in DIMENSION_FIELDS:
            row[field] = p.get(field)
        profiles.append(row)

    return systems, profiles


def flatten_golden(golden):
    systems = [{"name": s["name"], "product_code": s.get("product_code")} for s in golden["systems"]]
    profiles = []
    for s in golden["systems"]:
        for p in s.get("profiles", []):
            row = dict(p)
            row["system_name"] = s["name"]
            profiles.append(row)
    return systems, profiles


# ============================================================
# Matching + scoring
# ============================================================

def score_systems(golden_systems, plan_systems):
    plan_by_name = {}
    for i, s in enumerate(plan_systems):
        n = normalize_system_name(s.get("name") or "")
        if n:
            plan_by_name.setdefault(n, []).append(i)

    matched_plan_idx = set()
    missing, matched = [], []

    for g in golden_systems:
        n = normalize_system_name(g.get("name") or "")
        candidates = plan_by_name.get(n, [])
        idx = next((i for i in candidates if i not in matched_plan_idx), None)
        if idx is None:
            missing.append(g["name"])
        else:
            matched_plan_idx.add(idx)
            matched.append({"golden": g["name"], "plan": plan_systems[idx]["name"]})

    extra = [s["name"] for i, s in enumerate(plan_systems) if i not in matched_plan_idx]

    return _metrics("systems", len(golden_systems), len(plan_systems), len(matched), missing, extra, [])


def score_profiles(golden_profiles, plan_profiles):
    # Primary key: normalized product_code (globally unique in practice).
    # Fallback (golden rows with no product_code): (system, profile_name).
    plan_by_code, plan_by_name = {}, {}
    for i, p in enumerate(plan_profiles):
        code = _norm_code(p.get("product_code"))
        if code:
            plan_by_code.setdefault(code, []).append(i)
        key = (normalize_system_name(p.get("system_name") or ""), normalize_system_name(p.get("profile_name") or ""))
        plan_by_name.setdefault(key, []).append(i)

    matched_plan_idx = set()
    missing, mismatched = [], []
    tp = 0

    for g in golden_profiles:
        idx = None
        code = _norm_code(g.get("product_code"))
        if code:
            idx = next((i for i in plan_by_code.get(code, []) if i not in matched_plan_idx), None)
        if idx is None:
            key = (normalize_system_name(g.get("system_name") or ""), normalize_system_name(g.get("profile_name") or ""))
            idx = next((i for i in plan_by_name.get(key, []) if i not in matched_plan_idx), None)

        if idx is None:
            missing.append({
                "system_name": g.get("system_name"), "profile_name": g.get("profile_name"),
                "product_code": g.get("product_code"),
            })
            continue

        matched_plan_idx.add(idx)
        tp += 1
        plan_row = plan_profiles[idx]
        bad_fields = [f for f in DIMENSION_FIELDS if not _num_close(g.get(f), plan_row.get(f))]
        if (g.get("uom") or "").strip().lower() != (plan_row.get("uom") or "").strip().lower() and g.get("uom"):
            bad_fields.append("uom")
        if bad_fields:
            mismatched.append({
                "system_name": g.get("system_name"), "profile_name": g.get("profile_name"),
                "product_code": g.get("product_code"), "mismatched_fields": bad_fields,
                "golden": {f: g.get(f) for f in bad_fields},
                "plan": {f: plan_row.get(f) for f in bad_fields},
            })

    extra = [
        {"system_name": p.get("system_name"), "profile_name": p.get("profile_name"), "product_code": p.get("product_code")}
        for i, p in enumerate(plan_profiles) if i not in matched_plan_idx
    ]

    metrics = _metrics("profiles", len(golden_profiles), len(plan_profiles), tp, missing, extra, mismatched)
    return metrics


def _metrics(label, n_golden, n_plan, tp, missing, extra, mismatched):
    precision = tp / n_plan if n_plan else (1.0 if n_golden == 0 else 0.0)
    recall = tp / n_golden if n_golden else 1.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {
        "entity": label,
        "golden_count": n_golden,
        "plan_count": n_plan,
        "true_positive": tp,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "missing": missing,
        "extra": extra,
        "mismatched": mismatched,
    }


# ============================================================
# Reporting
# ============================================================

def print_report(report):
    print("\n[eval] === Extraction accuracy ===")
    for entity in report["entities"]:
        print(f"  {entity['entity']:<10} golden={entity['golden_count']:<4} plan={entity['plan_count']:<4} "
              f"tp={entity['true_positive']:<4} precision={entity['precision']:.3f} "
              f"recall={entity['recall']:.3f} f1={entity['f1']:.3f}")
        if entity["missing"]:
            print(f"    missing ({len(entity['missing'])}):")
            for m in entity["missing"][:15]:
                print(f"      - {m}")
            if len(entity["missing"]) > 15:
                print(f"      ... and {len(entity['missing']) - 15} more")
        if entity["extra"]:
            print(f"    extra ({len(entity['extra'])}):")
            for e in entity["extra"][:15]:
                print(f"      - {e}")
            if len(entity["extra"]) > 15:
                print(f"      ... and {len(entity['extra']) - 15} more")
        if entity.get("mismatched"):
            print(f"    mismatched ({len(entity['mismatched'])}):")
            for m in entity["mismatched"][:15]:
                print(f"      - {m['system_name']} / {m['profile_name']} ({m['product_code']}): "
                      f"{m['mismatched_fields']} golden={m['golden']} plan={m['plan']}")
            if len(entity["mismatched"]) > 15:
                print(f"      ... and {len(entity['mismatched']) - 15} more")

    print(f"\n[eval] combined F1: {report['combined_f1']:.3f} (threshold {report['threshold']:.3f}) "
          f"-> {'PASS' if report['pass'] else 'FAIL'}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manufacturer", required=True, help="Golden fixture slug (scripts/eval/golden/<slug>.json)")
    parser.add_argument("--plan", default=None, help="Score an existing plan_*.json instead of running the parser")
    parser.add_argument("--docling-input", default=None, help="Path to Docling output.md — required unless --plan is given")
    parser.add_argument("--manufacturer-id", default=None, help="data_studio_manufacturers.id UUID — required unless --plan is given")
    parser.add_argument("--hints", default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--stage", default="1", help="Golden fixtures only cover systems+profiles (stage 1 output)")
    parser.add_argument("--threshold", type=float, default=0.8, help="Minimum combined (systems+profiles) F1 to pass")
    parser.add_argument("--out-dir", default=str(REPO_ROOT / ".local/eval-results"))
    args = parser.parse_args()

    golden_path = GOLDEN_DIR / f"{args.manufacturer}.json"
    if not golden_path.exists():
        sys.exit(f"[ERROR] No golden fixture for '{args.manufacturer}' — expected {golden_path}\n"
                  f"Build one with: python scripts/eval/golden/build_from_csv.py {args.manufacturer}")
    golden = json.loads(golden_path.read_text(encoding="utf-8"))

    if args.plan:
        plan, plan_path = load_plan_file(args.plan)
    else:
        if not args.docling_input or not args.manufacturer_id:
            sys.exit("[ERROR] --docling-input and --manufacturer-id are required unless --plan is given "
                      "(running the parser calls the Anthropic API and costs tokens)")
        plan, plan_path = run_parser_and_load_plan(
            args.docling_input, args.manufacturer_id,
            golden.get("manufacturer_name", args.manufacturer),
            hints=args.hints, model=args.model, stage=args.stage,
        )

    golden_systems, golden_profiles = flatten_golden(golden)
    plan_systems, plan_profiles = flatten_plan(plan)

    systems_metrics = score_systems(golden_systems, plan_systems)
    profiles_metrics = score_profiles(golden_profiles, plan_profiles)

    n_golden = systems_metrics["golden_count"] + profiles_metrics["golden_count"]
    combined_tp = systems_metrics["true_positive"] + profiles_metrics["true_positive"]
    n_plan = systems_metrics["plan_count"] + profiles_metrics["plan_count"]
    combined_precision = combined_tp / n_plan if n_plan else 0.0
    combined_recall = combined_tp / n_golden if n_golden else 1.0
    combined_f1 = (2 * combined_precision * combined_recall / (combined_precision + combined_recall)
                   if (combined_precision + combined_recall) else 0.0)

    report = {
        "manufacturer": args.manufacturer,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "plan_source": str(plan_path),
        "threshold": args.threshold,
        "entities": [systems_metrics, profiles_metrics],
        "combined_precision": round(combined_precision, 4),
        "combined_recall": round(combined_recall, 4),
        "combined_f1": round(combined_f1, 4),
        "pass": combined_f1 >= args.threshold,
    }

    print_report(report)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_path = out_dir / f"{args.manufacturer}_{ts}.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[eval] report written: {report_path}")

    sys.exit(0 if report["pass"] else 1)


if __name__ == "__main__":
    main()
