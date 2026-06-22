#!/usr/bin/env python3
"""
BuildQuote Pipeline Worker
==========================
Polls Supabase for pending pipeline jobs and executes them locally.

Supports job types:
  docling       — run extract_docling_chunked.py on a PDF from R2
  parser        — run run_parser.py on docling output
  rerun_chunk   — re-extract a specific page range
  qa            — run LLM QA review via Claude API

Run from repo root:
    python scripts/worker/pipeline_worker.py

The worker identifies itself with a worker_id (hostname) so multiple workers
can run in parallel without picking up the same job.

Environment variables (read from .env.local):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY
    CLOUDFLARE_R2_*  (if documents are stored in R2 directly)
"""

import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv(".env.local")

# Worker always talks to production Supabase — that's where Vercel writes jobs
SUPABASE_URL = os.environ.get("PRODUCTION_SUPABASE_URL", os.environ["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/")
SUPABASE_KEY = os.environ.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", os.environ["SUPABASE_SERVICE_ROLE_KEY"])
WORKER_ID = socket.gethostname()

R2_ACCOUNT_ID = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET_NAME", "studio-buildquote")
R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
POLL_INTERVAL = 4  # seconds between polls
REPO_ROOT = Path(__file__).parent.parent.parent

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(table: str, params: str) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()
    return r.json()


def sb_patch(table: str, params: str, data: dict):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?{params}",
        headers=HEADERS,
        json=data,
    )
    r.raise_for_status()
    return r.json()


def claim_job() -> dict | None:
    """Atomically claim the oldest pending job."""
    # Fetch oldest pending job
    rows = sb_get(
        "pipeline_jobs",
        "status=eq.pending&order=created_at.asc&limit=1&select=*",
    )
    if not rows:
        return None
    job = rows[0]
    # Claim it (optimistic: another worker might beat us, that's fine)
    try:
        sb_patch(
            "pipeline_jobs",
            f"id=eq.{job['id']}&status=eq.pending",
            {
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "worker_id": WORKER_ID,
            },
        )
        # Verify we actually claimed it
        check = sb_get("pipeline_jobs", f"id=eq.{job['id']}&worker_id=eq.{WORKER_ID}&select=*")
        if not check:
            return None
        return check[0]
    except Exception:
        return None


def update_job(job_id: str, data: dict):
    try:
        sb_patch("pipeline_jobs", f"id=eq.{job_id}", data)
    except Exception as e:
        print(f"  [worker] warning: could not update job {job_id}: {e}")


def update_progress(job_id: str, progress: dict, log_lines: list[str]):
    update_job(job_id, {
        "progress": progress,
        "log_lines": log_lines[-80:],
    })


def complete_job(job_id: str, result: dict, log_lines: list[str]):
    update_job(job_id, {
        "status": "done",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "result": result,
        "log_lines": log_lines[-80:],
    })


def fail_job(job_id: str, error: str, log_lines: list[str]):
    update_job(job_id, {
        "status": "error",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "error_message": error,
        "log_lines": log_lines[-80:],
    })


# ── R2 / storage download ─────────────────────────────────────────────────────

def download_document(storage_key: str, dest_path: Path, bucket: str | None = None):
    """Download a PDF from Cloudflare R2 using the S3-compatible API."""
    r2 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    target_bucket = bucket or R2_BUCKET
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    r2.download_file(target_bucket, storage_key, str(dest_path))


# ── Job handlers ──────────────────────────────────────────────────────────────

