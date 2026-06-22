#!/usr/bin/env python3
"""
Local Docling PDF extraction script.

Writes output to .local/docling-output/<folder>/.
No database writes. No R2 uploads. No secrets. Local only.

Usage:
    python scripts/docling/extract_docling.py \
        --input "C:\\path\\to\\catalogue.pdf" \
        --document-id b576c341-bbb1-4124-ad41-9cc90c4816fc

Run from the repo root. Activate .venv-docling first.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


SAFE_OUTPUT_ROOT = Path(".local/docling-output")


def _make_safe_name(text):
    """Strip unsafe characters for use as a folder name."""
    return re.sub(r"[^\w\-]", "_", text)[:80]


def _resolve_output_dir(out_arg, stem, ts):
    if out_arg:
        out = Path(out_arg)
    else:
        out = SAFE_OUTPUT_ROOT / f"{_make_safe_name(stem)}_{ts}"

    resolved_root = SAFE_OUTPUT_ROOT.resolve()
    resolved_out = out.resolve()
    try:
        resolved_out.relative_to(resolved_root)
    except ValueError:
        sys.exit(
            f"[ERROR] --out must be under {SAFE_OUTPUT_ROOT}/.\n"
            f"Got: {out}"
        )

    return out


def _get_page_count(doc):
    try:
        pages = getattr(doc, "pages", None)
        if pages:
            return len(pages)
    except Exception:
        pass
    return None


def _get_table_count(doc):
    try:
        tables = getattr(doc, "tables", None)
        if tables is not None:
            return len(tables)
    except Exception:
        pass
    return None


def _check_page_coverage(doc, page_count):
    """
    Scan provenance data to find the highest page number Docling actually
    extracted content from. Returns (extracted_pages_count, extracted_pages_max).

    Docling sometimes silently stops extracting content partway through a PDF
    (memory pressure, rendering failures, complex layouts). This function detects
    that by comparing the max extracted page against the declared page_count.
    """
    extracted = set()
    for item in list(getattr(doc, "texts", []) or []) + list(getattr(doc, "tables", []) or []):
        for prov in getattr(item, "prov", []) or []:
            page_no = getattr(prov, "page_no", None)
            if page_no is not None:
                extracted.add(int(page_no))
    return len(extracted), (max(extracted) if extracted else None)


def _doc_to_json_str(doc):
    try:
        return doc.model_dump_json(indent=2)
    except Exception:
        try:
            return json.dumps(doc.model_dump(), indent=2, default=str)
        except Exception as exc:
            return json.dumps(
                {"error": f"Could not serialize document: {exc}"}, indent=2
            )


def extract(input_path, document_id, out_dir, no_ocr=False, allow_partial=False, no_image_processing=False):
    from docling.datamodel.base_models import InputFormat  # noqa: PLC0415
    from docling.document_converter import DocumentConverter, PdfFormatOption  # noqa: PLC0415

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[docling] Converting: {input_path.name}")
    if no_image_processing:
        print(
            "[docling] Image processing disabled — using native text/table extraction only.\n"
            "  Table structure detection and layout analysis are skipped.\n"
            "  Use this for large catalogues where image rendering causes memory errors."
        )
    elif not no_ocr:
        print(
            "[docling] Note: first run may download AI models (~1-2 GB). "
            "This is expected."
        )

    if no_image_processing:
        # Use DoclingParseDocumentBackend (docling's native C++ PDF parser).
        # Unlike the default pypdfium2 backend, this reads PDF structure directly
        # without rasterising pages to images — so it cannot std::bad_alloc on
        # pages with large embedded product photos.
        # do_table_structure=False also skips the vision-based table model.
        from docling.datamodel.pipeline_options import PdfPipelineOptions  # noqa: PLC0415
        from docling.backend.docling_parse_backend import DoclingParseDocumentBackend  # noqa: PLC0415
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = False
        pipeline_options.do_table_structure = False
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=pipeline_options,
                    backend=DoclingParseDocumentBackend,
                )
            }
        )
        print("[docling] Using DoclingParse backend (no image rendering, no table vision).")
    else:
        from docling.datamodel.pipeline_options import PdfPipelineOptions  # noqa: PLC0415
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = not no_ocr
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )

    result = converter.convert(str(input_path))
    doc = result.document

    # Markdown export
    md_text = doc.export_to_markdown()
    md_file = out_dir / "output.md"
    md_file.write_text(md_text, encoding="utf-8")

    # Docling document JSON
    doc_json_file = out_dir / "docling_document.json"
    doc_json_file.write_text(_doc_to_json_str(doc), encoding="utf-8")

    # Summary
    page_count = _get_page_count(doc)
    table_count = _get_table_count(doc)
    char_count = len(md_text)
    extracted_pages_count, extracted_pages_max = _check_page_coverage(doc, page_count)

    # Coverage check — fail hard if Docling stopped early.
    # A complete extraction should reach at least 90% of the declared page count.
    # Use --allow-partial to skip this guard (e.g. if the PDF is intentionally truncated).
    coverage_ok = True
    if not allow_partial and page_count and extracted_pages_max is not None:
        coverage_pct = extracted_pages_max / page_count
        if coverage_pct < 0.9:
            coverage_ok = False
            print(
                f"\n[ERROR] Incomplete Docling extraction detected!\n"
                f"  PDF pages declared : {page_count}\n"
                f"  Highest page found : {extracted_pages_max}\n"
                f"  Pages with content : {extracted_pages_count}\n"
                f"  Coverage           : {coverage_pct:.0%}\n"
                f"\n"
                f"  Docling stopped extracting at page {extracted_pages_max}.\n"
                f"  Pages {extracted_pages_max + 1}–{page_count} are missing.\n"
                f"  The parser WILL produce incorrect results from these chunks.\n"
                f"\n"
                f"  Possible causes:\n"
                f"    - Corrupt or partially-downloaded PDF\n"
                f"    - PDF rendering issue (complex layouts, embedded fonts)\n"
                f"    - Docling memory exhaustion on large documents\n"
                f"\n"
                f"  Fix: verify the PDF opens fully in a viewer, then re-run.\n"
                f"  To skip this guard: add --allow-partial\n"
            )

    summary = {
        "input_filename": input_path.name,
        "document_id": document_id,
        "page_count": page_count,
        "extracted_pages_count": extracted_pages_count,
        "extracted_pages_max": extracted_pages_max,
        "character_count": char_count,
        "table_count": table_count,
        "extraction_complete": coverage_ok,
        "output_files": {
            "markdown": md_file.name,
            "docling_json": doc_json_file.name,
            "summary": "summary.json",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    summary_file = out_dir / "summary.json"
    summary_file.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print("[docling] Done.")
    print(f"  Output folder : {out_dir}")
    print(f"  Files         : {md_file.name}, {doc_json_file.name}, {summary_file.name}")
    if page_count is not None:
        coverage_str = ""
        if extracted_pages_max is not None:
            pct = extracted_pages_max / page_count
            coverage_str = f"  (extracted up to page {extracted_pages_max} — {pct:.0%} coverage)"
        print(f"  Pages         : {page_count}{coverage_str}")
    print(f"  Characters    : {char_count:,}")
    if table_count is not None:
        print(f"  Tables        : {table_count}")

    if not coverage_ok:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Extract a local PDF using Docling. "
            "Outputs go to .local/docling-output/. "
            "No DB writes. No R2. Local only."
        )
    )
    parser.add_argument("--input", required=True, help="Path to local PDF file")
    parser.add_argument(
        "--document-id",
        default=None,
        metavar="UUID",
        help="Optional source_document_id to embed in summary.json",
    )
    parser.add_argument(
        "--out",
        default=None,
        metavar="DIR",
        help=(
            "Output directory. Must be under .local/docling-output/. "
            "Defaults to an auto-named subfolder based on the input filename."
        ),
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        default=False,
        help=(
            "Enable OCR. Only needed for scanned PDFs. "
            "Disabled by default — manufacturer catalogues are text-native "
            "and OCR can cause memory crashes on large images."
        ),
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        default=False,
        help=(
            "Skip the page-coverage guard and allow extraction to succeed even "
            "if Docling did not reach 90%% of the PDF pages. Use only when the "
            "PDF is intentionally partial or you have confirmed the missing pages "
            "contain no relevant product data."
        ),
    )
    parser.add_argument(
        "--no-image-processing",
        action="store_true",
        default=False,
        help=(
            "Disable image-based preprocessing (layout analysis, table structure "
            "detection via AI vision). Prevents std::bad_alloc crashes on PDFs "
            "with large embedded images. Text and native PDF table structure are "
            "still extracted. Use for large manufacturer catalogues."
        ),
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        sys.exit(f"[ERROR] Input file not found: {input_path}")
    if input_path.suffix.lower() != ".pdf":
        sys.exit(f"[ERROR] Input must be a .pdf file. Got: {input_path.name}")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = _resolve_output_dir(args.out, input_path.stem, ts)

    try:
        extract(
            input_path,
            args.document_id,
            out_dir,
            no_ocr=not args.ocr,
            allow_partial=args.allow_partial,
            no_image_processing=args.no_image_processing,
        )
    except ImportError as exc:
        sys.exit(
            f"[ERROR] Docling import failed: {exc}\n\n"
            "Activate the venv and install Docling:\n"
            "  .venv-docling\\Scripts\\Activate.ps1\n"
            "  python -m pip install docling\n"
        )
    except Exception as exc:
        sys.exit(f"[ERROR] Extraction failed: {exc}")


if __name__ == "__main__":
    main()
