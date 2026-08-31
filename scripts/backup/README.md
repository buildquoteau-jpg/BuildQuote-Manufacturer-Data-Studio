# Supabase Backup — Setup Guide

Daily `pg_dump` of both Supabase projects, gzip-compressed and uploaded to a private Cloudflare R2 bucket. Retains 30 days of backups per database.

## One-time setup

### 1. Install dependencies

```powershell
pip install boto3 python-dotenv
```

You also need the PostgreSQL client tools on your PATH (for `pg_dump`):
- **Windows:** download the PostgreSQL installer from postgresql.org, choose "Command Line Tools" only.
- Verify: `pg_dump --version`

### 2. Create the R2 backup bucket

In the Cloudflare dashboard:
1. R2 → Create bucket → name it `buildquote-backups`
2. Leave it **private** (no public access)
3. Create an R2 API token with **Object Read & Write** on this bucket only

### 3. Get your database connection strings

**Data Studio (local):**
```
postgresql://postgres:postgres@localhost:54322/postgres
```
(Default local Supabase credentials — change if you customised them.)

**Production:**
1. Supabase dashboard → `oxvhmulxuvlfjyjzleki` project → Project Settings → Database
2. Copy the **Direct connection** URI (not the pooler — pg_dump needs a direct connection)
3. It looks like: `postgresql://postgres:[PASSWORD]@db.oxvhmulxuvlfjyjzleki.supabase.co:5432/postgres`

### 4. Add to `.env.local`

```
CLOUDFLARE_R2_BUCKET_BACKUPS=buildquote-backups
BACKUP_DB_URL_DATA_STUDIO=postgresql://postgres:postgres@localhost:54322/postgres
BACKUP_DB_URL_PRODUCTION=postgresql://postgres:[PASSWORD]@db.oxvhmulxuvlfjyjzleki.supabase.co:5432/postgres
```

The R2 access key/secret are already in `.env.local` from source document setup — the backup script reuses them.

### 5. Test it manually

```powershell
python scripts/backup/backup_supabase.py
```

You should see both databases dump, compress, and upload. Check R2 for:
```
supabase/data-studio/2026-06-09T02-00-00Z.sql.gz
supabase/production/2026-06-09T02-00-00Z.sql.gz
```

---

## Schedule daily backups (Windows Task Scheduler)

Run this once in PowerShell to create a scheduled task:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "python" `
    -Argument "scripts\backup\backup_supabase.py" `
    -WorkingDirectory "C:\path\to\buildquote-data-studio"

$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName "BuildQuote — Supabase Backup" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest
```

To verify it's registered:
```powershell
Get-ScheduledTask -TaskName "BuildQuote — Supabase Backup"
```

To run it immediately (test):
```powershell
Start-ScheduledTask -TaskName "BuildQuote — Supabase Backup"
```

---

## Restoring from a backup

```powershell
# Download from R2 (use wrangler or aws cli with R2 endpoint)
aws s3 cp s3://buildquote-backups/supabase/production/2026-06-09T02-00-00Z.sql.gz . `
    --endpoint-url https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com

# Decompress
gzip -d 2026-06-09T02-00-00Z.sql.gz

# Restore to a local Supabase project
psql postgresql://postgres:postgres@localhost:54322/postgres < 2026-06-09T02-00-00Z.sql
```

**Never restore directly to production without testing on a local copy first.**

---

## Retention

The script automatically deletes backups older than 30 days from R2. Adjust `RETENTION_DAYS` in the script if needed.
