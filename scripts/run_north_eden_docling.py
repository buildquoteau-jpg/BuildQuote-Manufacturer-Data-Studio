#!/usr/bin/env python3
"""Sequential Docling fallback and globally renumbered merge for North Eden Timber."""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT / ".local" / "pipeline-temp"
OUTPUT = ROOT / ".local" / "docling-output"
DOCS = [
    ("8fc4cbd7-7ab3-4cf2-a819-7f5fa3c04d69", "North Eden Timber Cladding Product and Installation Guide 2025", "brochure"),
    ("953c6ea2-5a2c-41b3-97fc-74d0884a417e", "North Eden Timber Watershield Decking Profile", "technical_data_sheet"),
    ("ea7bf8eb-3473-48f1-bf83-bc0d3ee15228", "Australian Hardwood Species Reference Guide - Ironbark", "technical_data_sheet"),
    ("ef2159f1-7419-4959-98fe-54669d4c64f0", "Australian Hardwood Species Reference Guide - Spotted Gum", "technical_data_sheet"),
    ("854e5332-552c-48af-92eb-6d31e2e561d9", "Australian Hardwood Species Reference Guide - Forest Red Gum", "technical_data_sheet"),
    ("f1e5ae6b-3a9d-4aa7-8a30-3343db2c4f74", "Australian Hardwood Species Reference Guide - Blackbutt", "technical_data_sheet"),
    ("5dcae9dd-b8d9-4717-944f-4740360f112e", "Australian Hardwood Species Reference Guide - Silvertop Ash", "technical_data_sheet"),
    ("3ec410fd-c4d7-4ad9-8d9d-b90fa30f98d0", "Australian Hardwood Species Reference Guide - Brown Barrel", "technical_data_sheet"),
    ("1d3cc37a-9d9c-4da8-b834-ec57d618670b", "Australian Hardwood Species Reference Guide - White Mahogany", "technical_data_sheet"),
    ("6612a6f3-1a97-4306-a0df-051f350d0f2b", "Australian Hardwood Species Reference Guide - White Cypress", "technical_data_sheet"),
]
CHUNK_RE = re.compile(r"<!--\s*chunk\s+(\d+):\s*pages\s+(\d+)-(\d+)\s*-->")


def latest(doc_id):
    candidates = sorted(OUTPUT.glob(doc_id + "_chunked_*"), reverse=True)
    return candidates[0] if candidates else None


def main():
    for doc_id, label, _ in DOCS:
        if latest(doc_id):
            print(f"[skip] {label}")
            continue
        print(f"[extract] {label}")
        subprocess.run([sys.executable, str(ROOT / "scripts/docling/extract_docling_chunked.py"),
                        "--input", str(TEMP / f"{doc_id}.pdf"), "--chunk-size", "7"],
                       cwd=ROOT, check=True)
    parts, chunk_no = [], 1
    for doc_id, label, doc_type in DOCS:
        source = latest(doc_id)
        if not source:
            raise RuntimeError(f"Missing output for {label}")
        text = (source / "output.md").read_text(encoding="utf-8")
        matches = list(CHUNK_RE.finditer(text))
        parts.append(f"<!-- SOURCE: {label} ({doc_type}) -->\n")
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            body = text[match.end():end].strip()
            parts.append(f"<!-- chunk {chunk_no}: pages {match.group(2)}-{match.group(3)} -->\n{body}\n\n")
            chunk_no += 1
    merged = OUTPUT / "north_eden_timber_merged.md"
    merged.write_text("".join(parts), encoding="utf-8")
    print(f"[done] {merged} ({chunk_no - 1} globally unique chunks)")


if __name__ == "__main__":
    main()
