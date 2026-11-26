#!/usr/bin/env python3
"""
Chunked Docling extraction for large PDFs that cause std::bad_alloc.

Splits the PDF into page-range chunks, runs extract_docling.py on each,
then merges the markdown and summary into a single output folder.

Usage:
    python scripts/docling/extract_docling_chunked.py \
        --input "C:\\path\\to\\catalogue.pdf" \
        --chunk-size 14

Run from the repo root. Activate .venv-docling first.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pypdfium2 as pdfium

# scripts/lib is importable regardless of cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.pipeline_report import PipelineReporter  # noqa: E402

SAFE_OUTPUT_ROOT = Path(".local/docling-output")

# Module-level so the __main__ wrapper can report crashes that escape main().
REPORTER = None


def _make_safe_name(text):
    return re.sub(r"[^\w\-]", "_", text)[:80]


def split_pdf_chunk(input_path: Path, start: int, end: int, out_path: Path):
    """Extract pages start..end (1-indexed, inclusive) to a new PDF."""
    doc = pdfium.PdfDocument(str(input_path))
    new_doc = pdfium.PdfDocument.new()
    page_indices = list(range(start - 1, end))  # pypdfium2 is 0-indexed
    new_doc.import_pages(doc, page_indices)
    new_doc.save(str(out_path))
    doc.close()
    new_doc.close()


def _page_needs_vision_fallback(page_md: str) -> bool:
    """Detect scanned/graphic spec pages or mangled multi-column tables where
    pymupdf4llm drops column alignment (e.g. 'Col1'/'Col2' synthetic headers)."""
    stripped = (page_md or "").strip()
    if len(stripped) < 150:
        return True
    # pymupdf4llm emits '|Col1|Col2|...' when it cannot detect real column headers
    if re.search(r"\|\s*Col\d+\s*\|", stripped):
        return True
    # Detect heavily broken pipe tables (many empty cells like '| | | |')
    broken_rows = len(re.findall(r"(\|\s*){4,}", stripped))
    if broken_rows >= 4:
        return True
    return False


def _vision_transcribe_page(input_path: Path, page_index_0: int, page_no: int) -> str | None:
    """Render one complex/scanned PDF page at 150 DPI via PyMuPDF (fitz) and
    transcribe tables & specs into clean Markdown via Claude Vision. Fails soft."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or os.environ.get("ENABLE_VISION_TABLE_FALLBACK", "1").lower() in ("0", "false", "no"):
        return None
    try:
        import base64  # noqa: PLC0415
        import anthropic  # noqa: PLC0415
        import fitz  # noqa: PLC0415

        doc = fitz.open(str(input_path))
        page = doc.load_page(page_index_0)
        # Skip blank or purely decorative full-bleed photo pages with no text at all
        # unless there is at least some graphic/vector structure; cap DPI at 150 to keep RAM low.
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes("png")
        doc.close()
        if not png_bytes or len(png_bytes) > 4_500_000:
            return None

        b64 = base64.standard_b64encode(png_bytes).decode("ascii")
        client = anthropic.Anthropic(api_key=api_key)
        model_id = os.environ.get("ANTHROPIC_MODEL") or "claude-sonnet-5-5"
        prompt = (
            f"Transcribe page {page_no} of this construction product document into clean GitHub-Flavoured Markdown.\n"
            "Rules:\n"
            "1. Preserve EVERY product name, column header, table cell, dimension, SKU, BAL rating, slip rating, joist span, clearance, warranty, warning, and footnote verbatim.\n"
            "2. For multi-product comparison tables, keep exact column-to-product alignment so sibling products are never mixed up.\n"
            "3. If this page is purely decorative photography with no technical text or specs, reply with exactly: [DECORATIVE_IMAGE_PAGE]\n"
            "4. Output Markdown only — no preamble or commentary."
        )
        for attempt_model in (model_id, "claude-sonnet-5", "claude-sonnet-4-6"):
            try:
                resp = client.messages.create(
                    model=attempt_model,
                    max_tokens=4000,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": "image/png", "data": b64},
                            },
                            {"type": "text", "text": prompt},
                        ],
                    }],
                )
                text = next((b.text for b in resp.content if b.type == "text"), "").strip()
                if not text or "[DECORATIVE_IMAGE_PAGE]" in text:
                    return None
                return text
            except Exception as e:
                if ("404" in str(e) or "not_found" in str(e).lower()) and attempt_model != "claude-sonnet-4-6":
                    continue
                raise
    except Exception as e:
        print(f"  [vision-fallback] p.{page_no} skipped ({e})")
    return None


