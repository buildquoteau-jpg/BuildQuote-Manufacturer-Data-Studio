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
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).parent.parent.parent

# override=True: a stale NEXT_PUBLIC_SUPABASE_URL already exported in the
# shell (e.g. from a v6 dev session) must NOT silently win over the repo's
# .env.local — that is exactly the wrong-project bug fixed on 2026-07-18.
# Absolute path so the worker also works when started outside the repo root.
load_dotenv(REPO_ROOT / ".env.local", override=True)

# Line-buffer stdout regardless of invocation (redirected to a file/pipe would
# otherwise fully buffer, hiding progress until a flush — this bit us hard
# when monitoring a live run via a redirected log).
sys.stdout.reconfigure(line_buffering=True)

# pipeline_jobs (and every table this worker touches) lives only in the Data
# Studio project — never the separate RFQ/BuildQuote PRODUCTION_SUPABASE_URL.
SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
WORKER_ID = socket.gethostname()

# A 'running' job whose heartbeat is older than this is considered abandoned
# (worker crashed / machine rebooted) and gets reclaimed. Requires migration
# 059 (pipeline_jobs.heartbeat_at); degrades to pending-only claims without it.
LEASE_TIMEOUT_MIN = int(os.environ.get("PIPELINE_LEASE_TIMEOUT_MIN", "15"))

R2_ACCOUNT_ID = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
R2_SECRET_KEY = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET_NAME", "studio-buildquote")
R2_PUBLIC_URL = os.environ.get("CLOUDFLARE_R2_PUBLIC_URL", "").rstrip("/")
R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Voyage AI embeddings (Step 7). If VOYAGE_API_KEY is unset, embed jobs no-op.
# Dimension MUST match migration 052's vector(1024).
VOYAGE_API_KEY = os.environ.get("VOYAGE_API_KEY", "")
VOYAGE_MODEL = os.environ.get("VOYAGE_MODEL", "voyage-3.5")
VOYAGE_DIM = int(os.environ.get("VOYAGE_DIM", "1024"))
POLL_INTERVAL = 4  # seconds between polls

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


def sb_post(table: str, rows):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=HEADERS,
        json=rows,
    )
    r.raise_for_status()
    return r.json()


def sb_delete(table: str, params: str):
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()
    return r


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Migration 059 adds pipeline_jobs.heartbeat_at. Until it is applied live,
# PostgREST rejects writes that mention the column — strip it and carry on
# (house graceful-degradation pattern).
_HEARTBEAT_SUPPORTED = True


def job_patch(params: str, data: dict):
    global _HEARTBEAT_SUPPORTED
    if not _HEARTBEAT_SUPPORTED:
        data = {k: v for k, v in data.items() if k != "heartbeat_at"}
    try:
        return sb_patch("pipeline_jobs", params, data)
    except requests.HTTPError as e:
        body = e.response.text if e.response is not None else ""
        if _HEARTBEAT_SUPPORTED and "heartbeat_at" in body:
            _HEARTBEAT_SUPPORTED = False
            print("  [worker] pipeline_jobs.heartbeat_at missing (apply migration 059) — continuing without heartbeats")
            return job_patch(params, data)
        raise


