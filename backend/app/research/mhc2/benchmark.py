"""Benchmark report builder for MHC-II predictor outputs.

The SOTA-style report computes ROC-AUC, PR-AUC, and threshold metrics with
bootstrap CIs, per-locus / per-length / per-allele slices, and (when
length-matched proteome decoys are available per ligand) the FRANK metric
that the published baselines compare on.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

from app.research.mhc2.metrics import (
    average_precision,
    bootstrap_ci,
    f1_at_threshold,
    frank,
    length_bucket,
    locus_for_allele,
    metrics_by_group,
    roc_auc,
    spearmanr,
    topk_recall_by_group,
)


@dataclass
class SotaReport:
    """Aggregated comparison-grade metrics for one (model, test set) pair."""

    rows: int
    n_pos: int
    n_neg: int
    roc_auc: dict
    pr_auc: dict
    f1_at_threshold: dict
    frank: dict | None
    by_locus: dict
    by_length: dict
    by_allele_rare: dict  # alleles with <500 records — the long tail
    metadata: dict

    def to_json(self) -> dict:
        return {
            "rows": self.rows,
            "n_pos": self.n_pos,
            "n_neg": self.n_neg,
            "roc_auc": self.roc_auc,
            "pr_auc": self.pr_auc,
            "f1_at_threshold": self.f1_at_threshold,
            "frank": self.frank,
            "by_locus": self.by_locus,
            "by_length": self.by_length,
            "by_allele_rare": self.by_allele_rare,
            "metadata": self.metadata,
        }


def evaluate_prediction_file(path: Path, threshold: float = 0.5) -> dict:
    """Legacy entry point — kept so existing callers don't break."""
    rows = _read_rows(path)
    labels = [float(row.get("label") or row.get("target") or row.get("presented")) for row in rows]
    scores = [float(row.get("score") or row.get("prediction")) for row in rows]
    result = {
        "rows": len(rows),
        "roc_auc": roc_auc(labels, scores),
        "pr_auc": average_precision(labels, scores),
        "threshold": f1_at_threshold(labels, scores, threshold=threshold),
    }
    if all(row.get("group") for row in rows):
        result["top10_recall_by_group"] = topk_recall_by_group(
            labels, scores, [row["group"] for row in rows], k=10
        )
    if all(row.get("rank_target") for row in rows):
        result["spearman"] = spearmanr([float(row["rank_target"]) for row in rows], scores)
    return result


def compute_sota_report(
    labels: Sequence[float],
    scores: Sequence[float],
    peptides: Sequence[str],
    alleles: Sequence[str],
    *,
    n_bootstrap: int = 1000,
    threshold: float = 0.5,
    rare_allele_max: int = 500,
    metadata: dict | None = None,
    frank_inputs: list[tuple[float, list[float]]] | None = None,
) -> SotaReport:
    """Build a full report comparable across baselines.

    Args:
        labels:    1.0 for ligand, 0.0 for decoy.
        scores:    model output (raw or sigmoid).
        peptides:  per-record peptide string.
        alleles:   per-record primary allele string (HLA-DRB1*01:01 form).
        frank_inputs: optional ``[(epitope_score, [decoy_scores])]`` per
                      true ligand — required if FRANK is wanted.
    """
    if not (len(labels) == len(scores) == len(peptides) == len(alleles)):
        raise ValueError("labels/scores/peptides/alleles must have same length")

    n_pos = sum(1 for y in labels if y > 0.5)
    n_neg = len(labels) - n_pos

    auc_ci = bootstrap_ci(roc_auc, labels, scores, n_iter=n_bootstrap)
    pr_ci = bootstrap_ci(average_precision, labels, scores, n_iter=n_bootstrap)
    thresh_metrics = f1_at_threshold(labels, scores, threshold=threshold)

    locus_keys = [locus_for_allele(a) for a in alleles]
    length_keys = [length_bucket(p) for p in peptides]

    by_locus_raw = metrics_by_group(roc_auc, labels, scores, locus_keys)
    by_length_raw = metrics_by_group(roc_auc, labels, scores, length_keys)

    # Per-allele AUC for the long tail (rare alleles).
    allele_counts: dict[str, int] = defaultdict(int)
    for a in alleles:
        allele_counts[a] += 1
    rare_alleles = {a for a, n in allele_counts.items() if 30 <= n <= rare_allele_max}
    rare_pairs: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for label, score, allele in zip(labels, scores, alleles):
        if allele in rare_alleles:
            rare_pairs[allele].append((label, score))
    by_allele_rare: dict = {}
    for allele, pairs in rare_pairs.items():
        ys = [p[0] for p in pairs]
        ss = [p[1] for p in pairs]
        if len(set(y > 0.5 for y in ys)) < 2:
            continue
        by_allele_rare[allele] = {
            "count": len(pairs),
            "n_pos": sum(1 for y in ys if y > 0.5),
            "value": roc_auc(ys, ss),
        }

    frank_summary: dict | None = None
    if frank_inputs:
        franks = [
            frank(epitope_score, candidates) for epitope_score, candidates in frank_inputs
            if candidates
        ]
        if franks:
            import numpy as np
            arr = np.asarray(franks)
            frank_summary = {
                "n": len(franks),
                "median": float(np.median(arr)),
                "mean": float(arr.mean()),
                "p95": float(np.quantile(arr, 0.95)),
            }

    return SotaReport(
        rows=len(labels),
        n_pos=n_pos,
        n_neg=n_neg,
        roc_auc=auc_ci,
        pr_auc=pr_ci,
        f1_at_threshold=thresh_metrics,
        frank=frank_summary,
        by_locus=by_locus_raw,
        by_length=by_length_raw,
        by_allele_rare=by_allele_rare,
        metadata=metadata or {},
    )


