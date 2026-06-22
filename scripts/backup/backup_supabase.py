"""
backup_supabase.py — daily pg_dump of both Supabase projects, uploaded to R2.

Usage:
    python scripts/backup/backup_supabase.py

Reads credentials from .env.local (or environment).
Requires: pg_dump on PATH, boto3 (`pip install boto3 python-dotenv`)
"""

import gzip
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env.local")

# R2 (S3-compatible)
R2_ACCOUNT_ID = os.environ["CLOUDFLARE_ACCOUNT_ID"]
R2_ACCESS_KEY = os.environ["CLOUDFLARE_R2_ACCESS_KEY_ID"]
R2_SECRET_KEY = os.environ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"]
R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET_BACKUPS", "buildquote-backups")
R2_ENDPOINT = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Database connection strings — add these to .env.local
# Format: postgresql://user:password@host:port/dbname
DATABASES = {
    "data-studio": os.environ.get("BACKUP_DB_URL_DATA_STUDIO"),
    "production": os.environ.get("BACKUP_DB_URL_PRODUCTION"),
}

# How many daily backups to keep per database (older ones are deleted from R2)
RETENTION_DAYS = 30

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def pg_dump(db_url: str, out_path: Path) -> None:
    """Run pg_dump and write plain-SQL output to out_path."""
    result = subprocess.run(
        [
            "pg_dump",
            "--no-password",
            "--format=plain",
            "--no-owner",
            "--no-acl",
            db_url,
        ],
        capture_output=True,
        env={**os.environ, "PGPASSWORD": _extract_password(db_url)},
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed:\n{result.stderr.decode()}")
    out_path.write_bytes(result.stdout)


def _extract_password(url: str) -> str:
    """Pull password out of postgres://user:pass@host/db for PGPASSWORD."""
    from urllib.parse import urlparse
    return urlparse(url).password or ""


def gzip_file(src: Path, dst: Path) -> None:
    with src.open("rb") as f_in, gzip.open(dst, "wb", compresslevel=6) as f_out:
        shutil.copyfileobj(f_in, f_out)


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def upload(client, local_path: Path, key: str) -> None:
    size_mb = local_path.stat().st_size / 1_048_576
    print(f"  Uploading {key} ({size_mb:.1f} MB) … ", end="", flush=True)
    client.upload_file(str(local_path), R2_BUCKET, key)
    print("done")


def prune_old_backups(client, db_name: str) -> None:
    """Delete backups older than RETENTION_DAYS for this database."""
    prefix = f"supabase/{db_name}/"
    response = client.list_objects_v2(Bucket=R2_BUCKET, Prefix=prefix)
    objects = response.get("Contents", [])

    cutoff = datetime.now(tz=timezone.utc).timestamp() - RETENTION_DAYS * 86_400
    to_delete = [o for o in objects if o["LastModified"].timestamp() < cutoff]

    if to_delete:
        print(f"  Pruning {len(to_delete)} old backup(s) for {db_name}")
        client.delete_objects(
            Bucket=R2_BUCKET,
            Delete={"Objects": [{"Key": o["Key"]} for o in to_delete]},
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def backup_database(client, db_name: str, db_url: str, stamp: str, tmpdir: Path) -> bool:
    print(f"\n[{db_name}]")

    sql_file = tmpdir / f"{db_name}.sql"
    gz_file = tmpdir / f"{db_name}.sql.gz"

    try:
        print("  Running pg_dump … ", end="", flush=True)
        pg_dump(db_url, sql_file)
        print(f"done ({sql_file.stat().st_size / 1_048_576:.1f} MB raw)")

        print("  Compressing … ", end="", flush=True)
        gzip_file(sql_file, gz_file)
        print("done")

        key = f"supabase/{db_name}/{stamp}.sql.gz"
        upload(client, gz_file, key)

        prune_old_backups(client, db_name)
        return True

    except Exception as exc:
        print(f"\n  ERROR: {exc}", file=sys.stderr)
        return False


def main() -> int:
    stamp = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    print(f"BuildQuote Supabase backup — {stamp}")

    missing = [name for name, url in DATABASES.items() if not url]
    if missing:
        print(
            f"\nERROR: Missing DB URLs for: {', '.join(missing)}\n"
            "Add BACKUP_DB_URL_DATA_STUDIO and BACKUP_DB_URL_PRODUCTION to .env.local",
            file=sys.stderr,
        )
        return 1

    if not shutil.which("pg_dump"):
        print("ERROR: pg_dump not found on PATH. Install PostgreSQL client tools.", file=sys.stderr)
        return 1

    client = s3_client()
    results = {}

    with tempfile.TemporaryDirectory() as tmpdir:
        for db_name, db_url in DATABASES.items():
            results[db_name] = backup_database(client, db_name, db_url, stamp, Path(tmpdir))

    print("\n--- Summary ---")
    all_ok = True
    for db_name, ok in results.items():
        status = "OK" if ok else "FAILED"
        print(f"  {db_name}: {status}")
        if not ok:
            all_ok = False

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
