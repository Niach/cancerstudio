#!/usr/bin/env python3
"""Score every available MHC-II baseline + our model on the locked test set.

For each labeled record (peptide + allele set + label), score the peptide
against EVERY allele in the sample and take the max as the sample-level
prediction. This matches HLAIIPred / NetMHCIIpan_MA / MixMHC2pred protocols
for polyallelic data and prevents the "first allele" shortcut that earlier
runs of this script used.

Usage:
    python3 scripts/mhc2_benchmark_baselines.py \\
        --test-jsonl     data/mhc2/curated/cluster/cluster_test.jsonl \\
        --proteome-fasta data/mhc2/proteome/human_uniprot_sprot.fasta \\
        --decoys-per-positive 10 \\
        --pseudosequences data/mhc2/netmhciipan_43/extracted/pseudosequence.2023.dat \\
        --our-checkpoint data/mhc2/checkpoints/phaseB_v3/phaseB_v3.best.pt \\
        --our-esm-cache-dir data/mhc2/esm_cache \\
        --out            data/mhc2/benchmarks/cluster_test/
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
from app.research.mhc2.baselines.hlaiipred import HLAIIPredAdapter
from app.research.mhc2.baselines.mixmhc2pred import MixMHC2predAdapter
from app.research.mhc2.baselines.netmhciipan import NetMHCIIpanAdapter
from app.research.mhc2.baselines.our_model import OurModelAdapter
from app.research.mhc2.benchmark import compute_sota_report, report_to_markdown
from app.research.mhc2.data import read_jsonl
from app.research.mhc2.decoys import (
    positive_9mer_index,
    read_fasta_sequences,
    sample_frank_candidates,
    sample_length_matched_decoys,
)
from app.research.mhc2.data import peptide_9mers


def _build_test_records(
    test_jsonl: Path,
    proteome_fasta: Path | None,
    decoys_per_positive: int,
    seed: int,
    label_type_filter: str | None = "presentation",
) -> tuple[list, list[float]]:
    """Returns (records_with_full_allele_sets, labels). Each record keeps
    its complete ``alleles`` tuple so the scoring driver can fan-out."""
    positives = [
        r for r in read_jsonl(test_jsonl)
        if 9 <= len(r.peptide) <= 25
        and (label_type_filter is None or r.label_type == label_type_filter)
    ]
    records: list = []
    labels: list[float] = []
    for record in positives:
        if not record.alleles:
            continue
        records.append(record)
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
            if not record.alleles:
                continue
            records.append(record)
            labels.append(0.0)
    return records, labels


def _score_polyallelic(
    adapter: BaselineModel,
    records: list,
    extra_pairs: list[tuple[str, str, int]] | None = None,
) -> tuple[list[float], int, list[float]]:
    """Score each record against all alleles in its sample, return per-record
    max-score. ``extra_pairs`` is an optional list of additional
    ``(peptide, allele, group_idx)`` tuples (used for FRANK candidates) that
    are scored in the same call; their max-over-group is returned as a
    parallel list aligned to the *unique group_idx values* as ``extra_max``.
    """
    pairs: list[tuple[str, str]] = []
    record_idx_for_pair: list[int] = []
    extra_group_for_pair: list[int] = []  # 1-aligned to pairs; -1 for record pairs
    for i, record in enumerate(records):
        for allele in record.alleles:
            pairs.append((record.peptide, allele))
            record_idx_for_pair.append(i)
            extra_group_for_pair.append(-1)
    if extra_pairs:
        for peptide, allele, group_idx in extra_pairs:
            pairs.append((peptide, allele))
            record_idx_for_pair.append(-1)
            extra_group_for_pair.append(group_idx)

    predictions = adapter.predict(pairs)
    if len(predictions) != len(pairs):
        raise RuntimeError(f"{adapter.name} returned {len(predictions)} of {len(pairs)} predictions")

    record_max: list[float] = [float("-inf")] * len(records)
    extra_max: dict[int, float] = {}
    n_nan = 0
    for ridx, gidx, prediction in zip(record_idx_for_pair, extra_group_for_pair, predictions):
        score = prediction.score
        if score != score:
            n_nan += 1
            score = float("-inf")
        if ridx >= 0:
            if score > record_max[ridx]:
                record_max[ridx] = score
        else:
            cur = extra_max.get(gidx, float("-inf"))
            if score > cur:
                extra_max[gidx] = score
    record_max = [s if s > float("-inf") else -1e9 for s in record_max]
    extra_list = [extra_max.get(g, -1e9) for g in sorted(extra_max)]
    return record_max, n_nan, extra_list


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test-jsonl", type=Path, required=True)
    parser.add_argument("--proteome-fasta", type=Path)
    parser.add_argument("--decoys-per-positive", type=int, default=10)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--pseudosequences", type=Path,
                        help="Required when --our-checkpoint is set.")
    parser.add_argument("--our-checkpoint", type=Path)
    parser.add_argument("--our-esm-cache-dir", type=Path,
                        help="Required when --our-checkpoint is an ESM (Phase B) checkpoint.")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--n-bootstrap", type=int, default=1000)
    parser.add_argument("--frank-candidates-per-positive", type=int, default=0,
                        help="When >0, also score N length-matched proteome windows per "
                             "positive epitope (against the same sample alleles) and "
                             "report the FRANK metric (fraction of candidates >= epitope).")
    parser.add_argument("--label-type", default="presentation",
                        choices=["presentation", "affinity", "any"],
                        help="Filter test records by label_type. 'any' keeps all.")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    label_filter = None if args.label_type == "any" else args.label_type
    print(f"[bench] building test set from {args.test_jsonl} (label_type={args.label_type})", flush=True)
    records, labels = _build_test_records(
        args.test_jsonl,
        args.proteome_fasta,
        args.decoys_per_positive,
        args.seed,
        label_type_filter=label_filter,
    )
    n_pairs = sum(len(r.alleles) for r in records)
    print(
        f"[bench] {len(records):,} records ({sum(int(y) for y in labels):,} pos), "
        f"{n_pairs:,} (peptide,allele) pairs to score per tool",
        flush=True,
    )

    adapters: list[BaselineModel] = [
        NetMHCIIpanAdapter(),
        MixMHC2predAdapter(),
        HLAIIPredAdapter(device=args.device),
    ]
    if args.our_checkpoint is not None:
        if args.pseudosequences is None:
            raise SystemExit("--pseudosequences is required with --our-checkpoint")
        adapters.append(OurModelAdapter(
            args.our_checkpoint,
            args.pseudosequences,
            device=args.device,
            esm_cache_dir=args.our_esm_cache_dir,
        ))

    summary: dict = {"missing_tools": {}, "models": {}}
    peptides = [r.peptide for r in records]
    primary_alleles = [r.alleles[0] for r in records]  # for per-locus slicing only

    # Pre-build FRANK candidate windows ONCE (deterministic given seed) so
    # every tool sees the same candidate set. Each candidate inherits the
    # positive's full sample-allele set so max-over-allele scoring is fair.
    extra_pairs: list[tuple[str, str, int]] = []
    frank_groups: list[tuple[int, int]] = []  # (record_idx, group_id)
    if args.frank_candidates_per_positive > 0:
        if args.proteome_fasta is None:
            raise SystemExit("--proteome-fasta required with --frank-candidates-per-positive")
        proteome = read_fasta_sequences(args.proteome_fasta)
        next_group = 0
        for ridx, record in enumerate(records):
            if labels[ridx] < 0.5:  # only build FRANK candidates per positive
                continue
            forbidden = set(peptide_9mers(record.peptide))
            candidates = sample_frank_candidates(
                len(record.peptide),
                proteome,
                n_candidates=args.frank_candidates_per_positive,
                seed=args.seed + ridx,
                forbidden_9mers=forbidden,
            )
            for cand in candidates:
                gid = next_group
                next_group += 1
                frank_groups.append((ridx, gid))
                for allele in record.alleles:
                    extra_pairs.append((cand, allele, gid))
        print(
            f"[bench] FRANK: {len(frank_groups):,} candidates ({len(extra_pairs):,} extra pairs)",
            flush=True,
        )

    for adapter in adapters:
        ok, msg = adapter.is_available()
        if not ok:
            print(f"[bench] {adapter.name}: SKIP ({msg})", flush=True)
            summary["missing_tools"][adapter.name] = msg
            continue
        total_pairs = n_pairs + len(extra_pairs)
        print(f"[bench] {adapter.name}: scoring {total_pairs:,} pairs ({msg})", flush=True)
        scores, n_nan, extra_max_list = _score_polyallelic(adapter, records, extra_pairs)
        if n_nan:
            print(f"[bench] {adapter.name}: {n_nan} NaN scores treated as worst-binder", flush=True)

        frank_inputs = None
        if args.frank_candidates_per_positive > 0 and frank_groups:
            # Group candidates back to their parent positive, build
            # (epitope_score, [candidate_scores]) per positive.
            by_positive: dict[int, list[float]] = defaultdict(list)
            for (ridx, gid), cand_score in zip(frank_groups, extra_max_list):
                by_positive[ridx].append(cand_score)
            frank_inputs = []
            for ridx, cand_scores in by_positive.items():
                frank_inputs.append((scores[ridx], cand_scores))

        report = compute_sota_report(
            labels, scores, peptides, primary_alleles,
            n_bootstrap=args.n_bootstrap,
            frank_inputs=frank_inputs,
            metadata={
                "title": f"{adapter.name} on {args.test_jsonl.name}",
                "model": adapter.name,
                "test_set": str(args.test_jsonl),
                "n_nan_pair_scores": n_nan,
                "scoring": "max-over-sample-alleles",
                "frank_candidates_per_positive": args.frank_candidates_per_positive,
            },
        )
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
    comparison_md = ["# Cross-tool MHC-II benchmark (max-over-sample-alleles)", ""]
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