def report_to_markdown(report: SotaReport) -> str:
    """One-tool comparison-grade Markdown summary."""
    lines: list[str] = []
    md = report.metadata or {}
    title = md.get("title", "MHC-II benchmark report")
    lines.append(f"# {title}")
    lines.append("")
    if "model" in md:
        lines.append(f"**Model:** {md['model']}")
    if "checkpoint" in md:
        lines.append(f"**Checkpoint:** {md['checkpoint']}")
    if "test_set" in md:
        lines.append(f"**Test set:** {md['test_set']}")
    lines.append("")
    lines.append(f"- {report.rows:,} rows ({report.n_pos:,} pos / {report.n_neg:,} neg)")
    lines.append("")
    lines.append("## Aggregate metrics")
    lines.append("")
    lines.append("| Metric | Point | 95% CI |")
    lines.append("|---|---:|---:|")
    lines.append(
        f"| ROC-AUC | {report.roc_auc['point']:.4f} | "
        f"[{report.roc_auc['low']:.4f}, {report.roc_auc['high']:.4f}] |"
    )
    lines.append(
        f"| PR-AUC | {report.pr_auc['point']:.4f} | "
        f"[{report.pr_auc['low']:.4f}, {report.pr_auc['high']:.4f}] |"
    )
    f1 = report.f1_at_threshold
    lines.append(
        f"| F1 @ {f1['threshold']:.2f} | {f1['f1']:.4f} | — |"
    )
    if report.frank:
        lines.append(
            f"| FRANK (median) | {report.frank['median']:.4f} | "
            f"(p95 {report.frank['p95']:.4f}, n={report.frank['n']}) |"
        )
    lines.append("")
    lines.append("## Per-locus AUC")
    lines.append("")
    lines.append("| Locus | n | n_pos | AUC |")
    lines.append("|---|---:|---:|---:|")
    for k in sorted(report.by_locus):
        v = report.by_locus[k]
        lines.append(f"| {k} | {v['count']:,} | {v['n_pos']:,} | {v['value']:.4f} |")
    lines.append("")
    lines.append("## Per-length AUC")
    lines.append("")
    lines.append("| Length | n | n_pos | AUC |")
    lines.append("|---|---:|---:|---:|")
    for k in sorted(report.by_length):
        v = report.by_length[k]
        lines.append(f"| {k} | {v['count']:,} | {v['n_pos']:,} | {v['value']:.4f} |")
    if report.by_allele_rare:
        lines.append("")
        lines.append(f"## Rare-allele AUC (≤500 records)")
        lines.append("")
        lines.append("| Allele | n | n_pos | AUC |")
        lines.append("|---|---:|---:|---:|")
        for allele in sorted(report.by_allele_rare):
            v = report.by_allele_rare[allele]
            lines.append(f"| `{allele}` | {v['count']:,} | {v['n_pos']:,} | {v['value']:.4f} |")
    return "\n".join(lines) + "\n"


def write_metrics_json(metrics: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _read_rows(path: Path) -> list[dict[str, str]]:
    delimiter = "\t" if path.suffix.lower() in {".tsv", ".txt"} else ","
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(
            (line for line in handle if not line.startswith("#")),
            delimiter=delimiter,
        )
        return list(reader)