def run_chunk_pymupdf(input_path: Path, page_start: int, page_end: int, out_dir: Path, chunk_no: int) -> dict:
    """Fast, low-memory PDF-to-Markdown + table extraction via pymupdf4llm (~50 MB RAM),
    with selective Vision fallback for mangled comparison tables or scanned spec pages."""
    import pymupdf4llm  # noqa: PLC0415

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"\n[chunked] Extracting chunk {chunk_no} (pages {page_start}-{page_end}) via pymupdf4llm")
    page_indices = list(range(page_start - 1, page_end))

    # Extract page-by-page so we can detect & upgrade individual broken table pages
    # without re-processing clean text pages.
    page_mds: list[str] = []
    vision_used = 0
    max_vision_per_chunk = int(os.environ.get("MAX_VISION_PAGES_PER_CHUNK", "4"))

    for idx in page_indices:
        page_no = idx + 1
        raw_page = pymupdf4llm.to_markdown(str(input_path), pages=[idx])
        if isinstance(raw_page, list):
            page_md = "\n\n".join(str(x.get("text", x) if isinstance(x, dict) else x) for x in raw_page)
        else:
            page_md = str(raw_page or "")
        page_md = page_md.strip()

        if vision_used < max_vision_per_chunk and _page_needs_vision_fallback(page_md):
            transcribed = _vision_transcribe_page(input_path, idx, page_no)
            if transcribed:
                print(f"  [vision-fallback] Upgraded p.{page_no} ({len(page_md)} -> {len(transcribed)} chars)")
                page_md = transcribed
                vision_used += 1

        if page_md:
            page_mds.append(f"<!-- page {page_no} -->\n{page_md}")

    md_text = "\n\n".join(page_mds).strip()

    (out_dir / "output.md").write_text(md_text, encoding="utf-8")
    table_count = len(re.findall(r"^\|.+\|\s*\n\|[\s:\-|]+\|", md_text, flags=re.MULTILINE))
    summary = {
        "input_filename": input_path.name,
        "engine": "pymupdf4llm+vision" if vision_used > 0 else "pymupdf4llm",
        "page_count": len(page_indices),
        "vision_pages": vision_used,
        "character_count": len(md_text),
        "table_count": table_count,
        "extraction_complete": True,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  [pymupdf4llm] Pages: {len(page_indices)}, Chars: {len(md_text):,}, Tables: {table_count}, Vision: {vision_used}")
    return summary


def run_chunk(input_path: Path, out_dir: Path, chunk_no: int) -> dict:
    """Run extract_docling.py on a chunk PDF. Returns the summary dict."""
    print(f"\n[chunked] Running Docling on chunk {chunk_no}: {input_path.name}")
    result = subprocess.run(
        [
            sys.executable,
            "scripts/docling/extract_docling.py",
            "--input", str(input_path),
            "--no-image-processing",
            "--allow-partial",
            "--out", str(out_dir),
        ],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        print(f"  [chunked] Docling subprocess exited with code {result.returncode}")

    summary_file = out_dir / "summary.json"
    if summary_file.exists():
        return json.loads(summary_file.read_text(encoding="utf-8"))
    return {"error": f"chunk {chunk_no} produced no summary.json (exit {result.returncode})"}


def merge_outputs(chunk_dirs: list, total_pages: int, out_dir: Path, input_path: Path):
    """Merge markdown files and summaries from all chunks into out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)

    merged_md = []
    merged_summaries = []
    total_chars = 0
    total_tables = 0
    all_complete = True

    for chunk_no, (chunk_dir, page_start, page_end) in enumerate(chunk_dirs, 1):
        md_file = chunk_dir / "output.md"
        summary_file = chunk_dir / "summary.json"

        if md_file.exists():
            md_text = md_file.read_text(encoding="utf-8")
            merged_md.append(f"\n\n<!-- chunk {chunk_no}: pages {page_start}-{page_end} -->\n\n")
            merged_md.append(md_text)
            total_chars += len(md_text)
        else:
            merged_md.append(f"\n\n<!-- chunk {chunk_no}: pages {page_start}-{page_end} — NO OUTPUT -->\n\n")
            all_complete = False

        if summary_file.exists():
            s = json.loads(summary_file.read_text(encoding="utf-8"))
            merged_summaries.append(s)
            total_tables += s.get("table_count") or 0
            if not s.get("extraction_complete", True):
                all_complete = False

    # Write merged markdown
    merged_md_path = out_dir / "output.md"
    merged_md_path.write_text("".join(merged_md), encoding="utf-8")

    # Write merged summary
    summary = {
        "input_filename": input_path.name,
        "page_count": total_pages,
        "chunk_count": len(chunk_dirs),
        "character_count": total_chars,
        "table_count": total_tables,
        "extraction_complete": all_complete,
        "chunks": [
            {
                "chunk_no": i + 1,
                "page_start": page_start,
                "page_end": page_end,
                "summary": merged_summaries[i] if i < len(merged_summaries) else None,
            }
            for i, (_, page_start, page_end) in enumerate(chunk_dirs)
        ],
        "output_files": {
            "markdown": "output.md",
            "summary": "summary.json",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\n[chunked] Merge complete.")
    print(f"  Output folder : {out_dir}")
    print(f"  Pages         : {total_pages}")
    print(f"  Characters    : {total_chars:,}")
    print(f"  Tables        : {total_tables}")
    print(f"  Complete      : {all_complete}")

    return all_complete


def main():
    parser = argparse.ArgumentParser(
        description="Chunked Docling extraction for large PDFs."
    )
    parser.add_argument("--input", required=True, help="Path to local PDF file")
    parser.add_argument("--chunk-size", type=int, default=14, help="Pages per chunk (default: 14)")
    parser.add_argument("--out", default=None, help="Output directory under .local/docling-output/")
    parser.add_argument("--start-page", type=int, default=None, help="First page to extract (1-indexed, default: 1)")
    parser.add_argument("--end-page", type=int, default=None, help="Last page to extract (1-indexed, default: last page)")
    parser.add_argument(
        "--engine",
        choices=["auto", "pymupdf", "docling"],
        default=os.environ.get("PDF_EXTRACTOR", "auto").lower(),
        help="Extraction engine: pymupdf (fast, low RAM), docling, or auto (default: PDF_EXTRACTOR env or auto)",
    )
    args = parser.parse_args()

    engine = args.engine
    if engine == "auto":
        try:
            import pymupdf4llm  # noqa: F401, PLC0415
            engine = "pymupdf"
        except ImportError:
            engine = "docling"

    input_path = Path(args.input)
    if not input_path.exists():
        sys.exit(f"[ERROR] File not found: {input_path}")

    # Count pages
    doc = pdfium.PdfDocument(str(input_path))
    total_pages = len(doc)
    doc.close()

    start_page = args.start_page or 1
    end_page   = args.end_page   or total_pages
    if start_page < 1 or end_page > total_pages or start_page > end_page:
        sys.exit(f"[ERROR] Invalid page range {start_page}-{end_page} (PDF has {total_pages} pages)")

    print(f"[chunked] PDF has {total_pages} pages, extracting p{start_page}-p{end_page}, chunk size {args.chunk_size}")

    # Report to pipeline_jobs so manual terminal runs are visible in the
    # pipeline UI. Worker-spawned runs attach to the worker's job row via
    # PIPELINE_JOB_ID (progress keys mirror the worker's shape).
    global REPORTER
    total_chunks = -(-(end_page - start_page + 1) // args.chunk_size)  # ceiling div
    REPORTER = PipelineReporter.start(
        "docling",
        payload={"input": input_path.name, "chunk_size": args.chunk_size,
                 "pages": f"{start_page}-{end_page}"},
    )

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stem = _make_safe_name(input_path.stem)

    # Output root
    if args.out:
        final_out = SAFE_OUTPUT_ROOT / args.out
    else:
        suffix = f"_p{start_page}-p{end_page}" if (args.start_page or args.end_page) else ""
        final_out = SAFE_OUTPUT_ROOT / f"{stem}_chunked{suffix}_{ts}"

    chunks_dir = final_out / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    # Split and extract each chunk
    chunk_dirs = []
    page = start_page
    chunk_no = 1
    while page <= end_page:
        page_end = min(page + args.chunk_size - 1, end_page)

        chunk_pdf = chunks_dir / f"chunk_{chunk_no:02d}_p{page:03d}-p{page_end:03d}.pdf"
        chunk_out = chunks_dir / f"chunk_{chunk_no:02d}_out"

        print(f"\n[chunked] Splitting pages {page}-{page_end} -> {chunk_pdf.name}")
        REPORTER.progress(
            {"totalPages": total_pages, "totalChunks": total_chunks,
             "currentChunk": {"chunkNo": chunk_no, "startPage": page, "endPage": page_end}},
            log_line=f"extract ({engine}) chunk {chunk_no}/{total_chunks} (pages {page}-{page_end})",
        )
        if engine == "pymupdf":
            run_chunk_pymupdf(input_path, page, page_end, chunk_out, chunk_no)
        else:
            split_pdf_chunk(input_path, page, page_end, chunk_pdf)
            run_chunk(chunk_pdf, chunk_out, chunk_no)
        chunk_dirs.append((chunk_out, page, page_end))

        page = page_end + 1
        chunk_no += 1

    # Merge all outputs. Non-zero exit on incomplete extraction (e.g. a broken
    # docling dependency) so callers that check returncode — the pipeline
    # worker's handle_docling in particular — actually see the failure instead
    # of a job silently marked "done" with zero real content.
    all_complete = merge_outputs(chunk_dirs, end_page - start_page + 1, final_out, input_path)
    if not all_complete:
        msg = "Extraction incomplete — one or more chunks failed (see errors above)."
        REPORTER.fail(msg)
        sys.exit(f"[ERROR] {msg}")

    REPORTER.done({
        "chunks": len(chunk_dirs),
        "pages": end_page - start_page + 1,
        "outputDir": str(final_out),
    })


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if REPORTER is not None and not REPORTER.terminal_sent and e.code not in (0, None):
            REPORTER.fail(str(e.code))
        raise
    except KeyboardInterrupt:
        if REPORTER is not None and not REPORTER.terminal_sent:
            REPORTER.fail("interrupted by user (Ctrl+C)")
        raise
    except Exception as e:
        if REPORTER is not None and not REPORTER.terminal_sent:
            REPORTER.fail(f"{type(e).__name__}: {e}")
        raise
