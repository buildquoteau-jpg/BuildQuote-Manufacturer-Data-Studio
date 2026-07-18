"""Pipeline run reporting — every script run becomes visible in pipeline_jobs.

WHY (2026-07-18 audit): the pipeline UI only showed jobs enqueued through the
web app + worker. Runs started by hand from a terminal (the documented
onboarding flow!) never touched pipeline_jobs, so the dashboard was blind to
them and their failures scrolled away in a console window. This shim gives
every script a heartbeat row in pipeline_jobs regardless of how it was
launched:

  * Standalone run  -> creates its own pipeline_jobs row, owns its terminal
                       status (done/error).
  * Worker-spawned  -> the worker sets PIPELINE_JOB_ID in the child's env;
                       the shim attaches to that row, streams progress +
                       heartbeat_at, and leaves terminal status to the worker.

Design constraints:
  * stdlib only (urllib) — must import cleanly inside .venv-docling, which has
    no requests/httpx.
  * NEVER breaks the actual pipeline run: every network failure degrades to a
    console warning and a no-op reporter.
  * Tolerates migration 059 not being applied yet: if PostgREST rejects
    heartbeat_at (42703 / unknown column), the shim drops the field and keeps
    reporting — the house graceful-degradation pattern.

Usage:
    from lib.pipeline_report import PipelineReporter

    reporter = PipelineReporter.start(
        "parser", payload={"manufacturer_name": name}, manufacturer_id=mid)
    reporter.progress({"stage": "stage1", "chunk": 3, "totalChunks": 18},
                      log_line="stage1 chunk 3/18")
    reporter.done({"systems": 12})     # or reporter.fail("error message")
"""

from __future__ import annotations

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_env_local() -> dict:
    """Minimal .env.local parser (stdlib only). Existing os.environ wins so a
    worker-provided environment is never overridden."""
    values = {}
    env_file = _REPO_ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values


class PipelineReporter:
    """Reports a script run to pipeline_jobs. All methods are best-effort."""

    def __init__(self, supabase_url: str, service_key: str, job_id: str,
                 owns_terminal_status: bool):
        self._url = supabase_url.rstrip("/")
        self._key = service_key
        self.job_id = job_id
        self._owns_terminal_status = owns_terminal_status
        self._log: list[str] = []
        self._heartbeat_supported = True  # flips off on first 42703
        self._dead = False                # flips on after repeated failures
        self._failures = 0
        self.terminal_sent = False        # done()/fail() already recorded

    # ── construction ────────────────────────────────────────────────────────

    @classmethod
    def start(cls, job_type: str, payload: dict | None = None,
              manufacturer_id: str | None = None,
              document_id: str | None = None) -> "PipelineReporter":
        """Create (or attach to) a pipeline_jobs row. Returns a no-op reporter
        on any failure — callers never need to guard."""
        env = _load_env_local()
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            print("[pipeline-report] no Supabase env — run will not appear in the pipeline UI")
            return _NullReporter()

        attached_id = os.environ.get("PIPELINE_JOB_ID")
        if attached_id:
            reporter = cls(url, key, attached_id, owns_terminal_status=False)
            reporter._patch({"heartbeat_at": _now()})
            return reporter

        reporter = cls(url, key, "", owns_terminal_status=True)
        row = {
            "job_type": job_type,
            "status": "running",
            "payload": payload or {},
            "manufacturer_id": manufacturer_id,
            "document_id": document_id,
            "worker_id": f"{socket.gethostname()}:manual",
            "started_at": _now(),
            "heartbeat_at": _now(),
            "progress": {},
            "log_lines": [],
        }
        created = reporter._request(
            "POST", f"{reporter._url}/rest/v1/pipeline_jobs", row,
            headers={"Prefer": "return=representation"})
        if not created:
            print("[pipeline-report] could not create pipeline_jobs row — continuing without UI reporting")
            return _NullReporter()
        reporter.job_id = (created[0] if isinstance(created, list) else created)["id"]
        return reporter

    # ── reporting API ───────────────────────────────────────────────────────

    def log(self, msg: str):
        self._log.append(msg)

    def progress(self, progress: dict, log_line: str | None = None):
        if log_line:
            self._log.append(log_line)
        self._patch({
            "progress": progress,
            "log_lines": self._log[-80:],
            "heartbeat_at": _now(),
        })

    def done(self, result: dict | None = None):
        self.terminal_sent = True
        if not self._owns_terminal_status:
            # Worker owns the terminal status; just flush progress/logs.
            self._patch({"log_lines": self._log[-80:], "heartbeat_at": _now()})
            return
        self._patch({
            "status": "done",
            "completed_at": _now(),
            "result": result or {},
            "log_lines": self._log[-80:],
            "heartbeat_at": _now(),
        })

    def fail(self, error: str):
        self.terminal_sent = True
        if not self._owns_terminal_status:
            # Record the error text for the UI; worker sets status on exit code.
            self._patch({"error_message": str(error)[:2000],
                         "log_lines": self._log[-80:], "heartbeat_at": _now()})
            return
        self._patch({
            "status": "error",
            "completed_at": _now(),
            "error_message": str(error)[:2000],
            "log_lines": self._log[-80:],
            "heartbeat_at": _now(),
        })

    # ── plumbing ────────────────────────────────────────────────────────────

    def _patch(self, data: dict):
        if self._dead or not self.job_id:
            return
        self._request(
            "PATCH", f"{self._url}/rest/v1/pipeline_jobs?id=eq.{self.job_id}", data)

    def _request(self, method: str, url: str, body: dict, headers: dict | None = None):
        if not self._heartbeat_supported:
            body = {k: v for k, v in body.items() if k != "heartbeat_at"}
        payload = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method=method, headers={
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            **(headers or {}),
        })
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")
            except Exception:
                pass
            # Migration 059 not applied yet: drop heartbeat_at and retry once.
            if self._heartbeat_supported and "heartbeat_at" in detail:
                self._heartbeat_supported = False
                return self._request(method, url, body, headers)
            self._note_failure(f"HTTP {e.code}: {detail[:200]}")
        except Exception as e:
            self._note_failure(str(e))
        return None

    def _note_failure(self, detail: str):
        self._failures += 1
        print(f"[pipeline-report] warning: {detail}")
        if self._failures >= 5:
            self._dead = True
            print("[pipeline-report] disabled after repeated failures — run continues")


class _NullReporter(PipelineReporter):
    """No-op stand-in when reporting cannot be initialised."""

    def __init__(self):  # noqa: super().__init__ deliberately not called
        self.job_id = ""
        self._log = []
        self.terminal_sent = False

    def log(self, msg: str):
        pass

    def progress(self, progress: dict, log_line: str | None = None):
        pass

    def done(self, result: dict | None = None):
        pass

    def fail(self, error: str):
        pass
