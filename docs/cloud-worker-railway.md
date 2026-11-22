# Deploying the Cloud Pipeline Worker (Railway)

This turns Data Studio's ingestion funnel (`fetch_url` → `docling` → `system_identity_parser` + `knowledge_parser` → `embed`) into an always-on cloud service so manufacturers can upload documents 24/7 without your PC running.

## Why Railway
- **Usage-based pricing (~$5/mo Hobby plan):** Idle polling uses ~60 MB RAM (~$1–2/mo) and automatically bursts up to 8 GB RAM during PDF extraction so large catalogues don't OOM.
- **Zero-config deploys:** `railway.toml` and `Dockerfile.worker` in the repo root tell Railway exactly how to build and start the worker.
- **Region:** Pick **Asia-Southeast (Singapore)** (closest to Perth WA & Sydney Supabase).

## 5-Minute Setup
1. Sign in to [railway.com](https://railway.com) with GitHub → **New Project → Deploy from GitHub repo** → select `BuildQuote-Manufacturer-Data-Studio`.
2. Railway auto-detects `railway.toml` + `Dockerfile.worker`.
3. Under **Settings → Networking**, leave public networking **disabled** (this is a private background worker polling Supabase, no incoming HTTP port needed).
4. Under **Settings → Deploy → Region**, select **Southeast Asia (Singapore)**.
5. Under **Variables**, add these environment variables (same values as your Data Studio Vercel project / `.env.local`):

| Variable | Value |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ovndokzwkxpfjfobewaq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Data Studio service role key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (Claude extraction) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (also accepts `CLOUDFLARE_R2_ACCOUNT_ID`) |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret key |
| `CLOUDFLARE_R2_BUCKET_SOURCE_DOCUMENTS` | Your R2 bucket name (also accepts `CLOUDFLARE_R2_BUCKET_NAME`) |
| `CLOUDFLARE_R2_PUBLIC_BASE_URL` | Your R2 public URL (also accepts `CLOUDFLARE_R2_PUBLIC_URL`) |
| `VOYAGE_API_KEY` | *(Optional)* Voyage AI key for card embeddings |
| `RESEND_API_KEY` | *(Optional)* Failure alert emails |
| `PIPELINE_NOTIFY_EMAIL` | *(Optional)* Where to send failure alert emails |

6. Click **Deploy**. Check **Deploy Logs** — you should see:
   ```text
   [worker] BuildQuote Pipeline Worker starting
   [worker] Supabase  : https://ovndokzwkxpfjfobewaq.supabase.co
   [worker] R2 bucket : ... (account=set)
   [worker] Polling every 4s — Ctrl+C or SIGTERM to stop
   ```

## Verifying End-to-End (e.g. James Hardie — HardieDeck)
1. Open `studio.buildquote.com.au` → select/create **James Hardie** → add system **HardieDeck**.
2. In **Set up HardieDeck**:
   - Step 1: Upload product photos
   - Step 2: Upload colour/finish swatches (or skip if customer-painted)
   - Step 3: Add `https://www.jameshardie.com.au/products/hardiedeck-system`
   - Step 4: Upload the HardieDeck Installation Guide & Sealing Guide PDFs (or paste their direct PDF URLs)
   - Step 5: Click **Create System Card**
3. Watch live progress move through **Reading PDF documents** → **Extracting product specs, dimensions & variants** → **Building technical & installation knowledge**.
4. Click **Go to Verify systems →** to confirm extracted fields, then publish to **RFQ** Supabase (`oxvhmulxuvlfjyjzleki`) so **HardieDeck** appears live in `Decks-WA`!
