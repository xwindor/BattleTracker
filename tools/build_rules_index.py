#!/usr/bin/env python3
"""
Turn the SR5 core rulebook PDF into a page-anchored, greppable rules index.

Why this exists: agents cannot reliably read a 490-page PDF on demand, and if
they try they hallucinate page numbers. This produces one text file per page
plus a single flat index, so a subagent can grep for a term and get back an
exact PDF page AND printed page number it can cite.

Usage:
    pip install pdfplumber
    python tools/build_rules_index.py /path/to/SR5_Core.pdf --offset 0

--offset: printed_page = pdf_page - offset. SR5 core PDFs usually carry
front matter, so pdf page 32 might be printed page 30. Run once with
--calibrate to have it guess the offset from page footers, then verify by
opening two or three pages yourself. Getting this wrong poisons every
citation downstream, so verify it manually before trusting the pipeline.

Output:
    rules/pages/p0032.txt     one file per PDF page, header states both numbers
    rules/index.jsonl         one record per page: pdf_page, printed_page, text
    rules/headings.md         detected section headings -> page, for fast lookup
"""

import argparse
import json
import re
from pathlib import Path

import pdfplumber

FOOTER_NUM = re.compile(r"^\s*(\d{1,3})\s*$")
# SR5 headings are short, mostly-uppercase lines. Tune if your PDF differs.
HEADING = re.compile(r"^[A-Z][A-Z0-9 ,'\-:&/()]{3,60}$")


def guess_offset(pdf, sample=40):
    """Compare printed footer numbers against pdf page indices."""
    votes = {}
    for i, page in enumerate(pdf.pages[:sample], start=1):
        text = page.extract_text() or ""
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        for line in lines[-3:] + lines[:2]:
            m = FOOTER_NUM.match(line)
            if m:
                votes[i - int(m.group(1))] = votes.get(i - int(m.group(1)), 0) + 1
    if not votes:
        return 0
    return max(votes, key=votes.get)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default="rules")
    ap.add_argument("--offset", type=int, default=None)
    ap.add_argument("--calibrate", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    (out / "pages").mkdir(parents=True, exist_ok=True)

    with pdfplumber.open(args.pdf) as pdf:
        offset = args.offset
        if offset is None:
            offset = guess_offset(pdf)
            print(f"Guessed offset: {offset}  (printed = pdf - {offset})")
            if args.calibrate:
                print("Verify against the physical book, then rerun with --offset N")
                return

        index_path = out / "index.jsonl"
        headings = []
        with index_path.open("w", encoding="utf-8") as idx:
            for i, page in enumerate(pdf.pages, start=1):
                text = page.extract_text(layout=True) or ""
                printed = i - offset
                header = f"[PDF page {i} | printed page {printed}]\n"
                (out / "pages" / f"p{i:04d}.txt").write_text(
                    header + text, encoding="utf-8"
                )
                idx.write(
                    json.dumps(
                        {"pdf_page": i, "printed_page": printed, "text": text},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                for line in text.splitlines():
                    s = line.strip()
                    if HEADING.match(s) and len(s.split()) <= 8:
                        headings.append((s, i, printed))

        seen = set()
        with (out / "headings.md").open("w", encoding="utf-8") as fh:
            fh.write("# Detected headings (heading | pdf page | printed page)\n\n")
            for h, i, printed in headings:
                key = (h, i)
                if key in seen:
                    continue
                seen.add(key)
                fh.write(f"- {h} | {i} | {printed}\n")

    print(f"Wrote {out}/pages, {out}/index.jsonl, {out}/headings.md")
    print("Add rules/ to .gitignore — it is copyrighted text from your own PDF.")


if __name__ == "__main__":
    main()
