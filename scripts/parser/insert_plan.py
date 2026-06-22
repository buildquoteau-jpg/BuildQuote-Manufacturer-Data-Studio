#!/usr/bin/env python3
"""
insert_plan.py — Apply migration 021 then insert an existing plan JSON into Supabase.

Usage:
    python scripts/parser/insert_plan.py --plan .local/parser-dry-run/plan_deduped.json

Environment (.env.local):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import json
import os
import sys
from pathlib import Path


def load_env():
    try:
        from dotenv import dotenv_values
        repo_root = Path(__file__).parent.parent.parent
        env_file = repo_root / ".env.local"
        if not env_file.exists():
            env_file = Path(".env.local")
        for k, v in dotenv_values(str(env_file)).items():
            if v is not None:
                os.environ[k] = v
    except ImportError:
        pass
    return (
        os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def run_sql(sql, supabase_url):
    """Execute SQL via local Supabase /pg/query endpoint (no auth needed for local)."""
    import httpx
    r = httpx.post(f"{supabase_url}/pg/query", json={"query": sql}, timeout=30)
    if r.status_code != 200:
        return False, r.text
    data = r.json()
    if "error" in data:
        return False, data["error"]
    return True, data


def apply_migration(supabase_url):
    """Add australian_made column if it doesn't already exist."""
    print("[migration] Checking australian_made column...")
    ok, result = run_sql(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = 'staged_systems' "
        "AND column_name = 'australian_made'",
        supabase_url,
    )
    if not ok:
        print(f"[migration] Could not check column: {result}")
        return False

    rows = result if isinstance(result, list) else []
    if rows:
        print("[migration] Column already exists — skipping.")
        return True

    print("[migration] Adding australian_made column...")
    ok, result = run_sql(
        "ALTER TABLE public.staged_systems "
        "ADD COLUMN IF NOT EXISTS australian_made boolean NULL",
        supabase_url,
    )
    if not ok:
        print(f"[migration] FAILED: {result}")
        return False
    print("[migration] Column added.")
    return True


def call_rpc(plan, supabase_url, service_key):
    import httpx
    url = f"{supabase_url}/rest/v1/rpc/insert_parser_output_plan_v1"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    resp = httpx.post(url, json={"plan": plan}, headers=headers, timeout=120)
    if resp.status_code != 200:
        print(f"[ERROR] RPC {resp.status_code}: {resp.text}")
        return None
    return resp.json()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, help="Path to plan JSON file (e.g. plan_deduped.json)")
    parser.add_argument("--skip-migration", action="store_true", help="Skip migration 021 check")
    args = parser.parse_args()

    supabase_url, service_key = load_env()
    if not supabase_url or not service_key:
        sys.exit("[ERROR] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    plan_path = Path(args.plan)
    if not plan_path.exists():
        sys.exit(f"[ERROR] Plan file not found: {plan_path}")

    plan = json.loads(plan_path.read_text(encoding="utf-8"))

    # Deduplicate system-component links (same system+component pair from multiple chunks)
    links = plan.get("stagedSystemComponents", [])
    seen_links = set()
    deduped_links = []
    for lnk in links:
        key = (lnk.get("_staged_system_temp_key"), lnk.get("_staged_component_temp_key"))
        if key not in seen_links:
            seen_links.add(key)
            deduped_links.append(lnk)
    dropped = len(links) - len(deduped_links)
    if dropped:
        print(f"[insert] Deduped {dropped} duplicate system-component links")
    plan["stagedSystemComponents"] = deduped_links

    print(f"[insert] Plan: {plan_path.name}")
    print(f"  Systems    : {len(plan.get('stagedSystems', []))}")
    print(f"  Profiles   : {len(plan.get('stagedSystemProfiles', []))}")
    print(f"  Colours    : {len(plan.get('stagedSystemColours', []))}")
    print(f"  Components : {len(plan.get('stagedComponents', []))}")
    print(f"  Links      : {len(plan.get('stagedSystemComponents', []))}")

    if not args.skip_migration:
        if not apply_migration(supabase_url):
            sys.exit(1)

    print(f"\n[insert] Calling Supabase RPC...")
    result = call_rpc(plan, supabase_url, service_key)
    if result:
        out_path = plan_path.parent / f"rpc_result_{plan_path.stem}.json"
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[insert] RPC result written to: {out_path}")
        print(json.dumps(result, indent=2))
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
