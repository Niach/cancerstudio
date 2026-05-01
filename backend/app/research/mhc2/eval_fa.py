"""Source-protein FRANK utilities shared by the offline benchmark harness
(``scripts/mhc2_benchmark_eval_fa.py``) and the per-epoch FRANK sentinel in
``train.py``.

Keep this module light — no torch, no model code, no I/O beyond reading the
FASTA. Callers supply a ``score_fn`` callable that maps a list of
``(peptide, allele)`` pairs to a ``{peptide: score}`` dict, so the same loop
runs against an MHC2Predictor, a baseline adapter, or any future scorer.
"""

from __future__ import annotations

import math
import random
import re
from collections import defaultdict
from pathlib import Path
from typing import Callable, Iterable

from app.research.mhc2.metrics import locus_for_allele


TIE_POLICIES = ("pessimistic", "random", "optimistic")
_NAN_FRANK: dict[str, float] = {p: float("nan") for p in TIE_POLICIES}

ScoreFn = Callable[[list[tuple[str, str]]], dict[str, float]]


def parse_eval_fa(path: Path) -> list[dict]:
    """Parse NetMHCIIpan_eval.fa.

    Each entry is two lines:
      >protein_id  epitope_peptide  allele_name
      <full source protein sequence>

    Returns a list of dicts {protein_id, epitope, allele_raw, protein}.
    """
    entries: list[dict] = []
    header: str | None = None
    seq: list[str] = []
    with Path(path).open("r") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                if header is not None and seq:
                    entries.append(_finalize(header, "".join(seq)))
                header = line[1:]
                seq = []
            else:
                seq.append(line)
        if header is not None and seq:
            entries.append(_finalize(header, "".join(seq)))
    return entries


def _finalize(header: str, sequence: str) -> dict:
    parts = header.split()
    if len(parts) < 3:
        raise ValueError(f"unexpected eval.fa header: {header!r}")
    return {
        "protein_id": parts[0],
        "epitope": parts[1].upper(),
        "allele_raw": parts[2],
        "protein": sequence.upper(),
    }


def normalize_eval_allele(raw: str) -> str | None:
    """Map NetMHCIIpan eval-style allele names to our HLA-DRB1*04:01 form."""
    s = raw.strip()
    if not s.startswith(("DR", "DP", "DQ", "HLA-")):
        return s  # e.g. mouse H-2-IAb — let pseudoseq lookup fail naturally
    s_no_prefix = s.removeprefix("HLA-")
    if "-" in s_no_prefix:
        return "HLA-" + "-".join(_format_chain(p) for p in s_no_prefix.split("-"))
    return "HLA-" + _format_chain(s_no_prefix)


def _format_chain(chain: str) -> str:
    """e.g. DRB1_0401 -> DRB1*04:01; DPB10401 -> DPB1*04:01."""
    chain = chain.replace("_", "")
    m = re.match(r"^([A-Z]+\d?)(\d{2})(\d{2,3})$", chain)
    if not m:
        return chain
    locus, field1, field2 = m.groups()
    return f"{locus}*{field1}:{field2}"


def make_pairs_for_entry(entry: dict) -> list[tuple[str, str, bool]]:
    """For one (epitope, protein, allele) entry, return ``(peptide, allele_norm,
    is_epitope)`` for each unique epitope-length window in the source protein
    plus the epitope itself."""
    peptide = entry["epitope"]
    protein = entry["protein"]
    allele_norm = normalize_eval_allele(entry["allele_raw"])
    if allele_norm is None:
        return []
    L = len(peptide)
    if L < 9 or len(protein) < L:
        return []
    candidates: dict[str, bool] = {}
    for i in range(len(protein) - L + 1):
        win = protein[i : i + L]
        if not all(c in "ACDEFGHIKLMNPQRSTVWY" for c in win):
            continue
        candidates[win] = candidates.get(win, False)
    candidates[peptide] = True
    return [(pep, allele_norm, is_ep) for pep, is_ep in candidates.items()]


