# MHC-II open predictor — v0 baseline log (2026-04-25)

First defensible end-to-end checkpoint trained on full HLAIIPred. Lands at
val ROC-AUC **0.721** (epoch 2). This is *not* SOTA — the gap to
NetMHCIIpan-4.3 / MixMHC2pred-2.0 / HLAIIPred is ~0.22 AUC. This document
captures what was run, what came out, and exactly why we stopped here.

## Setup

- Branch: `codex/mhc2-research-handoff`, post-fixes (commits `55baea8`,
  `4c1d944`, `4b02128`).
- GPU: NVIDIA RTX 4090, 24 GB. PyTorch 2.11.0 + CUDA 13.0.
- Pseudosequences: NetMHCIIpan-4.3 `pseudosequence.2023.dat` consumed
  directly (`alleles.py` now handles DTU `DRB1_NNNN` and concatenated
  `DPA10103-DPB10101` forms; `data.py` admits `X` in pseudoseq alphabet).
- Allele coverage on the full HLAIIPred train set: **184/188 (98%)**.
- Decoys: 1× length-matched human-proteome (`UP000005640` reviewed).

## Training

```bash
python3 scripts/mhc2_train.py \
  --train-jsonl     data/mhc2/curated/hlaiipred_train.jsonl \
  --valid-jsonl     data/mhc2/curated/hlaiipred_valid.jsonl \
  --pseudosequences data/mhc2/netmhciipan_43/extracted/pseudosequence.2023.dat \
  --proteome-fasta  data/mhc2/proteome/human_uniprot_sprot.fasta \
  --out             data/mhc2/checkpoints/v0_baseline \
  --track           v0_baseline \
  --epochs          4 \
  --batch-size      32 \
  --decoys-per-positive 1 \
  --device          cuda \
  --early-stopping-patience 1 \
  --log-every       5000
```

- 1.39M positives + 1.39M decoys per epoch, 227k val records
- ~31 min/epoch on the 4090, 1,494 ex/s steady throughput
- AdamW, lr 1e-4, BCE-with-logits, no LR schedule
- Early-stopped at epoch 3; best checkpoint at epoch 2

### Per-epoch results

| Epoch | Train loss | Val loss | Val AUC | DR | DP | DQ |
|------:|-----------:|---------:|--------:|---:|---:|---:|
| 1 | 0.583 | 0.622 | 0.711 | 0.717 | 0.751 | 0.687 |
| **2 (best)** | **0.564** | **0.620** | **0.721** | **0.725** | **0.758** | **0.700** |
| 3 | 0.555 | 0.625 | 0.714 | 0.722 | 0.750 | 0.691 |

Train loss falls monotonically while val loss bottoms at epoch 2 and rises
at epoch 3 — clean overfitting onset. With 1.39M EL-only HLAIIPred records,
this small architecture exhausts useful signal in ~2 epochs.

## Held-out evaluation of `v0_baseline.best.pt`

Two independent test sets, both with length-matched human-proteome decoys
that pass the 9-mer-overlap filter against positives.

| Test set | Rows | ROC-AUC | PR-AUC | F1@0.5 |
|---|---:|---:|---:|---:|
| HLAIIPred test split sample (5k pos + 5k decoy) | 10,000 | 0.709 | 0.688 | 0.561 |
| NetMHCIIpan-4.3 eval (842 pos + 842 decoy) | 1,684 | 0.687 | 0.685 | 0.542 |

Slight degradation vs. val (0.721) is consistent with held-out test sets
having more rare alleles than val.

## Observed deficits — these explain the SOTA gap

1. **Tiny model.** 96-dim embeddings, 2 transformer layers, 4 heads (~150k
   params). NetMHCIIpan equivalents have ~500k+ params with motif-specific
   priors.
2. **No protein language model embeddings.** Every recent SOTA system uses
   ESM-2 (or analogous) for peptide and pseudoseq encoding. This is the
   single biggest architectural lever in the current literature.
3. **EL-only training.** No binding-affinity (BA) regression head. The DTU
   tarball ships ~25k BA records (`c000_ba` ... `c004_ba`) we are not yet
   parsing.
4. **1× decoy ratio.** NetMHCIIpan trains at ~9× decoys; ours is anemic.
5. **HLAIIPred-only.** The Racle/MixMHC2pred 2023 corpus, HLA Ligand Atlas,
   and Strazar/CAPTAn data are not yet parsed.
6. **No percentile rank calibration.** `predict.py` emits raw scores;
   `PercentileRanker` exists but is never populated.
7. **No motif deconvolution.** HLAIIPred's main contribution is per-peptide
   allele attribution in polyallelic samples; we use plain max-over-alleles
   MIL.
8. **No FRANK metric.** The published-paper standard. We report only ROC/PR.

The next steps (in priority order, with expected gains) are written up in
`mhc2_sota_plan.md`.

## Artifacts

```
data/mhc2/checkpoints/v0_baseline/
  v0_baseline.epoch1.pt   1.3 MB
  v0_baseline.epoch2.pt   1.3 MB    <- same as .best.pt
  v0_baseline.epoch3.pt   1.3 MB
  v0_baseline.pt          1.3 MB    <- last (== epoch3)
  v0_baseline.best.pt     1.3 MB    <- highest val_auc (== epoch2)
  v0_baseline.history.json
```

`data/` is gitignored — checkpoints are not committed. Re-create them with
the command block above.

## What this is and isn't

It is: a clean, reproducible v0 with honest evaluation on two independent
held-out sets and a documented overfitting trajectory.

It isn't: SOTA, publication-quality, or safe to wire into production. The
existing pVACseq + NetMHCIIpan path remains the canonical neoantigen
pipeline in cancerstudio.