def handle_docling(job: dict):
    job_id = job["id"]
    payload = job["payload"]
    storage_key = payload["storage_key"]
    document_id = payload["document_id"]
    chunk_size = payload.get("chunk_size", 7)

    log: list[str] = []
    progress = {"totalChunks": None, "totalPages": None, "completedChunks": [], "currentChunk": None}

    def log_line(msg: str):
        log.append(msg)
        print(f"  {msg}")

    log_line(f"Downloading PDF (storage_key={storage_key})")
    pdf_path = REPO_ROOT / ".local" / "pipeline-temp" / f"{document_id}.pdf"
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        download_document(storage_key, pdf_path)
    except Exception as e:
        fail_job(job_id, f"Download failed: {e}", log)
        return

    log_line(f"PDF saved to {pdf_path}")
    update_progress(job_id, progress, log)

    python_exe = REPO_ROOT / ".venv-docling" / "Scripts" / "python.exe"
    if not python_exe.exists():
        python_exe = Path(sys.executable)

    script = REPO_ROOT / "scripts" / "docling" / "extract_docling_chunked.py"
    cmd = [str(python_exe), str(script), "--input", str(pdf_path), "--chunk-size", str(chunk_size)]

    log_line(f"Running: {' '.join(cmd)}")
    update_progress(job_id, progress, log)

    pending_chunk = None
    completed_chunks = []

    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )

    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        log.append(line)

        pages_match = re.search(r"PDF has (\d+) pages.*chunk size (\d+)", line)
        if pages_match:
            total_pages = int(pages_match.group(1))
            total_chunks = -(-total_pages // chunk_size)  # ceiling div
            progress["totalPages"] = total_pages
            progress["totalChunks"] = total_chunks

        split_match = re.search(r"Splitting pages (\d+)-(\d+)", line)
        if split_match:
            if pending_chunk:
                completed_chunks.append(pending_chunk)
                progress["completedChunks"] = completed_chunks[:]
            pending_chunk = {
                "chunkNo": len(completed_chunks) + 1,
                "startPage": int(split_match.group(1)),
                "endPage": int(split_match.group(2)),
            }
            progress["currentChunk"] = pending_chunk

        if "Merge complete" in line:
            if pending_chunk:
                completed_chunks.append(pending_chunk)
                pending_chunk = None
            progress["completedChunks"] = completed_chunks[:]
            progress["currentChunk"] = None

        # Update progress every ~5 lines to avoid spamming Supabase
        if len(log) % 5 == 0:
            update_progress(job_id, progress, log)

    proc.wait()

    if proc.returncode != 0:
        fail_job(job_id, f"Docling exited with code {proc.returncode}", log)
        return

    # Find output dir
    stem = re.sub(r"[^\w\-]", "_", pdf_path.stem)[:80]
    output_root = REPO_ROOT / ".local" / "docling-output"
    candidates = sorted([d for d in output_root.iterdir() if d.name.startswith(stem + "_chunked")], reverse=True)
    if not candidates:
        fail_job(job_id, "Docling output directory not found after extraction", log)
        return

    output_dir = candidates[0]
    output_md = output_dir / "output.md"
    md_content = output_md.read_text(encoding="utf-8") if output_md.exists() else ""

    # Parse per-chunk detail
    chunks = []
    for section in re.split(r"(?=<!-- chunk \d+: pages \d+-\d+ -->)", md_content):
        m = re.match(r"<!-- chunk (\d+): pages (\d+)-(\d+) -->", section)
        if not m:
            continue
        body = section[m.end():].strip()
        char_count = len(body)
        chunks.append({
            "index": int(m.group(1)),
            "startPage": int(m.group(2)),
            "endPage": int(m.group(3)),
            "charCount": char_count,
            "status": "empty" if char_count == 0 else "short" if char_count < 200 else "ok",
        })

    failed = [c for c in chunks if c["status"] != "ok"]
    page_count = chunks[-1]["endPage"] if chunks else 0

    # Save to docling index for local reference
    index_path = REPO_ROOT / ".local" / "docling-index.json"
    index = {}
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text())
        except Exception:
            pass
    index[document_id] = {
        "outputDir": str(output_dir),
        "outputMdPath": str(output_md),
        "chunkCount": len(chunks),
        "pageCount": page_count,
        "chunks": chunks,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
    }
    index_path.write_text(json.dumps(index, indent=2))

    # Update source_document status
    try:
        sb_patch("source_documents", f"id=eq.{document_id}", {"status": "extracted"})
    except Exception:
        pass

    log_line(f"Done: {len(chunks)} chunks, {page_count} pages, {len(failed)} issues")
    complete_job(job_id, {
        "outputDir": str(output_dir),
        "outputMdPath": str(output_md),
        "chunkCount": len(chunks),
        "pageCount": page_count,
        "chunks": chunks,
        "failedChunks": failed,
    }, log)