def compute_frank(scores: dict[str, float], epitope: str) -> dict[str, float]:
    """All three tie policies in one pass.

    pessimistic — epitope ranks below every tied window (worst case).
    optimistic  — epitope ranks above every tied window (best case).
    random      — expected FRANK under uniform random tie-breaking
                  (deterministic closed form: midpoint of pess and opt).
    """
    if not scores or epitope not in scores:
        return dict(_NAN_FRANK)
    ep_score = scores[epitope]
    if math.isnan(ep_score):
        return dict(_NAN_FRANK)
    others = [s for p, s in scores.items() if p != epitope and not math.isnan(s)]
    if not others:
        return {p: 0.0 for p in TIE_POLICIES}
    better = sum(1 for s in others if s > ep_score)
    ties = sum(1 for s in others if s == ep_score)
    n = len(others)
    return {
        "pessimistic": (better + ties) / n,
        "random": (better + ties / 2) / n,
        "optimistic": better / n,
    }


def length_bucket(l: int) -> str:
    if l <= 11:
        return "<=11"
    if l <= 15:
        return "12-15"
    if l <= 19:
        return "16-19"
    return ">=20"


def stratified_subset(entries: list[dict], n: int, seed: int = 13) -> list[dict]:
    """Return a deterministic ``n``-entry subset stratified by (locus,
    length_bucket). Quotas are computed proportionally across non-empty cells
    with rounding distributed to the largest fractions, then each cell is
    sampled with a per-cell shuffle from a seeded RNG.

    DP/DQ are floor-1 protected so per-locus medians stay readable: any cell
    that would round to 0 keeps at least one entry as long as the cell is
    non-empty.
    """
    cells: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for e in entries:
        a = normalize_eval_allele(e["allele_raw"])
        loc = locus_for_allele(a) if a else "other"
        cells[(loc, length_bucket(len(e["epitope"])))].append(e)
    total = sum(len(v) for v in cells.values())
    if total == 0:
        return []
    n = min(n, total)
    raw = {k: len(v) * n / total for k, v in cells.items()}
    quotas = {k: max(1 if cells[k] else 0, int(raw[k])) for k in cells}
    used = sum(quotas.values())
    leftover = n - used
    fracs = sorted(((raw[k] - int(raw[k])), k) for k in cells)
    while leftover > 0 and fracs:
        _, k = fracs.pop()
        if quotas[k] < len(cells[k]):
            quotas[k] += 1
            leftover -= 1
    while leftover < 0:
        biggest = max(quotas, key=lambda k: (quotas[k], -len(cells[k])))
        if quotas[biggest] <= 1:
            break
        quotas[biggest] -= 1
        leftover += 1

    rng = random.Random(seed)
    out: list[dict] = []
    for k in sorted(cells):
        bucket = cells[k][:]
        rng.shuffle(bucket)
        out.extend(bucket[: quotas[k]])
    return out


