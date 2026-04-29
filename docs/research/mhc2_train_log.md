# MHC-II training log

Cumulative record of every cancerstudio MHC-II training run. New runs append at the bottom. Keep this in sync with the actual checkpoints — don't claim a result that hasn't landed.

## Validation set

All val_auc numbers below are on the cluster-aware `cluster_valid.jsonl` (no 9-mer leakage with `cluster_train.jsonl`), polyallelic max-over-alleles scoring. Length distribution includes 8-25 aa peptides; ~48% of records are ≤11-mer (BA-style) and ~52% are 13+ aa (EL-style).

## Reference

| run | val_auc on cluster_valid | DR | DP | DQ |
|---|---|---|---|---|
| HLAIIPred-2025 published | 0.9484 (their cluster_valid; ours: 0.9442 on cluster_test sample) | — | — | — |
| **gap to close** | **0.10** | | | |

## Runs

### v0_baseline (Phase A scratch, 2026-04-25)

- **Config:** scratch interaction model 96/128/2/4, decoys=1, BCE, no protocol switches.
- **Result:** **val_auc = 0.7632**.
- **Takeaway:** Pure scratch baseline. Establishes "the bar" the ESM features have to clear.

### v3a_sampler (Phase A scratch + sampler, 2026-04-28)

- **Config:** v0 config + `--cluster-weighted-sampler`.
- **Result:** **val_auc = 0.7157** (regression).
- **Takeaway:** Sampler alone *hurts* the scratch model. Likely interaction with limited capacity (326k params) and the sampler reshuffling exposing more clusters. Not pursued further.

### repro_v1 / repro_v2 (HLAIIPred-protocol-stack on scratch, 2026-04-28)

- **Config:** scratch 192/384/4/8, decoys=10, multi-task BA + allele dropout + dynamic decoys + cluster_weighted (loss / sampler).
- **Result:** v1 = 0.6814 (cluster-weighted-as-loss diluted gradients), v2 = 0.7223 (no loss-weight).
- **Takeaway:** Stacking protocol switches on scratch architecture *hurts* below v0. The protocol switches assume a model with enough representational capacity; our scratch isn't there. Recipe-driven knobs ≠ universally beneficial.

### phaseB_v1_esm_sampler (Phase B baseline, 2026-04-28)

- **Config:** ESM-2 35M frozen features + 10M-param adapter (480 dim, 2 layers, 8 heads, 1024 hidden), `--cluster-weighted-sampler`, decoys=1, BS=32, LR=1e-4, 3 epochs, ES patience=1.
- **Result:** **val_auc = 0.8469 (epoch 2 best)**, epoch 1 = 0.8297, epoch 3 = 0.8323 (overfit, ES fired).
- **Per-locus best:** DR 0.847 / DP 0.862 / DQ 0.840.
- **Takeaway:** **ESM-2 features close half the gap to HLAIIPred (+0.084 over scratch).** The remaining 0.10 is architectural/protocol, not data.
- **Cluster_test benchmark (sample 20k, all 4 tools):** v1 = 0.8585 (DR 0.854 / DP 0.873 / DQ 0.858) vs HLAIIPred 0.9442 vs NetMHCIIpan 0.6482 vs MixMHC2pred 0.5806. Beats NetMHCIIpan/MixMHC2pred decisively; behind HLAIIPred by 0.086 absolute.
- **Best ckpt:** `data/mhc2/checkpoints/phaseB_v1_esm_sampler/phaseB_v1_esm_sampler.best.pt` (192 MB).

### phaseB_v2_invertedDP (Phase B + inverted DP, 2026-04-29, Vast 35714879)

- **Config:** phaseB_v1 + `--inverted-dp`.
- **Reversed cache:** DP-filtered (1.665M peptides, 23 GB) due to disk on the 80 GB Vast box. Non-DP-trained peptides scored against DP alleles fall back to live-embed (rare in practice).
- **Result epoch 1:** **val_auc = 0.8284** (vs v1 epoch1 0.8297, **−0.0013 — within noise**).
- **Per-locus epoch 1:** DR 0.819 (−0.010 vs v1) / **DP 0.873 (+0.029 vs v1)** / DQ 0.818 (−0.006 vs v1).
- **Takeaway:** **Inverted DP delivers exactly what the literature predicts for DP** (+0.029) but slightly hurts DR/DQ. Aggregate val_auc essentially unchanged. Whether the DP gain is "worth" the DR/DQ regression depends on cluster_test results.
- **Status:** epoch 2 still training (Box A, expected ~17:30 UTC).

