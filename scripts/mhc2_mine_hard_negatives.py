#!/usr/bin/env python3
"""Mine hard SwissProt-window negatives with a seed MHC-II checkpoint.

For each ``(allele, peptide_length)`` cell in the training JSONL we
1. sample ``N_pool`` random length-matched SwissProt windows (filtering
   any 9-mer that overlaps a training-positive 9-mer to avoid trivial
   self-matches),
2. score them against the allele with the seed predictor,
3. keep the top ``pool_top`` hardest (highest-scoring negatives).

For each individual positive we then deterministically draw ``--top-k``
samples from its allele/length pool — different positives in the same
cell get different hard negatives (seeded by ``cluster_id``) so the
training loader sees variety while every record stays in the "hard" tail.

The output JSONL is shaped like a normal MHC-II training file
(``MHC2Record.from_json`` parses it directly) so the trainer can consume
it with the same code path used for length-matched random decoys. Each
row carries ``cluster_id`` / ``cluster_weight`` inherited from the source
positive so cluster-aware sampling and weighting still work.

Usage:
    python3 scripts/mhc2_mine_hard_negatives.py \\
        --train-jsonl     data/mhc2/curated/cluster/cluster_train.jsonl \\
        --proteome-fasta  data/mhc2/proteome/human_uniprot_sprot.fasta \\
        --pseudosequences data/mhc2/netmhciipan_43/extracted/pseudosequence.2023.dat \\
        --seed-checkpoint data/mhc2/checkpoints/phaseB_v4_decoys3/phaseB_v4_decoys3.best.pt \\
        --esm-cache-dir   data/mhc2/esm_cache_cluster_d1 \\
        --pool-per-cell   2000 \\
        --pool-top         100 \\
        --top-k              3 \\
        --out             data/mhc2/curated/cluster/cluster_train_hard_negs.jsonl
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.research.mhc2.data import MHC2Record, peptide_9mers, read_jsonl
from app.research.mhc2.decoys import (
    read_fasta_sequences,
    sample_frank_candidates,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-jsonl", type=Path, required=True,
                        help="Source positives. Negatives will be ignored.")
    parser.add_argument("--proteome-fasta", type=Path, required=True)
    parser.add_argument("--pseudosequences", type=Path, required=True)
    parser.add_argument("--seed-checkpoint", type=Path, required=True,
                        help="Trained model used to score candidate windows. "
                             "phaseB_v4_decoys3.best.pt is the natural pick.")
    parser.add_argument("--esm-cache-dir", type=Path,
                        help="Optional. Speeds up scoring; if omitted, "
                             "predictor live-embeds (35M only).")
    parser.add_argument("--pool-per-cell", type=int, default=2000,
                        help="Random SwissProt windows to score per (allele, length) cell.")
    parser.add_argument("--pool-top", type=int, default=100,
                        help="How many top-scoring windows per cell to keep "
                             "as the eligible pool. Each positive draws --top-k "
                             "from this pool (with replacement disabled).")
    parser.add_argument("--top-k", type=int, default=3,
                        help="Hard negatives to emit per positive.")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    print(f"[mine] reading {args.train_jsonl}", flush=True)
    positives: list[MHC2Record] = []
    for record in read_jsonl(args.train_jsonl):
        if record.target >= 0.5:
            positives.append(record)
    print(f"[mine] kept {len(positives):,} positives", flush=True)

    # Per-allele forbidden 9-mer sets: a window is rejected for allele A only
    # if it overlaps a positive *for that allele*. The global 18M-9-mer set
    # caused enough memory pressure on hash lookups to dominate runtime; the
    # per-allele sets are typically 10-50k entries each, fast and more
    # semantically correct (a sequence that happens to be a B-allele binder
    # is a perfectly valid hard negative for A).
    forbidden_by_allele: dict[str, set[str]] = defaultdict(set)
    for p in positives:
        cores = list(peptide_9mers(p.peptide))
        for allele in p.alleles:
            forbidden_by_allele[allele].update(cores)
    sizes = sorted(len(s) for s in forbidden_by_allele.values())
    print(
        f"[mine] per-allele forbidden 9-mer sets: alleles={len(forbidden_by_allele):,} "
        f"min={sizes[0]:,} median={sizes[len(sizes)//2]:,} max={sizes[-1]:,}",
        flush=True,
    )

    print(f"[mine] reading proteome {args.proteome_fasta}", flush=True)
    proteome = read_fasta_sequences(args.proteome_fasta)
    print(f"[mine] proteome sequences: {len(proteome):,}", flush=True)

    # (allele, length) -> [positives sharing this cell]
    cell_to_positives: dict[tuple[str, int], list[MHC2Record]] = defaultdict(list)
    for p in positives:
        L = len(p.peptide)
        for allele in p.alleles:
            cell_to_positives[(allele, L)].append(p)
    print(f"[mine] non-empty (allele, length) cells: {len(cell_to_positives):,}", flush=True)

    print(f"[mine] loading seed predictor {args.seed_checkpoint}", flush=True)
    from app.research.mhc2.predict import MHC2Predictor

    predictor = MHC2Predictor(
        checkpoint_path=args.seed_checkpoint,
        pseudosequence_path=args.pseudosequences,
        device=args.device,
        esm_cache_dir=args.esm_cache_dir,
    )
    # Mining doesn't need inverted-DP: the seed score on the forward
    # orientation is enough to rank novel windows by hardness, and the
    # reversed-peptide live-embed path isn't batched so it dominates runtime
    # for DP cells.
    predictor.inverted_dp = False
    supported = set(predictor.pseudosequences)
    skipped_alleles = {a for (a, _) in cell_to_positives if a not in supported}
    if skipped_alleles:
        print(f"[mine] WARNING: {len(skipped_alleles)} alleles missing from "
              f"pseudoseq table — skipping. Sample: {sorted(skipped_alleles)[:5]}",
              flush=True)

    # Group cells by allele so each predict_many call amortises model
    # warmup, peptide-feature pre-embed, and chunk-loop overhead across all
    # lengths for that allele. Scoring per-cell was 10-30 sec/cell; per-allele
    # is ~3-5 sec/allele covering all its cells.
    cells_by_allele: dict[str, list[int]] = defaultdict(list)
    for (allele, length) in cell_to_positives:
        if allele in supported:
            cells_by_allele[allele].append(length)
    print(f"[mine] mining across {len(cells_by_allele):,} alleles "
          f"({sum(len(ls) for ls in cells_by_allele.values()):,} cells)",
          flush=True)

    cell_pool: dict[tuple[str, int], list[tuple[str, float]]] = {}
    for ai, allele in enumerate(sorted(cells_by_allele)):
        lengths = sorted(set(cells_by_allele[allele]))
        forbidden = forbidden_by_allele[allele]
        # Sample N_pool windows per length, all for this allele.
        triples: list[tuple[str, str, int]] = []  # (peptide, allele, length)
        for length in lengths:
            cell_seed = args.seed ^ (hash((allele, length)) & 0xFFFFFF)
            windows = sample_frank_candidates(
                length,
                proteome,
                n_candidates=args.pool_per_cell,
                seed=cell_seed,
                forbidden_9mers=forbidden,
            )
            for w in windows:
                triples.append((w, allele, length))
        if not triples:
            for length in lengths:
                cell_pool[(allele, length)] = []
            continue
        pairs = [(p, a) for p, a, _ in triples]
        try:
            preds = predictor.predict_many(pairs, batch_size=args.batch_size)
        except (KeyError, ValueError) as exc:
            print(f"[mine] allele {allele} predict failed: {exc!r}", flush=True)
            for length in lengths:
                cell_pool[(allele, length)] = []
            continue
        # Group by length, sort, keep top.
        by_length: dict[int, list[tuple[str, float]]] = defaultdict(list)
        for (peptide, _allele, length), pred in zip(triples, preds):
            by_length[length].append((peptide, float(pred.score)))
        top1_summary = {}
        for length, scored in by_length.items():
            scored.sort(key=lambda x: -x[1])
            cell_pool[(allele, length)] = scored[: args.pool_top]
            top1_summary[length] = scored[0][1] if scored else float("nan")
        if (ai + 1) % 25 == 0 or ai < 5:
            print(
                f"[mine] allele {ai+1}/{len(cells_by_allele)} {allele}: "
                f"scored {len(pairs):,} pairs across {len(lengths)} lengths, "
                f"top1 by L: {sorted(top1_summary.items())}",
                flush=True,
            )

    # Stage 2: per positive, draw top-K from its cell pool with cluster_id-seeded RNG.
    print("[mine] assigning hard negatives to positives...", flush=True)
    out_path: Path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n_written = 0
    n_no_pool = 0
    with out_path.open("w", encoding="utf-8") as fh:
        for positive in positives:
            L = len(positive.peptide)
            for allele in positive.alleles:
                pool = cell_pool.get((allele, L))
                if not pool:
                    n_no_pool += 1
                    continue
                # Per-positive deterministic draw — different positives in the
                # same cell pull different members of the top pool so coverage
                # is varied while every neg is still in the hardest tail.
                rng = random.Random(
                    args.seed ^ (hash(("hardneg", positive.cluster_id, allele, L)) & 0xFFFFFFFF)
                )
                k = min(args.top_k, len(pool))
                chosen = rng.sample(pool, k)
                for peptide, score in chosen:
                    record = MHC2Record(
                        peptide=peptide,
                        alleles=[allele],
                        target=0.0,
                        source="hard_swissprot_negative",
                        split=positive.split,
                        sample_id=positive.sample_id,
                        protein_id=None,
                        weight=positive.weight,
                        peptide_offset=None,
                        cluster_id=positive.cluster_id,
                        cluster_weight=positive.cluster_weight,
                        sample_allele_set=positive.sample_allele_set,
                        label_type="presentation",
                    )
                    payload = asdict(record)
                    # The seed score is metadata for analysis; keep it on the row.
                    payload["mined_score"] = score
                    fh.write(json.dumps(payload) + "\n")
                    n_written += 1

    print(
        f"[mine] wrote {n_written:,} hard negatives to {out_path}; "
        f"{n_no_pool:,} (positive, allele) pairs had empty pools and were skipped.",
        flush=True,
    )


if __name__ == "__main__":
    main()