def claim_job() -> dict | None:
    """Claim the oldest pending job. If there is none, reclaim a 'running' job
    whose heartbeat went stale — a crashed worker used to strand its job in
    'running' forever, invisible to retries and shown as an eternal spinner
    in the pipeline UI (2026-07-18 audit)."""
    rows = sb_get(
        "pipeline_jobs",
        "status=eq.pending&order=created_at.asc&limit=1&select=*",
    )
    job = rows[0] if rows else None
    claim_filter = "status=eq.pending"

    if job is None and _HEARTBEAT_SUPPORTED:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=LEASE_TIMEOUT_MIN)).isoformat()
        try:
            stale = sb_get(
                "pipeline_jobs",
                f"status=eq.running&heartbeat_at=lt.{cutoff}&order=heartbeat_at.asc&limit=1&select=*",
            )
        except Exception:
            stale = []  # heartbeat_at not live yet (migration 059)
        if stale:
            job = stale[0]
            claim_filter = "status=eq.running"
            print(f"[worker] Reclaiming stalled job {job['id']} — no heartbeat for over "
                  f"{LEASE_TIMEOUT_MIN} min, previous worker presumed dead")

    if job is None:
        return None

    # Claim it (optimistic: another worker might beat us, that's fine)
    try:
        job_patch(
            f"id=eq.{job['id']}&{claim_filter}",
            {
                "status": "running",
                "started_at": _now_iso(),
                "heartbeat_at": _now_iso(),
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
        job_patch(f"id=eq.{job_id}", data)
    except Exception as e:
        print(f"  [worker] warning: could not update job {job_id}: {e}")


def update_progress(job_id: str, progress: dict, log_lines: list[str]):
    update_job(job_id, {
        "progress": progress,
        "log_lines": log_lines[-80:],
        "heartbeat_at": _now_iso(),
    })


def complete_job(job_id: str, result: dict, log_lines: list[str]):
    update_job(job_id, {
        "status": "done",
        "completed_at": _now_iso(),
        "result": result,
        "log_lines": log_lines[-80:],
        "heartbeat_at": _now_iso(),
    })


def fail_job(job_id: str, error: str, log_lines: list[str]):
    update_job(job_id, {
        "status": "error",
        "completed_at": _now_iso(),
        "error_message": error,
        "log_lines": log_lines[-80:],
        "heartbeat_at": _now_iso(),
    })
    notify_failure(job_id, error)


def notify_failure(job_id: str, error: str):
    """Push failures to the operator instead of waiting to be asked how it's
    going (2026-07-18 audit). Email via Resend when RESEND_API_KEY +
    PIPELINE_NOTIFY_EMAIL are set in .env.local; Windows balloon notification
    when the worker runs on a desktop. Both strictly best-effort — a broken
    notification never breaks the pipeline."""
    summary = (error or "unknown error").strip().splitlines()[0][:300]

    api_key = os.environ.get("RESEND_API_KEY")
    to_email = os.environ.get("PIPELINE_NOTIFY_EMAIL")
    if api_key and to_email:
        try:
            requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": os.environ.get("PIPELINE_NOTIFY_FROM", "BuildQuote Pipeline <onboarding@resend.dev>"),
                    "to": [to_email],
                    "subject": f"[BuildQuote pipeline] job failed: {summary[:80]}",
                    "text": (f"Pipeline job {job_id} failed.\n\n{error}\n\n"
                             f"Open the pipeline page (/manufacturer/pipeline) for the full log."),
                },
                timeout=15,
            )
            print(f"  [worker] failure email sent to {to_email}")
        except Exception as e:
            print(f"  [worker] warning: failure email not sent: {e}")

    if sys.platform == "win32":
        try:
            safe = summary.replace("'", "''")
            ps = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "Add-Type -AssemblyName System.Drawing; "
                "$n = New-Object System.Windows.Forms.NotifyIcon; "
                "$n.Icon = [System.Drawing.SystemIcons]::Error; "
                "$n.Visible = $true; "
                f"$n.ShowBalloonTip(10000, 'BuildQuote pipeline job failed', '{safe}', "
                "[System.Windows.Forms.ToolTipIcon]::Error); "
                "Start-Sleep -Seconds 12; $n.Dispose()"
            )
            subprocess.Popen(
                ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            print(f"  [worker] warning: desktop notification not shown: {e}")


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


def upload_document(storage_key: str, src_path: Path, content_type: str = "application/pdf", bucket: str | None = None):
    """Upload a local file to Cloudflare R2 via the S3-compatible API."""
    r2 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    target_bucket = bucket or R2_BUCKET
    r2.upload_file(str(src_path), target_bucket, storage_key, ExtraArgs={"ContentType": content_type})


def fetch_url_to_path(source_url: str, dest_path: Path) -> str:
    """Download a URL to a local file. Returns the response Content-Type (lowercased)."""
    headers = {"User-Agent": "Mozilla/5.0 (compatible; BuildQuoteDataStudio/1.0; +https://studio.buildquote.com.au)"}
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(source_url, headers=headers, allow_redirects=True, timeout=90, stream=True) as r:
        r.raise_for_status()
        ctype = (r.headers.get("Content-Type", "") or "").split(";")[0].strip().lower()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
    return ctype


def looks_like_pdf(path: Path, ctype: str) -> bool:
    if ctype == "application/pdf":
        return True
    try:
        with open(path, "rb") as f:
            return f.read(5).startswith(b"%PDF-")
    except Exception:
        return False


def persist_document_chunks(document_id: str, chunks: list[dict]):
    """Replace the durable document_chunks rows for a document (service role).

    Chunks carry text + page provenance so a system card can later cite back to
    (source_document, page). See docs/sourced-system-card-architecture.md §3.2.
    Docling chunks are page ranges; page_number holds the start page and the full
    {startPage,endPage} lives in docling_json.
    """
    # Inserting on top of chunks that failed to delete would duplicate the
    # document's text everywhere it is cited, so let the caller report it.
    sb_delete("document_chunks", f"source_document_id=eq.{document_id}")
    rows = [
        {
            "source_document_id": document_id,
            "chunk_index": c["index"],
            "page_number": c.get("startPage"),
            "chunk_type": "docling",
            "raw_text": c.get("text") or None,
            "docling_json": {
                "startPage": c.get("startPage"),
                "endPage": c.get("endPage"),
                "charCount": c.get("charCount"),
                "status": c.get("status"),
            },
        }
        for c in chunks
    ]
    if rows:
        sb_post("document_chunks", rows)


# ── Embeddings (Voyage) ─────────────────────────────────────────────────────────

def voyage_embed(texts: list[str], input_type: str = "document") -> list[list[float]]:
    """Embed a batch of texts with Voyage. input_type: 'document' or 'query'."""
    resp = requests.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {VOYAGE_API_KEY}", "Content-Type": "application/json"},
        json={"input": texts, "model": VOYAGE_MODEL, "input_type": input_type, "output_dimension": VOYAGE_DIM},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    # Preserve request order.
    return [d["embedding"] for d in sorted(data, key=lambda x: x["index"])]


def window_text(text: str, size: int = 1500, overlap: int = 200) -> list[str]:
    """Split content_md into overlapping character windows for embedding."""
    text = (text or "").strip()
    if not text:
        return []
    windows: list[str] = []
    step = max(size - overlap, 1)
    i = 0
    while i < len(text):
        windows.append(text[i:i + size])
        if i + size >= len(text):
            break
        i += step
    return windows


def vector_literal(embedding: list[float]) -> str:
    """pgvector text input, e.g. '[0.1,0.2,...]' — PostgREST casts on insert."""
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


# ── Job handlers ──────────────────────────────────────────────────────────────

def handle_docling(job: dict):
    job_id = job["id"]
    payload = job["payload"]
    storage_key = payload["storage_key"]
    document_id = payload["document_id"]
    chunk_size = payload.get("chunk_size", 7)
    system_source_id = payload.get("system_source_id")

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
        # Child attaches its pipeline_report shim to THIS job row instead of
        # creating a duplicate — see scripts/lib/pipeline_report.py.
        env={**os.environ, "PIPELINE_JOB_ID": str(job_id)},
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
            "text": body,
        })

    failed = [c for c in chunks if c["status"] != "ok"]
    page_count = chunks[-1]["endPage"] if chunks else 0

    # Save to docling index for local reference
    index_path = REPO_ROOT / ".local" / "docling-index.json"
    index = {}
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text())
        except Exception as e:
            log_line(f"warning: docling index unreadable, starting a new one: {e}")
    index[document_id] = {
        "outputDir": str(output_dir),
        "outputMdPath": str(output_md),
        "chunkCount": len(chunks),
        "pageCount": page_count,
        "chunks": chunks,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
    }
    index_path.write_text(json.dumps(index, indent=2))

    # Persist durable chunks (text + page provenance) to Supabase so cards can
    # later be assembled + cited from them. Non-fatal if it fails — the .local
    # output.md the parser reads is still written above.
    try:
        persist_document_chunks(document_id, chunks)
        log_line(f"Persisted {len(chunks)} document_chunks rows")
    except Exception as e:
        log_line(f"warning: could not persist document_chunks: {e}")

    # Update source_document status
    try:
        sb_patch("source_documents", f"id=eq.{document_id}", {"status": "extracted"})
    except Exception as e:
        log_line(f"warning: document status not set to 'extracted': {e}")

    # If this docling run came from a URL-ingested system source, mark it extracted.
    if system_source_id:
        try:
            sb_patch("system_sources", f"id=eq.{system_source_id}", {"ingest_status": "extracted"})
        except Exception as e:
            log_line(f"warning: source ingest_status not set to 'extracted': {e}")

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
    # NOTE: --target-system-id used to be forwarded here, but run_parser.py
    # never defined that argument — argparse rejected it and every job that
    # carried a target_system_id failed at spawn (2026-07-18 audit).
    if dry_run:
        cmd.append("--dry-run")

    log_line(f"Running parser: {manufacturer_name} ({'dry run' if dry_run else 'live'})")
    update_progress(job_id, {"currentStage": "stage1"}, log)

    proc = subprocess.Popen(
        cmd, cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
        # Child attaches its pipeline_report shim to THIS job row instead of
        # creating a duplicate — see scripts/lib/pipeline_report.py.
        env={**os.environ, "PIPELINE_JOB_ID": str(job_id)},
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
    except Exception as e:
        # Counts are only for the job summary — a zero here means "not counted",
        # not "nothing parsed", so say so rather than reporting a silent 0.
        log_line(f"warning: could not read result counts: {e}")
        system_count = profile_count = component_count = 0

    if not dry_run:
        try:
            sb_patch("source_documents", f"id=eq.{document_id}", {"status": "parsed"})
        except Exception as e:
            log_line(f"warning: document status not set to 'parsed': {e}")

    log_line(f"Done: {system_count} systems, {profile_count} profiles, {component_count} components")
    complete_job(job_id, {
        "systemCount": system_count,
        "profileCount": profile_count,
        "componentCount": component_count,
        "dryRun": dry_run,
    }, log)


def handle_fetch_url(job: dict):
    """Fetch a PDF from a URL into R2, then (optionally) chain into docling.

    Thin Vercel route (api/manufacturer/add-source-url) only enqueues; all bytes
    flow through here so large files have no serverless limits and the fetch is a
    durable, retryable, observable job. See docs/sourced-system-card-architecture.md §4.
    """
    job_id = job["id"]
    payload = job["payload"]
    document_id = payload["document_id"]
    manufacturer_id = payload["manufacturer_id"]
    source_url = payload["source_url"]
    system_source_id = payload.get("system_source_id")
    then_docling = payload.get("then_docling", True)
    chunk_size = payload.get("chunk_size", 7)

    log: list[str] = []

    def log_line(msg: str):
        log.append(msg)
        print(f"  {msg}")

    def mark_source(status: str, error: str | None = None):
        if not system_source_id:
            return
        data = {"ingest_status": status}
        if error is not None:
            data["error_message"] = error
        try:
            sb_patch("system_sources", f"id=eq.{system_source_id}", data)
        except Exception as e:
            log_line(f"warning: source ingest_status not set to '{status}': {e}")

    log_line(f"Fetching URL: {source_url}")
    mark_source("fetching")
    update_progress(job_id, {"stage": "fetch"}, log)

    pdf_path = REPO_ROOT / ".local" / "pipeline-temp" / f"{document_id}.pdf"
    try:
        ctype = fetch_url_to_path(source_url, pdf_path)
    except Exception as e:
        msg = f"Fetch failed: {e}"
        fail_job(job_id, msg, log)
        mark_source("failed", msg)
        try:
            sb_patch("source_documents", f"id=eq.{document_id}", {"status": "fetch_failed"})
        except Exception as patch_err:
            log_line(f"warning: document status not set to 'fetch_failed': {patch_err}")
        return

    if not looks_like_pdf(pdf_path, ctype):
        msg = f"URL did not return a PDF (Content-Type: {ctype or 'unknown'}). Link stored, but not ingested."
        fail_job(job_id, msg, log)
        mark_source("failed", msg)
        try:
            sb_patch("source_documents", f"id=eq.{document_id}", {"status": "fetch_failed"})
        except Exception as patch_err:
            log_line(f"warning: document status not set to 'fetch_failed': {patch_err}")
        return

    # Upload the durable copy to R2, keeping the manufacturer-uploads convention.
    storage_key = f"manufacturer-uploads/{manufacturer_id}/{uuid.uuid4()}.pdf"
    try:
        upload_document(storage_key, pdf_path)
    except Exception as e:
        fail_job(job_id, f"R2 upload failed: {e}", log)
        mark_source("failed", f"R2 upload failed: {e}")
        return

    file_size = pdf_path.stat().st_size
    public_url = f"{R2_PUBLIC_URL}/{storage_key}" if R2_PUBLIC_URL else None
    try:
        sb_patch("source_documents", f"id=eq.{document_id}", {
            "storage_key": storage_key,
            "storage_bucket": R2_BUCKET,
            "file_mime_type": "application/pdf",
            "file_size_bytes": file_size,
            "public_url": public_url,
            "status": "uploaded",
        })
    except Exception as e:
        fail_job(job_id, f"Could not update source_document: {e}", log)
        return
    log_line(f"Uploaded to R2 ({file_size} bytes): {storage_key}")

    if not then_docling:
        # Link-only source (e.g. website / plain library add without parsing).
        mark_source("extracted")
        complete_job(job_id, {"storageKey": storage_key, "fileSizeBytes": file_size, "docling": False}, log)
        return

    # Chain into docling on the SAME job — it downloads the key we just wrote,
    # chunks it, persists document_chunks, and completes/fails this job itself.
    log_line("Chaining into docling extraction…")
    handle_docling({
        "id": job_id,
        "payload": {
            "document_id": document_id,
            "manufacturer_id": manufacturer_id,
            "storage_key": storage_key,
            "document_name": document_id,
            "chunk_size": chunk_size,
            "system_source_id": system_source_id,
        },
    })


def handle_embed(job: dict):
    """Embed a published card version's container (card_versions.content_md) into
    card_embeddings via Voyage. Idempotent by content_hash — skips if unchanged.
    No-ops (marks done) when VOYAGE_API_KEY is unset, so publish can enqueue
    freely before embeddings are turned on. See
    docs/sourced-system-card-architecture.md §3.5.
    """
    job_id = job["id"]
    payload = job["payload"]
    card_id = payload["card_id"]
    version = payload["version"]
    manufacturer_id = payload["manufacturer_id"]

    log: list[str] = []

    def log_line(msg: str):
        log.append(msg)
        print(f"  {msg}")

    if not VOYAGE_API_KEY:
        complete_job(job_id, {"skipped": "no_voyage_key"}, log + ["Embeddings disabled (no VOYAGE_API_KEY)."])
        return

    rows = sb_get(
        "card_versions",
        f"card_id=eq.{card_id}&version=eq.{version}&select=content_md,content_hash&limit=1",
    )
    if not rows:
        fail_job(job_id, "card_version not found", log)
        return
    content_md = rows[0].get("content_md")
    content_hash = rows[0].get("content_hash")
    if not content_md or not content_hash:
        complete_job(job_id, {"skipped": "no_content"}, log + ["No container content to embed."])
        return

    windows = window_text(content_md)
    if not windows:
        complete_job(job_id, {"skipped": "empty"}, log)
        return

    # Already embedded this exact container? Compare ROW COUNT, not mere
    # existence: a previous run that died between the batched inserts leaves a
    # partial set carrying the right content_hash, and an existence check
    # would wrongly skip it forever (2026-07-18 audit).
    existing = sb_get(
        "card_embeddings",
        f"card_id=eq.{card_id}&version=eq.{version}&content_hash=eq.{content_hash}&select=id&limit={len(windows) + 1}",
    )
    if len(existing) == len(windows):
        complete_job(job_id, {"skipped": "unchanged", "contentHash": content_hash}, log)
        return
    if existing:
        log_line(f"Found {len(existing)}/{len(windows)} embeddings for this container — previous run incomplete, re-embedding")

    log_line(f"Embedding {len(windows)} windows via {VOYAGE_MODEL} ({VOYAGE_DIM}d)")
    embeddings: list[list[float]] = []
    try:
        for b in range(0, len(windows), 128):
            embeddings.extend(voyage_embed(windows[b:b + 128], "document"))
    except Exception as e:
        fail_job(job_id, f"Voyage embed failed: {e}", log)
        return

    # Replace any prior embeddings for this card/version. Inserting on top of
    # rows that failed to delete would duplicate every window in search.
    try:
        sb_delete("card_embeddings", f"card_id=eq.{card_id}&version=eq.{version}")
    except Exception as e:
        fail_job(job_id, f"Could not clear previous embeddings: {e}", log)
        return

    insert_rows = [
        {
            "manufacturer_id": manufacturer_id,
            "card_id": card_id,
            "version": version,
            "chunk_index": i,
            "source_role": None,
            "content": w,
            "embedding": vector_literal(emb),
            "content_hash": content_hash,
        }
        for i, (w, emb) in enumerate(zip(windows, embeddings))
    ]
    try:
        for b in range(0, len(insert_rows), 200):
            sb_post("card_embeddings", insert_rows[b:b + 200])
    except Exception as e:
        fail_job(job_id, f"Could not store embeddings: {e}", log)
        return

    log_line(f"Stored {len(insert_rows)} embeddings")
    complete_job(job_id, {"embeddings": len(insert_rows), "contentHash": content_hash}, log)


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
    "fetch_url": handle_fetch_url,
    "embed": handle_embed,
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
