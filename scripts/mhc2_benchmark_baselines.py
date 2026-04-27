#!/usr/bin/env python3
"""Score every available MHC-II baseline + our model on the locked test set.

Reads a labeled JSONL (positive ligands plus length-matched proteome
decoys), runs each baseline that is installed on the host, and writes a
side-by-side comparison report (Markdown + JSON).

Usage:
    python3 scripts/mhc2_benchmark_baselines.py \\
        --test-jsonl     data/mhc2/curated/cluster/cluster_test.jsonl \\
        --proteome-fasta data/mhc2/proteome/human_uniprot_sprot.fasta \\
        --decoys-per-positive 10 \\
        --pseudosequences data/mhc2/netmhciipan_43/extracted/pseudosequence.2023.dat \\
        --our-checkpoint data/mhc2/checkpoints/phaseB_v3/phaseB_v3.best.pt \\
        --out            data/mhc2/benchmarks/cluster_test/

Each baseline auto-skips with a printed reason if its binary is not on
the host. The harness still produces a partial report so we can iterate
on whichever subset is currently installed.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.research.mhc2.baselines.base import BaselineModel
from app.research.mhc2.baselines.mixmhc2pred import MixMHC2predAdapter
from app.research.mhc2.baselines.netmhciipan import NetMHCIIpanAdapter
from app.research.mhc2.baselines.our_model import OurModelAdapter
from app.research.mhc2.benchmark import compute_sota_report, report_to_markdown
from app.research.mhc2.data import read_jsonl
from app.research.mhc2.decoys import (
    positive_9mer_index,
    read_fasta_sequences,
    sample_length_matched_decoys,
)


def _build_test_pairs(
    test_jsonl: Path,
    proteome_fasta: Path | None,
    decoys_per_positive: int,
    seed: int,
) -> tuple[list[tuple[str, str]], list[float]]:
    """Returns (pairs, labels) for the locked test set: positives + decoys."""
    positives = list(read_jsonl(test_jsonl))
    pairs: list[tuple[str, str]] = []
    labels: list[float] = []
    for record in positives:
        primary = record.alleles[0] if record.alleles else None
        if primary:
            pairs.append((record.peptide, primary))
            labels.append(1.0)
    if proteome_fasta is not None and decoys_per_positive > 0:
        proteome = read_fasta_sequences(proteome_fasta)
        decoys, _ = sample_length_matched_decoys(
            positives,
            proteome,
            positive_9mers=positive_9mer_index(positives),
            per_positive=decoys_per_positive,
            seed=seed,
        )
        for record in decoys:
            primary = record.alleles[0] if record.alleles else None
            if primary:
                pairs.append((record.peptide, primary))
                labels.append(0.0)
    return pairs, labels


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-jsonl", type=Path, required=True)
    parser.add_argument("--proteome-fasta", type=Path)
    parser.add_argument("--decoys-per-positive", type=int, default=10)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--pseudosequences", type=Path,
                        help="Required when --our-checkpoint is set.")
    parser.add_argument("--our-checkpoint", type=Path)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--n-bootstrap", type=int, default=1000)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    print(f"[bench] building test set from {args.test_jsonl}", flush=True)
    pairs, labels = _build_test_pairs(
        args.test_jsonl,
        args.proteome_fasta,
        args.decoys_per_positive,
        args.seed,
    )
    print(f"[bench] {len(pairs):,} pairs ({sum(int(y) for y in labels):,} pos)", flush=True)

    adapters: list[BaselineModel] = [
        NetMHCIIpanAdapter(),
        MixMHC2predAdapter(),
    ]
    if args.our_checkpoint is not None:
        if args.pseudosequences is None:
            raise SystemExit("--pseudosequences is required with --our-checkpoint")
        adapters.append(OurModelAdapter(
            args.our_checkpoint,
            args.pseudosequences,
            device=args.device,
        ))

    summary: dict = {"missing_tools": {}, "models": {}}
    for adapter in adapters:
        ok, msg = adapter.is_available()
        if not ok:
            print(f"[bench] {adapter.name}: SKIP ({msg})", flush=True)
            summary["missing_tools"][adapter.name] = msg
            continue
        print(f"[bench] {adapter.name}: scoring {len(pairs):,} pairs ({msg})", flush=True)
        predictions = adapter.predict(pairs)
        if len(predictions) != len(pairs):
            raise RuntimeError(f"{adapter.name} returned {len(predictions)} of {len(pairs)} predictions")
        scores = [p.score for p in predictions]
        # Score direction is "higher = bind" for every adapter. NaN scores
        # get treated as worst-bind so they don't swap ROC; flag them.
        n_nan = sum(1 for s in scores if s != s)
        peptides = [pair[0] for pair in pairs]
        alleles = [pair[1] for pair in pairs]
        if n_nan:
            scores = [s if s == s else -1e9 for s in scores]
        report = compute_sota_report(
            labels, scores, peptides, alleles,
            n_bootstrap=args.n_bootstrap,
            metadata={
                "title": f"{adapter.name} on {args.test_jsonl.name}",
                "model": adapter.name,
                "test_set": str(args.test_jsonl),
                "n_nan_scores": n_nan,
            },
        )
        # Write per-tool artifacts.
        slug = adapter.name.replace(" ", "_").replace("/", "-")
        (args.out / f"{slug}.json").write_text(
            json.dumps(report.to_json(), indent=2) + "\n", encoding="utf-8",
        )
        (args.out / f"{slug}.md").write_text(
            report_to_markdown(report), encoding="utf-8",
        )
        summary["models"][adapter.name] = {
            "rows": report.rows,
            "n_pos": report.n_pos,
            "n_neg": report.n_neg,
            "roc_auc": report.roc_auc,
            "pr_auc": report.pr_auc,
        }
        print(
            f"[bench] {adapter.name}: AUC={report.roc_auc['point']:.4f} "
            f"[{report.roc_auc['low']:.4f}, {report.roc_auc['high']:.4f}]",
            flush=True,
        )

    summary_path = args.out / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    # Compact comparison table.
    comparison_md = ["# Cross-tool MHC-II benchmark", ""]
    if summary["missing_tools"]:
        comparison_md.append("## Tools skipped")
        comparison_md.append("")
        for name, msg in summary["missing_tools"].items():
            comparison_md.append(f"- **{name}**: {msg}")
        comparison_md.append("")
    if summary["models"]:
        comparison_md.append("## Comparison")
        comparison_md.append("")
        comparison_md.append("| Model | rows | pos | neg | ROC-AUC | 95% CI | PR-AUC | 95% CI |")
        comparison_md.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        for name, m in summary["models"].items():
            comparison_md.append(
                f"| {name} | {m['rows']:,} | {m['n_pos']:,} | {m['n_neg']:,} | "
                f"{m['roc_auc']['point']:.4f} | "
                f"[{m['roc_auc']['low']:.4f}, {m['roc_auc']['high']:.4f}] | "
                f"{m['pr_auc']['point']:.4f} | "
                f"[{m['pr_auc']['low']:.4f}, {m['pr_auc']['high']:.4f}] |"
            )
    (args.out / "comparison.md").write_text("\n".join(comparison_md) + "\n", encoding="utf-8")
    print(f"[bench] wrote summary to {summary_path}", flush=True)


if __name__ == "__main__":
    main()
