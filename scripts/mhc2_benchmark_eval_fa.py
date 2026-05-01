#!/usr/bin/env python3
"""Source-protein FRANK benchmark on NetMHCIIpan_eval.fa.

Parses each entry of NetMHCIIpan-4.3's evaluation FASTA — 842 published
CD4+ epitopes from CEDAR — and computes the FRANK metric:

    Each entry has (epitope, source_protein, allele). We slide a window
    of length len(epitope) through source_protein, score every window
    plus the epitope itself, and report the rank of the epitope among
    all candidates. FRANK = (rank - 1) / num_candidates so 0 = perfect
    and 0.5 = random.

This is the standard CD4+ epitope benchmark. None of these epitopes
overlap HLAIIPred / NetMHCIIpan / MixMHC2pred / our training data
(they are explicitly the held-out eval set), so this is the cleanest
fair-generalization benchmark we have.

Output: a JSON with all three tie policies (pessimistic / random / optimistic)
+ per-locus + per-length breakdown + ROC-style "fraction of epitopes ranked
top-1 / top-5 / top-10".

The per-entry loop and FRANK math live in ``app.research.mhc2.eval_fa`` so
the in-training FRANK sentinel (train.py) shares them.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.research.mhc2.baselines.base import BaselineModel
from app.research.mhc2.baselines.hlaiipred import HLAIIPredAdapter
from app.research.mhc2.baselines.mixmhc2pred import MixMHC2predAdapter
from app.research.mhc2.baselines.netmhciipan import NetMHCIIpanAdapter
from app.research.mhc2.eval_fa import (
    TIE_POLICIES,
    parse_eval_fa,
    score_eval_fa,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--eval-fa", type=Path, required=True,
                        help="Path to NetMHCIIpan_eval.fa")
    parser.add_argument("--tool",
                        choices=["our", "netmhciipan", "mixmhc2pred", "hlaiipred"],
                        default="our",
                        help="Predictor to score with the same source-protein FRANK harness.")
    parser.add_argument("--checkpoint", type=Path,
                        help="Our model checkpoint (.best.pt)")
    parser.add_argument("--pseudosequences", type=Path)
    parser.add_argument("--esm-cache-dir", type=Path,
                        help="Required for ESM (Phase B) checkpoints.")
    parser.add_argument("--netmhciipan-bin",
                        help="Optional path to the NetMHCIIpan wrapper or inner binary.")
    parser.add_argument("--mixmhc2pred-bin",
                        help="Optional path to the MixMHC2pred binary.")
    parser.add_argument("--hlaiipred-root",
                        help="Optional HLAIIPred repo path; otherwise use $HLAIIPRED_ROOT.")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--out", type=Path, required=True,
                        help="Output JSON path.")
    args = parser.parse_args()

    print(f"[eval-fa] parsing {args.eval_fa}", flush=True)
    entries = parse_eval_fa(args.eval_fa)
    print(f"[eval-fa] {len(entries)} entries parsed", flush=True)

    scorer = _build_scorer(args)
    print(f"[eval-fa] scoring tool={scorer.name}", flush=True)

    summary = score_eval_fa(
        scorer.score,
        entries,
        supported_alleles=scorer.supported_alleles,
        progress_every=25,
    )
    franks_by_policy = summary.pop("per_entry_franks")
    alleles = summary.pop("per_entry_alleles")
    lengths = summary.pop("per_entry_lengths")
    summary["tool"] = scorer.name
    summary["model"] = str(args.checkpoint) if args.checkpoint else scorer.name
    summary["per_entry"] = [
        {
            "epitope": entries[i]["epitope"],
            "allele": alleles[i],
            "length": lengths[i],
            **{f"frank_{p}": franks_by_policy[p][i] for p in TIE_POLICIES},
        }
        for i in range(len(entries))
    ]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, indent=2, default=str) + "\n")
    print(f"[eval-fa] wrote {args.out}", flush=True)
    print(f"[eval-fa] median FRANK = {summary.get('median_frank', 'n/a')}", flush=True)
    print(f"[eval-fa] frac top-5%  = {summary.get('frac_top5_pct', 'n/a')}", flush=True)


class _EvalFaScorer:
    def __init__(self, name: str, supported_alleles: set[str] | None = None) -> None:
        self.name = name
        self.supported_alleles = supported_alleles

    def score(self, pairs: list[tuple[str, str]]) -> dict[str, float]:
        raise NotImplementedError


class _OurModelScorer(_EvalFaScorer):
    def __init__(self, args: argparse.Namespace) -> None:
        if args.checkpoint is None or args.pseudosequences is None:
            raise SystemExit("--checkpoint and --pseudosequences are required with --tool our")
        from app.research.mhc2.predict import MHC2Predictor

        self.predictor = MHC2Predictor(
            checkpoint_path=args.checkpoint,
            pseudosequence_path=args.pseudosequences,
            device=args.device,
            esm_cache_dir=args.esm_cache_dir,
        )
        self.batch_size = args.batch_size
        super().__init__(
            name=f"our:{args.checkpoint.name}",
            supported_alleles=set(self.predictor.pseudosequences),
        )

    def score(self, pairs: list[tuple[str, str]]) -> dict[str, float]:
        preds = self.predictor.predict_many(pairs, batch_size=self.batch_size)
        return {p.peptide: float(p.score) for p in preds}


class _BaselineScorer(_EvalFaScorer):
    def __init__(self, adapter: BaselineModel) -> None:
        ok, msg = adapter.is_available()
        if not ok:
            raise SystemExit(f"{adapter.name} unavailable: {msg}")
        self.adapter = adapter
        super().__init__(name=adapter.name)
        print(f"[eval-fa] {adapter.name}: {msg}", flush=True)

    def score(self, pairs: list[tuple[str, str]]) -> dict[str, float]:
        preds = self.adapter.predict(pairs)
        if len(preds) != len(pairs):
            raise RuntimeError(
                f"{self.adapter.name} returned {len(preds)} of {len(pairs)} predictions"
            )
        return {pred.peptide: float(pred.score) for pred in preds}


def _build_scorer(args: argparse.Namespace) -> _EvalFaScorer:
    if args.tool == "our":
        return _OurModelScorer(args)
    if args.tool == "netmhciipan":
        return _BaselineScorer(NetMHCIIpanAdapter(binary=args.netmhciipan_bin))
    if args.tool == "mixmhc2pred":
        return _BaselineScorer(MixMHC2predAdapter(binary=args.mixmhc2pred_bin))
    if args.tool == "hlaiipred":
        return _BaselineScorer(
            HLAIIPredAdapter(
                repo_root=args.hlaiipred_root,
                device=args.device,
                batch_size=args.batch_size,
            )
        )
    raise SystemExit(f"unknown tool: {args.tool}")


if __name__ == "__main__":
    main()