def handle_parser(job: dict):
    job_id = job["id"]
    payload = job["payload"]
    manufacturer_id = payload["manufacturer_id"]
    manufacturer_name = payload["manufacturer_name"]
    slug = payload["slug"]
    document_id = payload["document_id"]
    output_dir = Path(payload["output_dir"])
    target_system_id = payload.get("target_system_id")
    dry_run = payload.get("dry_run", False)

    log: list[str] = []

    def log_line(msg):
        log.append(msg)
        print(f"  {msg}")

    output_md = output_dir / "output.md"
    if not output_md.exists():
        fail_job(job_id, f"output.md not found at {output_md}", log)
        return

    hints_path = REPO_ROOT / "prompts" / "manufacturer-hints" / f"{slug}.md"
    if not hints_path.exists():
        fail_job(job_id, f"Hints file not found: {hints_path}", log)
        return

    script = REPO_ROOT / "scripts" / "parser" / "run_parser.py"
    cmd = [
        sys.executable, "-u", str(script),
        "--input", str(output_md),
        "--manufacturer-id", manufacturer_id,
        "--manufacturer-name", manufacturer_name,
        "--hints", str(hints_path),
    ]
    if target_system_id:
        cmd += ["--target-system-id", target_system_id]
    if dry_run:
        cmd.append("--dry-run")

    log_line(f"Running parser: {manufacturer_name} ({'dry run' if dry_run else 'live'})")
    update_progress(job_id, {"currentStage": "stage1"}, log)

    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
        env={**os.environ},
    )
    for line in proc.stdout:
        line = line.rstrip()
        if not line:
            continue
        log.append(line)
        if "stage 2" in line.lower():
            update_progress(job_id, {"currentStage": "stage2"}, log)
        elif len(log) % 10 == 0:
            update_progress(job_id, {"currentStage": "running"}, log)

    proc.wait()
    if proc.returncode != 0:
        fail_job(job_id, f"Parser exited with code {proc.returncode}", log)
        return

    # Read result counts from Supabase
    try:
        systems = sb_get("staged_systems", f"manufacturer_id=eq.{manufacturer_id}&select=id")
        sys_ids = ",".join(s["id"] for s in systems)
        system_count = len(systems)
        profile_count = len(sb_get("staged_system_profiles", f"staged_system_id=in.({sys_ids})&select=id")) if sys_ids else 0
        component_count = len(sb_get("staged_components", f"manufacturer_id=eq.{manufacturer_id}&select=id"))
    except Exception:
        system_count = profile_count = component_count = 0

    if not dry_run:
        try:
            sb_patch("source_documents", f"id=eq.{document_id}", {"status": "parsed"})
        except Exception:
            pass

    log_line(f"Done: {system_count} systems, {profile_count} profiles, {component_count} components")
    complete_job(job_id, {
        "systemCount": system_count,
        "profileCount": profile_count,
        "componentCount": component_count,
        "dryRun": dry_run,
    }, log)


