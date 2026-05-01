#!/usr/bin/env python3
"""Fetch a canine DLBCL tumor/normal WGS pair for mutavax smoke tests.

Dataset: PRJNA805123 — Canine diffuse large B-cell lymphoma (cDLBCL) WGS
The study pairs a DLBCL tumor biopsy with a matched skin-punch "normal" from
the same dog (same ``sample_accession``); Mutect2 tumor/normal analysis
therefore has a real matched control.

Default pair is DLBCL1 (sample SAMN08874634) — the smallest-file pair in the
cohort, chosen so smoke subsets start fast:
    tumor  = SRR15540953  (cf_DLBCL1, ~96 Gbp paired)
    normal = SRR15540951  (cf_punch1, ~52 Gbp paired)

Smoke mode streams a slice from each ENA-hosted FASTQ and rewrites them with
mutavax's expected R1/R2 suffixes. Full mode downloads every base (expect
~45 GB compressed for DLBCL1). Override ``--tumor-run`` / ``--normal-run`` to
use a different pair from the same cohort (or any other ENA read-pair pair).
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import shutil
from pathlib import Path
from typing import Final, Iterable
from urllib.request import Request, urlopen


DATASET_NAME: Final = "canine-dlbcl-wgs"
DEFAULT_OUTPUT_ROOT: Final = Path("data") / "sample-data" / DATASET_NAME
DEFAULT_READS_PER_FILE: Final = 50_000
DEFAULT_TIMEOUT_SECONDS: Final = 1800
CHUNK_SIZE_BYTES: Final = 1024 * 1024

# PRJNA805123 — default tumor/normal pair for DLBCL1 (sample SAMN08874634).
DEFAULT_TUMOR_RUN: Final = "SRR15540953"
DEFAULT_NORMAL_RUN: Final = "SRR15540951"
DEFAULT_TUMOR_LABEL: Final = "cf_DLBCL1"
DEFAULT_NORMAL_LABEL: Final = "cf_punch1"


def ena_fastq_urls(run: str) -> tuple[str, str]:
    """Build the canonical ENA FTP URLs for a paired run.

    ENA mirrors SRA accessions under
    ``ftp.sra.ebi.ac.uk/vol1/fastq/{prefix}/{subdir}/{run}/{run}_{1,2}.fastq.gz``
    where ``prefix`` is the first 6 characters of the accession and ``subdir``
    is a zero-padded last-digit bucket (``001`` .. ``009``, ``010`` for a
    trailing zero, etc.).
    """
    run = run.strip().upper()
    if len(run) < 9:
        raise ValueError(f"Unexpected run accession: {run!r}")
    prefix = run[:6]
    last_digits = run[9:] if len(run) > 9 else run[-1]
    subdir = f"{int(last_digits):03d}"
    base = f"https://ftp.sra.ebi.ac.uk/vol1/fastq/{prefix}/{subdir}/{run}"
    return f"{base}/{run}_1.fastq.gz", f"{base}/{run}_2.fastq.gz"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Download a canine DLBCL tumor/normal WGS pair (PRJNA805123) "
            "renamed for mutavax."
        )
    )
    parser.add_argument(
        "--mode",
        choices=("smoke", "full"),
        default="smoke",
        help="smoke streams a subset per FASTQ; full downloads the complete files.",
    )
    parser.add_argument(
        "--tumor-run",
        default=DEFAULT_TUMOR_RUN,
        help=f"ENA/SRA run accession for the tumor sample (default {DEFAULT_TUMOR_RUN}).",
    )
    parser.add_argument(
        "--normal-run",
        default=DEFAULT_NORMAL_RUN,
        help=f"ENA/SRA run accession for the matched normal (default {DEFAULT_NORMAL_RUN}).",
    )
    parser.add_argument(
        "--tumor-label",
        default=DEFAULT_TUMOR_LABEL,
        help="Short label for the tumor run, recorded in dataset metadata.",
    )
    parser.add_argument(
        "--normal-label",
        default=DEFAULT_NORMAL_LABEL,
        help="Short label for the normal run, recorded in dataset metadata.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory for the resulting FASTQ files.",
    )
    parser.add_argument(
        "--reads",
        type=int,
        default=DEFAULT_READS_PER_FILE,
        help=f"Reads per FASTQ in smoke mode (default {DEFAULT_READS_PER_FILE}).",
    )
    parser.add_argument(
        "--lines-per-file",
        type=int,
        help="Override the smoke subset size directly. Must be a positive multiple of 4.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Per-file download timeout in seconds (default {DEFAULT_TIMEOUT_SECONDS}).",
    )
    parser.add_argument(
        "--force", action="store_true", help="Overwrite existing files."
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the plan without downloading."
    )
    return parser.parse_args()


def resolve_output_dir(args: argparse.Namespace) -> Path:
    if args.output_dir is not None:
        return args.output_dir
    return DEFAULT_OUTPUT_ROOT / args.mode


def resolve_line_limit(args: argparse.Namespace) -> int:
    limit = args.lines_per_file if args.lines_per_file is not None else args.reads * 4
    if limit <= 0 or limit % 4 != 0:
        raise ValueError("Smoke subset size must be a positive multiple of 4 lines.")
    return limit


def plan_files(args: argparse.Namespace) -> list[dict[str, str]]:
    tumor_r1, tumor_r2 = ena_fastq_urls(args.tumor_run)
    normal_r1, normal_r2 = ena_fastq_urls(args.normal_run)
    return [
        {
            "name": "tumor_R1.fastq.gz",
            "source_run": args.tumor_run,
            "library_name": args.tumor_label,
            "sample_type": "tumor",
            "url": tumor_r1,
        },
        {
            "name": "tumor_R2.fastq.gz",
            "source_run": args.tumor_run,
            "library_name": args.tumor_label,
            "sample_type": "tumor",
            "url": tumor_r2,
        },
        {
            "name": "normal_R1.fastq.gz",
            "source_run": args.normal_run,
            "library_name": args.normal_label,
            "sample_type": "normal",
            "url": normal_r1,
        },
        {
            "name": "normal_R2.fastq.gz",
            "source_run": args.normal_run,
            "library_name": args.normal_label,
            "sample_type": "normal",
            "url": normal_r2,
        },
    ]


def metadata_text(args: argparse.Namespace, line_limit: int | None) -> str:
    lines = [
        "Dataset: Canine DLBCL tumor / matched skin-punch normal WGS pair",
        "Study: PRJNA805123 (Canine diffuse large B-cell lymphoma, Illumina WGS)",
        "Species: Canis lupus familiaris (NCBI taxid 9615)",
        (
            "Default reference: UU_Cfam_GSD_1.0 (German Shepherd assembly) — "
            "mutavax's canine preset."
        ),
        (
            "Sample pairing: tumor DLBCL biopsy and matched skin-punch normal "
            "share the same BioSample accession for each dog."
        ),
        f"Tumor run: {args.tumor_run} ({args.tumor_label})",
        f"Normal run: {args.normal_run} ({args.normal_label})",
        (
            "Full-mode footprint for DLBCL1: ~45 GB compressed "
            "(tumor ~22 GB + ~23 GB; normal ~11 GB + ~12 GB)."
        ),
        (
            "Relevance: canine B-cell lymphomas frequently hit TP53, TRAF3, "
            "POT1, SETD2, FBXW7 — all in mutavax's bundled cancer gene "
            "list, so stage 4 should light up on a full-coverage run."
        ),
        "Naming note: the ENA _1/_2 files are renamed to R1/R2 for mutavax.",
        f"Mode: {args.mode}",
    ]
    if line_limit is not None:
        lines.append(f"Reads per FASTQ: {line_limit // 4}")
        lines.append(f"Lines per FASTQ: {line_limit}")
    lines.append("")
    lines.append("Files:")
    for entry in plan_files(args):
        lines.append(
            f"- {entry['name']} <- {entry['source_run']} / {entry['library_name']} / {entry['url']}"
        )
    return "\n".join(lines) + "\n"


def open_remote(url: str, timeout: int):
    request = Request(url, headers={"User-Agent": "mutavax-sample-data/1.0"})
    return urlopen(request, timeout=timeout)


def download_full_file(url: str, destination: Path, timeout: int) -> None:
    with open_remote(url, timeout) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle, length=CHUNK_SIZE_BYTES)


def download_smoke_file(url: str, destination: Path, line_limit: int, timeout: int) -> None:
    written = 0
    with open_remote(url, timeout) as response:
        with gzip.GzipFile(fileobj=response) as source, gzip.open(
            destination, "wb"
        ) as dest:
            for line in source:
                dest.write(line)
                written += 1
                if written >= line_limit:
                    break
    if written < line_limit:
        raise RuntimeError(
            f"{url} ended after {written} lines; expected at least {line_limit}."
        )


def download_file(
    *,
    mode: str,
    url: str,
    destination: Path,
    line_limit: int | None,
    timeout: int,
) -> None:
    tmp = destination.with_suffix(destination.suffix + ".part")
    if tmp.exists():
        tmp.unlink()
    try:
        if mode == "full":
            download_full_file(url, tmp, timeout)
        else:
            if line_limit is None:
                raise RuntimeError("Smoke mode requires a line limit.")
            download_smoke_file(url, tmp, line_limit, timeout)
        tmp.replace(destination)
    except Exception:
        if tmp.exists():
            tmp.unlink()
        raise


def main() -> int:
    args = parse_args()
    line_limit = None if args.mode == "full" else resolve_line_limit(args)
    output_dir = resolve_output_dir(args)

    print(f"Preparing {args.mode} dataset in {output_dir}")
    print(f"Tumor run:  {args.tumor_run} ({args.tumor_label})")
    print(f"Normal run: {args.normal_run} ({args.normal_label})")
    if line_limit is not None:
        print(f"Subset size: {line_limit // 4} reads per FASTQ ({line_limit} lines)")

    files = plan_files(args)

    if args.dry_run:
        for entry in files:
            print(f"[dry-run] {entry['name']} <= {entry['url']}")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "dataset-metadata.txt").write_text(
        metadata_text(args, line_limit), encoding="utf-8"
    )

    for entry in files:
        destination = output_dir / entry["name"]
        if destination.exists() and not args.force:
            print(f"Skipping existing file: {destination}")
            continue
        print(f"Fetching {entry['name']} from {entry['source_run']}")
        download_file(
            mode=args.mode,
            url=entry["url"],
            destination=destination,
            line_limit=line_limit,
            timeout=args.timeout,
        )
        print(f"Wrote {destination}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
