"""Stage 5 validation — MHCflurry as a license-free alternative to
NetMHCpan.

NetMHCpan requires a DTU academic/commercial license; MHCflurry 2.0
(openvax, Apache-2) is the leading free-software alternative for
class-I binding prediction. This test replays the canonical-TAA
benchmark (see ``test_canonical_tumor_antigens.py``) against MHCflurry
to verify it produces equivalent binder-vs-non-binder separation and
is therefore a viable swap-in when NetMHCpan is unavailable.

Observed on 2026-04-22:

* NetMHCpan: AUC = 1.000, binder median 36 nM, 10/12 under 500 nM
* MHCflurry: AUC = 1.000, binder median 33 nM, 11/12 under 500 nM

MHCflurry 2.0.6 is pinned by pvactools. Because it was built against
Keras 2 while our image ships Keras 3, we set
``TF_USE_LEGACY_KERAS=1`` and install ``tf-keras`` so the 2.x
compatibility shims resolve. See the Dockerfile.

Skipped on host (MHCflurry models and Keras stack live in the
container). Requires ~0.5 GB of pre-fetched model weights.
"""
from __future__ import annotations

import math
import os
import statistics
from dataclasses import dataclass
from pathlib import Path

import pytest


FIXTURE = Path(__file__).parent / "fixtures" / "canonical_tumor_antigens.tsv"


@dataclass(frozen=True)
class _Row:
    peptide: str
    allele: str
    source: str
    source_type: str


def _load_fixture() -> list[_Row]:
    """Duplicated loader (vs. the sibling test_canonical_tumor_antigens.py)
    so this module has no import dependency on a peer test file — pytest's
    collection paths differ between the host venv and the container image
    and a shared helper module would be the cleaner fix, but for a single
    duplicate parser the cost is lower than the conftest plumbing."""
    rows: list[_Row] = []
    with FIXTURE.open("r", encoding="utf-8") as handle:
        for raw in handle:
            if raw.startswith("#") or not raw.strip():
                continue
            parts = raw.rstrip("\n").split("\t")
            if len(parts) < 5 or parts[0] == "peptide":
                continue
            rows.append(
                _Row(
                    peptide=parts[0],
                    allele=parts[1],
                    source=parts[3],
                    source_type=parts[4],
                )
            )
    return rows


def _auc(scores: list[float], labels: list[int]) -> float:
    """Mann-Whitney U AUC with tie-averaged ranks."""
    n = len(scores)
    if n == 0 or sum(labels) == 0 or sum(labels) == n:
        return float("nan")
    ranked = sorted(range(n), key=lambda i: scores[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and scores[ranked[j + 1]] == scores[ranked[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[ranked[k]] = avg
        i = j + 1
    pos = sum(labels)
    neg = n - pos
    rank_sum_pos = sum(r for r, y in zip(ranks, labels) if y == 1)
    return (rank_sum_pos - pos * (pos + 1) / 2) / (pos * neg)


def _mhcflurry_available() -> bool:
    if os.environ.get("TF_USE_LEGACY_KERAS") != "1":
        # Default-off the test unless the Keras-2 compat shim is
        # enabled. On host venvs without tf-keras the import itself
        # fails; in the container the Dockerfile sets the env var.
        return False
    try:
        from mhcflurry import Class1AffinityPredictor  # noqa: F401
    except Exception:  # pragma: no cover — import-time errors
        return False
    return True


@pytest.mark.skipif(
    not _mhcflurry_available(),
    reason="MHCflurry unavailable (set TF_USE_LEGACY_KERAS=1 + install tf-keras + fetch models_class1_pan)",
)
def test_mhcflurry_matches_netmhcpan_on_canonical_taa_benchmark() -> None:
    """MHCflurry must clear the same AUC floor as NetMHCpan on the
    canonical TAA benchmark (AUC ≥ 0.85) and must call ≥80% of
    published binders as binders (IC50 < 5000 nM)."""
    from mhcflurry import Class1AffinityPredictor

    predictor = Class1AffinityPredictor.load(optimization_level=0)
    rows = _load_fixture()

    by_allele: dict[str, list] = {}
    for row in rows:
        by_allele.setdefault(row.allele, []).append(row)

    all_scores: list[float] = []
    all_labels: list[int] = []
    binder_ic: list[float] = []
    broken_ic: list[float] = []

    for allele, items in by_allele.items():
        peptides = [r.peptide for r in items]
        predictions = predictor.predict(
            peptides=peptides, alleles=[allele] * len(peptides)
        )
        for row, ic50 in zip(items, predictions):
            all_scores.append(-math.log10(max(float(ic50), 0.1)))
            label = 1 if row.source_type == "binder" else 0
            all_labels.append(label)
            (binder_ic if label else broken_ic).append(float(ic50))

    auc = _auc(all_scores, all_labels)
    binder_median = statistics.median(binder_ic) if binder_ic else float("nan")
    broken_median = statistics.median(broken_ic) if broken_ic else float("nan")
    binder_under_500 = sum(1 for x in binder_ic if x < 500)

    report = (
        f"MHCflurry canonical-TAA benchmark:\n"
        f"  AUC = {auc:.3f}\n"
        f"  binder median IC50 = {binder_median:.0f} nM "
        f"({binder_under_500}/{len(binder_ic)} under 500 nM)\n"
        f"  anchor-broken median IC50 = {broken_median:.0f} nM"
    )

    assert auc >= 0.85, f"MHCflurry AUC below 0.85:\n{report}"
    assert binder_under_500 / max(len(binder_ic), 1) >= 0.80, (
        f"MHCflurry flagged <80% of canonical binders as IC50<500 nM:\n{report}"
    )
    assert binder_median < broken_median, (
        f"Binder median should be lower than broken-anchor median:\n{report}"
    )