def handle_rerun_chunk(job: dict):
    job_id = job["id"]
    payload = job["payload"]
    document_id = payload["document_id"]
    output_dir = Path(payload["output_dir"])
    start_page = payload["start_page"]
    end_page = payload["end_page"]
    chunk_index = payload.get("chunk_index", start_page)

    log: list[str] = []

    pdf_path = REPO_ROOT / ".local" / "pipeline-temp" / f"{document_id}.pdf"
    if not pdf_path.exists():
        # Try to re-download
        try:
            rows = sb_get("source_documents", f"id=eq.{document_id}&select=storage_key,storage_bucket")
            if rows:
                download_document(rows[0]["storage_key"], pdf_path, bucket=rows[0].get("storage_bucket"))
        except Exception as e:
            fail_job(job_id, f"PDF not found locally and download failed: {e}", log)
            return

    python_exe = REPO_ROOT / ".venv-docling" / "Scripts" / "python.exe"
    if not python_exe.exists():
        python_exe = Path(sys.executable)

    chunk_output = output_dir / f"chunk_rerun_{chunk_index}.md"
    script = REPO_ROOT / "scripts" / "docling" / "extract_docling.py"
    cmd = [
        str(python_exe), str(script),
        "--input", str(pdf_path),
        "--start-page", str(start_page),
        "--end-page", str(end_page),
        "--output", str(chunk_output),
        "--no-image-processing", "--allow-partial",
    ]

    log.append(f"Re-running pages {start_page}-{end_page}")
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True)
    log.extend(proc.stdout.splitlines())

    if proc.returncode != 0:
        fail_job(job_id, f"Re-run failed (code {proc.returncode})", log)
        return

    content = chunk_output.read_text(encoding="utf-8") if chunk_output.exists() else ""
    char_count = len(content.strip())
    status = "empty" if char_count == 0 else "short" if char_count < 200 else "ok"

    # Patch the main output.md
    output_md = output_dir / "output.md"
    if output_md.exists():
        existing = output_md.read_text(encoding="utf-8")
        marker = f"<!-- chunk {chunk_index}: pages {start_page}-{end_page} -->"
        marker_idx = existing.find(marker)
        if marker_idx != -1:
            after = existing[marker_idx + len(marker):]
            next_m = re.search(r"<!-- chunk \d+: pages \d+-\d+ -->", after)
            chunk_end = marker_idx + len(marker) + (next_m.start() if next_m else len(after))
            patched = existing[:marker_idx] + marker + "\n" + content + "\n" + existing[chunk_end:]
            output_md.write_text(patched, encoding="utf-8")

    complete_job(job_id, {
        "chunkIndex": chunk_index,
        "startPage": start_page,
        "endPage": end_page,
        "charCount": char_count,
        "status": status,
    }, log)


# ── Main loop ─────────────────────────────────────────────────────────────────

HANDLERS = {
    "docling": handle_docling,
    "parser": handle_parser,
    "rerun_chunk": handle_rerun_chunk,
}


def main():
    print(f"[worker] BuildQuote Pipeline Worker starting")
    print(f"[worker] Worker ID : {WORKER_ID}")
    print(f"[worker] Supabase  : {SUPABASE_URL}")
    print(f"[worker] Repo root : {REPO_ROOT}")
    print(f"[worker] Polling every {POLL_INTERVAL}s — Ctrl+C to stop\n")

    while True:
        try:
            job = claim_job()
            if job:
                job_type = job.get("job_type", "unknown")
                job_id = job["id"]
                print(f"[worker] Picked up job {job_id} (type={job_type})")
                handler = HANDLERS.get(job_type)
                if handler:
                    try:
                        handler(job)
                        print(f"[worker] Job {job_id} complete\n")
                    except Exception as e:
                        import traceback
                        err = traceback.format_exc()
                        print(f"[worker] Job {job_id} crashed: {e}\n{err}")
                        fail_job(job_id, str(e), [err])
                else:
                    fail_job(job_id, f"Unknown job type: {job_type}", [])
                    print(f"[worker] Unknown job type '{job_type}', skipped\n")
            else:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\n[worker] Shutting down.")
            break
        except Exception as e:
            print(f"[worker] Poll error: {e}")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
