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


def extract(input_path, document_id, out_dir, no_ocr=False):
    from docling.datamodel.base_models import InputFormat  # noqa: PLC0415
    from docling.datamodel.pipeline_options import PdfPipelineOptions  # noqa: PLC0415
    from docling.document_converter import DocumentConverter, PdfFormatOption  # noqa: PLC0415

    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[docling] Converting: {input_path.name}")
    if no_ocr:
        print("[docling] OCR disabled — treating as text-native PDF.")
    else:
        print(
            "[docling] Note: first run may download AI models (~1-2 GB). "
            "This is expected."
        )

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

    summary = {
        "input_filename": input_path.name,
        "document_id": document_id,
        "page_count": page_count,
        "character_count": char_count,
        "table_count": table_count,
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
        print(f"  Pages         : {page_count}")
    print(f"  Characters    : {char_count:,}")
    if table_count is not None:
        print(f"  Tables        : {table_count}")


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
        "--no-ocr",
        action="store_true",
        default=False,
        help=(
            "Disable OCR. Use for text-native PDFs (not scanned). "
            "Avoids memory crashes on large images in brochures."
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
        extract(input_path, args.document_id, out_dir, no_ocr=args.no_ocr)
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
