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
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pypdfium2 as pdfium

SAFE_OUTPUT_ROOT = Path(".local/docling-output")


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

    summary_file = out_dir / "summary.json"
    if summary_file.exists():
        return json.loads(summary_file.read_text(encoding="utf-8"))
    return {"error": f"chunk {chunk_no} produced no summary.json"}


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
    args = parser.parse_args()

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
        sys.exit("[ERROR] Extraction incomplete — one or more chunks failed (see errors above).")


if __name__ == "__main__":
    main()