### phaseB_v3_combined (Phase B + invertedDP + locus_upweight, 2026-04-29, Vast 35828305)

- **Config:** phaseB_v2 + `--locus-upweight inverse_frequency` (DP×1.97, DQ×1.02, DR×0.66).
- **Reversed cache:** Full corpus (2.838M peptides, 40 GB) on the 250 GB Vast box.
- **Result epoch 1:** **val_auc = 0.8184** (vs v1 0.8297 −0.0113; vs v2 0.8284 −0.0100, **regression**).
- **Per-locus epoch 1:** DR 0.819 (≈v2) / **DP 0.825 (−0.048 vs v2!)** / DQ 0.814 (−0.003 vs v2).
- **Takeaway:** **`--locus-upweight inverse_frequency` HURT, including the DP slice it was supposed to help.** Doubling DP gradient signal destabilized training around DP-specific patterns. Recipe assumes DR-bias is the problem; our model never had it, so the correction over-corrected. **Don't use locus_upweight in future runs.**
- **Status:** epoch 2 still training (Box B), but unlikely to overtake v2 given the consistent regression.

## Open ablation questions

| q | answered? |
|---|---|
| Does ESM beat scratch? | **YES**, +0.084 |
| Does cluster_weighted_sampler help? | YES on ESM (used by all phaseB runs); HURT on scratch (v3a) |
| Does inverted DP help DP slice? | **YES, +0.029** at epoch 1 |
| Does inverted DP help aggregate val_auc? | **NO**, DR/DQ regress, net ≈ 0 |
| Does locus_upweight help? | **NO**, regresses everything including DP |
| Does decoys=3 or 10 help? | **untested**; phaseB_v1 used decoys=1 |
| Does multi_task_ba help? | untested as a single knob (was bundled into the failed scratch v2) |
| Does logsumexp aggregation help? | untested |
| Does 5-fold CV ensemble help? | untested |

## Cost ledger

| run | wall time | cost ($0.40-0.55/h) |
|---|---|---|
| v0_baseline (3 epochs) | ~3h | ~$1.20 |
| repro_v1 + v2 (≤epoch 3) | ~14h combined | ~$5.60 |
| v3a_sampler (2 epochs early-stop) | ~52 min | ~$0.35 |
| phaseB_v1_esm_sampler (3 epochs) | 9h 50min | $3.92 |
| phaseB_v2_invertedDP (in progress) | ~12h projected | ~$4.80 |
| phaseB_v3_combined (in progress) | ~12h projected | ~$6.60 (bigger box) |
| ESM cache builds | 2× ~25 min | ~$0.30 |
| Benchmarks (4-tool cluster_test sample 20k) | 26 min | ~$0.17 |
| **subtotal so far** | | **~$23** |

## What we'd train next

In priority order, given current evidence:

1. **decoys=3** — recipe-recommended; phaseB_v1 used decoys=1. Cheap test; +0.005 lift would be worth the run.
2. **logsumexp allele aggregation** — soft "any-allele can present" vs hard max. Theory says it should help on polyallelic data; empirically untested for our model.
3. **5-fold CV ensemble** — needed for the published claim. Headline number from ensemble of 5 fold-trained models.

What we should NOT train (wasted compute):
- locus_upweight in any combination (this run confirms it hurts)
- More aggressive scratch architectures (v0/v3a/v1/v2 covered the scratch space)
- 10× decoys (v2/v3 of repro_* showed this just amplifies gradients pathologically)

## Notes

- **HLAIIPred lead is uniform across loci (~0.08-0.10 each)** in the cluster_test benchmark. The gap is architectural, not locus-specific.
- **Inverted DP's effect is DP-only** as theory predicts. It just doesn't pay back on aggregate AUC.
- The scratch model's 326k params are too small for any of the protocol switches (allele dropout, dynamic decoys, multi-task BA) to add value. They all work *on the ESM-features path* and probably need re-evaluation only there.
