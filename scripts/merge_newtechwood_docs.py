#!/usr/bin/env python3
"""One-off merge of all NewTechWood Docling outputs into a single parser input.

Finds the latest docling-output dir per document_id, re-tags each document's
chunks with a SOURCE marker and globally unique chunk numbers, and writes the
combined markdown to .local/docling-output/newtechwood_merged.md.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
OUTPUT_ROOT = REPO_ROOT / ".local" / "docling-output"

# (document_id, label, document_type) — ordered so spec-table-rich docs come first
DOCS = [
    ("5d8cfdfb-24bc-4182-82e4-6db45575d791", "Reseller Spec Sheet (Jul 2026)", "technical_data_sheet"),
    ("0dc2529b-7f47-4e95-b9d3-ce6004cb4dd2", "Product Brochure (Oct 2025)", "brochure"),
    ("1cfe78a7-a32e-4a2e-b1f5-c80044165fc7", "Terrace Decking US49C Technical Sheet", "technical_data_sheet"),
    ("4d778d51-fe55-4928-805e-6af1cefbf157", "Coastal Decking US54C Technical Sheet", "technical_data_sheet"),
    ("3e771582-884c-44b2-8fc5-86997351225e", "Avenue Decking US92 Technical Sheet", "technical_data_sheet"),
    ("7767a3d4-fac5-48d2-97b2-fb383458aa3e", "Marina Board US71 Decking Technical Sheet", "technical_data_sheet"),
    ("262b03a2-9634-4fa4-bdec-3e2b08686800", "Shadowline US31 Cladding Technical Sheet", "technical_data_sheet"),
    ("8e3990a7-6052-42b2-97e2-d27de5c09365", "Castellation UH58 (50mm) Technical Sheet", "technical_data_sheet"),
    ("33051340-5c11-4d94-b3cc-2faa36d9b0c5", "Castellation UH93 Technical Sheet", "technical_data_sheet"),
    ("01feadcb-ea37-4438-b5c1-4f829936631d", "Screening UH55 Technical Sheet", "technical_data_sheet"),
    ("2fd3a87a-04ea-4eeb-9473-36d9d126adff", "Quick Panel UH122R Technical Sheet", "technical_data_sheet"),
    ("9f7b7e66-eff4-4bc2-a883-48763a56f3d8", "Nivo Pedestals Technical Info & Span Tables", "technical_data_sheet"),
    ("e3b734a9-88f1-4cd4-bc18-0789ee6f9fae", "Terrace Decking Installation Guide", "installation_guide"),
    ("7da36269-ac3d-4adf-914d-20276a6d76f4", "Coastal Decking Installation Guide", "installation_guide"),
    ("5dcfe381-9877-4f97-b022-a6f4933603cc", "Marina Decking Installation Guide", "installation_guide"),
    ("86368b0a-5aaf-438a-a2c3-ea3c6a96bc42", "Avenue Decking Installation Guide", "installation_guide"),
    ("7c3c6a7c-9700-487c-b400-30283d45b5b0", "Castellation Wall Cladding System Codemark", "installation_guide"),
    ("0d5f8e58-f965-4c78-9d36-19ca587494bb", "Shadowline Codemark", "installation_guide"),
    ("e967aa93-ff1b-4c06-a3ab-ce1bfe530c7c", "Screening Installation Guide", "installation_guide"),
    ("3f70c7f4-d9cb-4afb-a4f6-e53f104640c8", "Trim Kits", "installation_guide"),
    ("f947c093-48ae-4c54-b228-76916031a231", "Cobra T-Clip Installation Guide", "installation_guide"),
    ("6b50a3a9-8431-4ba9-8835-3897030d2974", "Mini Gap Clip Installation", "installation_guide"),
    ("4b329b7e-7605-4955-a861-104b0d5191e8", "UH122R Quick Panel Installation Guide", "installation_guide"),
    ("4e3dfa5c-c933-4e62-ad66-e6edd36f7111", "Structural Install Guide (2022)", "installation_guide"),
    ("162d99fa-c37f-4bb9-9ab6-9b073296c1eb", "Pool Fence Installation Guide (2026)", "installation_guide"),
]

CHUNK_RE = re.compile(r'<!--\s*chunk\s+(\d+):\s*pages\s+(\d+)-(\d+)\s*-->')


def latest_output_dir(document_id: str) -> Path | None:
    candidates = sorted(
        [d for d in OUTPUT_ROOT.iterdir() if d.name.startswith(document_id + "_chunked")],
        reverse=True,
    )
    return candidates[0] if candidates else None


def main():
    out_parts = []
    next_chunk_no = 1
    missing = []
    for doc_id, label, doc_type in DOCS:
        d = latest_output_dir(doc_id)
        if not d:
            missing.append((doc_id, label))
            continue
        md = (d / "output.md").read_text(encoding="utf-8")
        matches = list(CHUNK_RE.finditer(md))
        out_parts.append(f"<!-- SOURCE: {label} ({doc_type}) -->\n")
        if not matches:
            out_parts.append(md.strip() + "\n\n")
            continue
        for i, m in enumerate(matches):
            page_start, page_end = m.group(2), m.group(3)
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
            body = md[start:end].strip()
            out_parts.append(f"<!-- chunk {next_chunk_no}: pages {page_start}-{page_end} -->\n{body}\n\n")
            next_chunk_no += 1

    merged = "".join(out_parts)
    out_path = OUTPUT_ROOT / "newtechwood_merged.md"
    out_path.write_text(merged, encoding="utf-8")
    print(f"Wrote {out_path} ({len(merged)} chars, {next_chunk_no - 1} chunks)")
    if missing:
        print("MISSING docling output for:")
        for doc_id, label in missing:
            print(f"  {doc_id}  {label}")


if __name__ == "__main__":
    main()