def score_eval_fa(
    score_fn: ScoreFn,
    entries: list[dict],
    *,
    supported_alleles: set[str] | None = None,
    progress_every: int = 0,
) -> dict:
    """Run the per-entry FRANK loop. Returns a summary dict with per-policy
    median/mean/p95 + per-locus + per-length plus per-entry FRANK lists.

    ``supported_alleles`` (optional) lets the caller mark records whose allele
    isn't in their predictor's pseudosequence table as skipped (FRANK=NaN)
    instead of failing inside ``score_fn``.

    ``score_fn`` may raise ``KeyError`` or ``ValueError`` on an unsupported
    pair; we catch and skip.
    """
    franks_by_policy: dict[str, list[float]] = {p: [] for p in TIE_POLICIES}
    alleles: list[str] = []
    lengths: list[int] = []
    skipped_no_pseudoseq = 0
    skipped_too_short = 0

    def _record_skip(allele: str, length: int) -> None:
        for p in TIE_POLICIES:
            franks_by_policy[p].append(float("nan"))
        alleles.append(allele)
        lengths.append(length)

    for i, entry in enumerate(entries):
        pairs = make_pairs_for_entry(entry)
        if not pairs:
            skipped_too_short += 1
            _record_skip("?", len(entry["epitope"]))
            continue
        allele_norm = pairs[0][1]
        if supported_alleles is not None and allele_norm not in supported_alleles:
            skipped_no_pseudoseq += 1
            _record_skip(allele_norm, len(entry["epitope"]))
            continue
        score_pairs = [(pep, all_) for pep, all_, _ in pairs]
        try:
            scores = score_fn(score_pairs)
        except (KeyError, ValueError):
            _record_skip(allele_norm, len(entry["epitope"]))
            continue
        f = compute_frank(scores, entry["epitope"])
        for p in TIE_POLICIES:
            franks_by_policy[p].append(f[p])
        alleles.append(allele_norm)
        lengths.append(len(entry["epitope"]))
        if progress_every and ((i + 1) % progress_every == 0 or i < 5):
            running = {
                p: sorted(x for x in franks_by_policy[p] if not math.isnan(x))
                for p in TIE_POLICIES
            }
            def _med(xs: list[float]) -> float:
                return xs[len(xs) // 2] if xs else float("nan")
            print(
                f"[eval-fa] {i+1}/{len(entries)} entries, "
                f"len(score_pairs)={len(score_pairs)}, "
                f"med_frank pess={_med(running['pessimistic']):.4f} "
                f"rand={_med(running['random']):.4f} "
                f"opt={_med(running['optimistic']):.4f}",
                flush=True,
            )

    summary = aggregate(franks_by_policy, alleles, lengths)
    summary["skipped_no_pseudoseq"] = skipped_no_pseudoseq
    summary["skipped_too_short"] = skipped_too_short
    summary["per_entry_franks"] = franks_by_policy
    summary["per_entry_alleles"] = alleles
    summary["per_entry_lengths"] = lengths
    return summary


def _slice_summary(valid: list[float]) -> dict:
    n = len(valid)
    if n == 0:
        return {"n_evaluated": 0}
    sorted_franks = sorted(valid)
    return {
        "n_evaluated": n,
        "median_frank": sorted_franks[n // 2],
        "mean_frank": sum(valid) / n,
        "p95_frank": sorted_franks[min(int(0.95 * n), n - 1)],
        "frac_top1_pct": sum(1 for f in valid if f <= 0.01) / n,
        "frac_top5_pct": sum(1 for f in valid if f <= 0.05) / n,
        "frac_top10_pct": sum(1 for f in valid if f <= 0.10) / n,
    }


def aggregate(
    franks_by_policy: dict[str, list[float]],
    alleles: list[str],
    lengths: list[int],
) -> dict:
    """Per-policy median/mean/p95 + per-locus + per-length slices.

    Mirrors the legacy ``median_frank``/``frac_top1_pct``/etc. keys at the top
    level (filled from the pessimistic policy) so older readers keep working.
    """
    n_entries = len(next(iter(franks_by_policy.values())))
    out: dict = {"n_entries": n_entries}

    by_policy: dict[str, dict] = {}
    for policy, franks in franks_by_policy.items():
        valid = [f for f in franks if not math.isnan(f)]
        slice_out = _slice_summary(valid)
        slice_out["n_skipped"] = n_entries - slice_out["n_evaluated"]

        by_locus: dict[str, list[float]] = {"DR": [], "DP": [], "DQ": [], "other": []}
        for f, a in zip(franks, alleles):
            if math.isnan(f):
                continue
            by_locus[locus_for_allele(a)].append(f)
        slice_out["by_locus"] = {
            loc: {"n": len(fs), "median": (sorted(fs)[len(fs) // 2] if fs else None)}
            for loc, fs in by_locus.items()
        }

        buckets: dict[str, list[float]] = {}
        for f, l in zip(franks, lengths):
            if math.isnan(f):
                continue
            buckets.setdefault(length_bucket(l), []).append(f)
        slice_out["by_length"] = {
            k: {"n": len(fs), "median": sorted(fs)[len(fs) // 2]}
            for k, fs in buckets.items()
        }
        by_policy[policy] = slice_out

    out["by_tie_policy"] = by_policy
    pess = by_policy.get("pessimistic", {})
    for k in (
        "n_evaluated", "n_skipped", "median_frank", "mean_frank", "p95_frank",
        "frac_top1_pct", "frac_top5_pct", "frac_top10_pct", "by_locus", "by_length",
    ):
        if k in pess:
            out[k] = pess[k]
    return out
