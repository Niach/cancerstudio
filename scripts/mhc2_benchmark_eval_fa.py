#!/usr/bin/env python3
"""Source-protein FRANK benchmark on NetMHCIIpan_eval.fa.

Parses each entry of NetMHCIIpan-4.3's evaluation FASTA — 842 published
CD4+ epitopes from CEDAR — and computes the FRANK metric:

    Each entry has (epitope, source_protein, allele). We slide a window
    of length len(epitope) through source_protein, score every window
    plus the epitope itself, and report the rank of the epitope among
    all candidates. FRANK = (rank − 1) / num_candidates so 0 = perfect
    and 0.5 = random.

This is the standard CD4+ epitope benchmark. None of these epitopes
overlap HLAIIPred / NetMHCIIpan / MixMHC2pred / our training data
(they are explicitly the held-out eval set), so this is the cleanest
fair-generalization benchmark we have.

Output: a JSON with median / p95 / mean FRANK + per-allele + per-length
breakdown + ROC-style "fraction of epitopes ranked top-1 / top-5 / top-10".
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.research.mhc2.alleles import normalize_mhc2_allele
from app.research.mhc2.metrics import locus_for_allele


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
    with path.open("r") as fh:
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
    protein_id = parts[0]
    epitope = parts[1].upper()
    allele_raw = parts[2]
    return {
        "protein_id": protein_id,
        "epitope": epitope,
        "allele_raw": allele_raw,
        "protein": sequence.upper(),
    }


def normalize_eval_allele(raw: str) -> str | None:
    """Map NetMHCIIpan eval-style allele names to our HLA-DRB1*04:01 form.

    Examples seen in eval.fa:
      DRB1_0401             -> HLA-DRB1*04:01
      DRB5_0101             -> HLA-DRB5*01:01
      HLA-DQA10501-DQB10301 -> HLA-DQA1*05:01-DQB1*03:01
      H-2-IAb               -> H-2-IAb (mouse, may not be in our pseudoseq table)
    """
    s = raw.strip()
    # Mouse / non-human alleles — leave as-is and let pseudoseq lookup fail
    if not s.startswith(("DR", "DP", "DQ", "HLA-")):
        return s
    s_no_prefix = s.removeprefix("HLA-")
    # Heterodimer: e.g. DPA10103-DPB10401, or HLA-DQA10501-DQB10301
    if "-" in s_no_prefix:
        parts = s_no_prefix.split("-")
        out_parts = []
        for part in parts:
            out_parts.append(_format_chain(part))
        return "HLA-" + "-".join(out_parts)
    # Single chain like DRB1_0401
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
    """For one (epitope, protein, allele) entry, return a list of
    (peptide, allele_norm, is_epitope) for: each unique window of
    epitope-length in the source protein, plus the epitope itself.

    is_epitope=True only on the actual epitope peptide string (note:
    if the epitope happens to also appear as a window in the protein,
    that window is collapsed into the same peptide and tagged as
    epitope so we don't penalize-rank-ties artificially).
    """
    peptide = entry["epitope"]
    protein = entry["protein"]
    allele_norm = normalize_eval_allele(entry["allele_raw"])
    if allele_norm is None:
        return []
    L = len(peptide)
    if L < 9 or len(protein) < L:
        return []
    candidates: dict[str, bool] = {}  # peptide -> is_epitope
    for i in range(len(protein) - L + 1):
        win = protein[i : i + L]
        # Skip windows with non-standard residues
        if not all(c in "ACDEFGHIKLMNPQRSTVWY" for c in win):
            continue
        candidates[win] = candidates.get(win, False)
    candidates[peptide] = True  # epitope, overrides if same string
    return [(pep, allele_norm, is_ep) for pep, is_ep in candidates.items()]


def compute_frank(scores: dict[str, float], epitope: str) -> float:
    """FRANK = (rank − 1) / N_candidates_excluding_epitope.

    We rank the epitope among all candidates (incl. itself); 0.0 means
    epitope is the highest-scoring window.
    """
    if not scores or epitope not in scores:
        return float("nan")
    ep_score = scores[epitope]
    others = [s for p, s in scores.items() if p != epitope]
    if not others:
        return 0.0
    # Number of candidates with score strictly greater than the epitope.
    better = sum(1 for s in others if s > ep_score)
    # Ties: report the worse rank (be pessimistic).
    ties = sum(1 for s in others if s == ep_score)
    rank_pess = better + ties
    return rank_pess / len(others)


def aggregate(franks: list[float], alleles: list[str], lengths: list[int]) -> dict:
    valid = [f for f in franks if not math.isnan(f)]
    n = len(valid)
    out: dict = {
        "n_entries": len(franks),
        "n_evaluated": n,
        "n_skipped": len(franks) - n,
    }
    if not valid:
        return out
    sorted_franks = sorted(valid)
    out["median_frank"] = sorted_franks[n // 2]
    out["mean_frank"] = sum(valid) / n
    out["p95_frank"] = sorted_franks[min(int(0.95 * n), n - 1)]
    out["frac_top1_pct"] = sum(1 for f in valid if f <= 0.01) / n
    out["frac_top5_pct"] = sum(1 for f in valid if f <= 0.05) / n
    out["frac_top10_pct"] = sum(1 for f in valid if f <= 0.10) / n

    # Per-locus
    by_locus: dict[str, list[float]] = {"DR": [], "DP": [], "DQ": [], "other": []}
    for f, a in zip(franks, alleles):
        if math.isnan(f):
            continue
        by_locus[locus_for_allele(a)].append(f)
    out["by_locus"] = {
        loc: {"n": len(fs), "median": (sorted(fs)[len(fs) // 2] if fs else None)}
        for loc, fs in by_locus.items()
    }

    # Per length bucket
    buckets: dict[str, list[float]] = {}
    for f, l in zip(franks, lengths):
        if math.isnan(f):
            continue
        if l <= 11:
            key = "<=11"
        elif l <= 15:
            key = "12-15"
        elif l <= 19:
            key = "16-19"
        else:
            key = ">=20"
        buckets.setdefault(key, []).append(f)
    out["by_length"] = {
        k: {"n": len(fs), "median": sorted(fs)[len(fs) // 2]}
        for k, fs in buckets.items()
    }
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eval-fa", type=Path, required=True,
                        help="Path to NetMHCIIpan_eval.fa")
    parser.add_argument("--checkpoint", type=Path, required=True,
                        help="Our model checkpoint (.best.pt)")
    parser.add_argument("--pseudosequences", type=Path, required=True)
    parser.add_argument("--esm-cache-dir", type=Path,
                        help="Required for ESM (Phase B) checkpoints.")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--out", type=Path, required=True,
                        help="Output JSON path.")
    args = parser.parse_args()

    from app.research.mhc2.predict import MHC2Predictor

    print(f"[eval-fa] parsing {args.eval_fa}", flush=True)
    entries = parse_eval_fa(args.eval_fa)
    print(f"[eval-fa] {len(entries)} entries parsed", flush=True)

    predictor = MHC2Predictor(
        checkpoint_path=args.checkpoint,
        pseudosequence_path=args.pseudosequences,
        device=args.device,
        esm_cache_dir=args.esm_cache_dir,
    )

    franks: list[float] = []
    alleles: list[str] = []
    lengths: list[int] = []
    skipped_no_pseudoseq = 0
    skipped_too_short = 0

    for i, entry in enumerate(entries):
        pairs = make_pairs_for_entry(entry)
        if not pairs:
            skipped_too_short += 1
            franks.append(float("nan"))
            alleles.append("?")
            lengths.append(len(entry["epitope"]))
            continue
        allele_norm = pairs[0][1]
        if allele_norm not in predictor.pseudosequences:
            skipped_no_pseudoseq += 1
            franks.append(float("nan"))
            alleles.append(allele_norm)
            lengths.append(len(entry["epitope"]))
            continue
        score_pairs = [(pep, all_) for pep, all_, _ in pairs]
        try:
            preds = predictor.predict_many(score_pairs, batch_size=args.batch_size)
        except (KeyError, ValueError) as exc:
            franks.append(float("nan"))
            alleles.append(allele_norm)
            lengths.append(len(entry["epitope"]))
            continue
        scores = {p.peptide: float(p.score) for p in preds}
        f = compute_frank(scores, entry["epitope"])
        franks.append(f)
        alleles.append(allele_norm)
        lengths.append(len(entry["epitope"]))
        if (i + 1) % 100 == 0:
            valid_so_far = [x for x in franks if not math.isnan(x)]
            med = sorted(valid_so_far)[len(valid_so_far) // 2] if valid_so_far else float("nan")
            print(
                f"[eval-fa] {i+1}/{len(entries)} entries, running median_frank={med:.4f}",
                flush=True,
            )

    summary = aggregate(franks, alleles, lengths)
    summary["skipped_no_pseudoseq"] = skipped_no_pseudoseq
    summary["skipped_too_short"] = skipped_too_short
    summary["model"] = str(args.checkpoint)
    summary["per_entry"] = [
        {"epitope": e["epitope"], "allele": a, "length": l, "frank": f}
        for e, a, l, f in zip(entries, alleles, lengths, franks)
    ]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, indent=2, default=str) + "\n")
    print(f"[eval-fa] wrote {args.out}", flush=True)
    print(f"[eval-fa] median FRANK = {summary.get('median_frank', 'n/a')}", flush=True)
    print(f"[eval-fa] frac top-5%  = {summary.get('frac_top5_pct', 'n/a')}", flush=True)


if __name__ == "__main__":
    main()
