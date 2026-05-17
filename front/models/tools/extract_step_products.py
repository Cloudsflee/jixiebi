#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract PRODUCT names from a STEP assembly file.

Usage:
  python front/models/tools/extract_step_products.py --input 装配体.STEP --outdir front/models
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def decode_step_bytes(data: bytes) -> tuple[str, str]:
    encodings = ["utf-8", "gb18030", "gbk", "cp936"]
    for enc in encodings:
        try:
            text = data.decode(enc)
            return text, enc
        except UnicodeDecodeError:
            continue
    # fallback: permissive decode
    return data.decode("latin1", errors="ignore"), "latin1(ignore)"


def extract_products(step_text: str) -> list[str]:
    names = re.findall(r"= PRODUCT \( '([^']*)'", step_text)
    # keep order + dedup
    seen = set()
    uniq = []
    for n in names:
        if n not in seen:
            seen.add(n)
            uniq.append(n)
    return uniq


def write_outputs(input_path: Path, outdir: Path, encoding: str, products: list[str]) -> None:
    outdir.mkdir(parents=True, exist_ok=True)

    out_json = outdir / "step_products.json"
    out_md = outdir / "step_products.md"

    out_json.write_text(
        json.dumps(
            {
                "source": str(input_path.name),
                "decode_encoding": encoding,
                "product_count": len(products),
                "products": products,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    md_lines = [
        "# STEP 装配体部件清单",
        "",
        f"- 源文件：`{input_path.name}`",
        f"- 解析编码：`{encoding}`",
        f"- 部件数量：`{len(products)}`",
        "",
        "## 部件名",
        "",
    ]
    for idx, name in enumerate(products, 1):
        md_lines.append(f"{idx}. {name}")

    out_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=False, help="STEP file path")
    parser.add_argument("--outdir", default="front/models", help="output directory")
    args = parser.parse_args()

    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"STEP file not found: {input_path}")
    else:
        # auto pick first STEP/STP in cwd
        candidates = list(Path(".").glob("*.STEP")) + list(Path(".").glob("*.step")) + list(Path(".").glob("*.STP")) + list(Path(".").glob("*.stp"))
        if not candidates:
            raise FileNotFoundError("No STEP/STP file found in current directory")
        input_path = candidates[0]

    text, enc = decode_step_bytes(input_path.read_bytes())
    products = extract_products(text)
    write_outputs(input_path, Path(args.outdir), enc, products)

    print(f"ok: extracted {len(products)} products from {input_path.name} ({enc})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())