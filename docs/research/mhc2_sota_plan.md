# MHC-II open predictor — path from v0 baseline to SOTA

The v0 baseline (see `mhc2_v0_baseline_log.md`) lands at val ROC-AUC 0.721.
NetMHCIIpan-4.3, MixMHC2pred-2.0, and HLAIIPred all sit around 0.94-0.95
on comparable EL benchmarks. This document is the concrete step-by-step
plan to close the ~0.22 gap, ordered by gain-per-effort ratio so each
phase can be stopped early without wasting the work that came before.

## Phase A — quick wins on the existing architecture (target: 0.85)

One overnight run, no new architecture, no new data.

1. **Decoys 1× → 10×.** Current 1:1 positive:decoy biases the model toward
   "everything binds." NetMHCIIpan trains at ~9× decoys.
   - Code change: `--decoys-per-positive 10`
   - Memory cost: 10× more train records (27.8M instead of 2.78M); fits on
     disk easily, may push wall-time per epoch to ~3 hours
   - Expected gain: +0.04-0.07 AUC

2. **Add NetMHCIIpan-4.3 EL training partitions.** The DTU tarball already
   on disk has `c000_el` ... `c004_el` (~750k more EL records, with
   stronger DP/DQ coverage than HLAIIPred). Need a ~30-line parser; the
   files are space-separated `peptide allele target binder_or_not` lines.
   - Code change: new `iter_netmhciipan_partition_file()` in `data.py`,
     wired into `mhc2_prepare_dataset.py` with `--source netmhciipan_43_el`
   - Expected gain: +0.02-0.04, especially on DQ

3. **Bigger model.** 96-dim → 192-dim, 2 layers → 4, heads 4 → 8.
   - Code change: pass through `MHCIIInteractionModel` constructor args
     in `model_config` from `train.py`; expose as CLI flags
   - Memory: still fits at batch 32 in 24 GB
   - Expected gain: +0.03-0.05

4. **LR schedule.** Currently flat 1e-4 AdamW. Add 1k-step linear warmup
   then cosine decay to 1e-6 over the run.
   - Code change: `torch.optim.lr_scheduler.SequentialLR` wrapping
     `LinearLR` + `CosineAnnealingLR`
   - Expected gain: +0.01-0.02

5. **Run longer.** With 10× decoys + bigger model, plan for 5-7 epochs
   with patience 2 instead of 1. Best checkpoint will land somewhere mid-run.

**Acceptance:** val ROC-AUC ≥ 0.83 on HLAIIPred valid split. If we miss it,
something is wrong with one of the four levers — bisect before phase B.

## Phase B — ESM-2 embeddings (target: 0.91)

The single biggest architectural lever in the current MHC-II literature.

6. **Frozen ESM-2 features.** Use `esm2_t12_35M_UR50D` (smallest, ~35M
   params) for the first run. Encode peptide cores AND HLA pseudosequences
   through ESM and concatenate the per-residue features.
   - One-time embedding extraction: peptide → tensor, pseudoseq → tensor,
     cached to a `.pt` lookup file (~2 GB for HLAIIPred + NetMHCIIpan)
   - Training reads from the cache; ESM is never run during training
   - Adapter: 2 transformer layers + cross-attention on top of frozen ESM
     features (replaces the from-scratch embedding + 2-layer encoder)
   - Expected gain: +0.05-0.08

7. **Optional: bigger ESM (`esm2_t30_150M_UR50D`)** if 35M plateaus.
   Linear gains diminish past 150M for this task.

**Acceptance:** val ROC-AUC ≥ 0.89.

## Phase C — multi-task training and more data (target: 0.93)

Each of these adds ~0.01-0.02 AUC; together they meaningfully shrink the
remaining gap.

8. **BA regression head.** Parse `c000_ba` ... `c004_ba` from the DTU
   tarball (~25k IC50-labeled records). Add a second model output head
   with MSE loss on `log(IC50/50000)`. Multi-task in this setup is
   essentially free: the shared encoder benefits the EL classifier.

9. **Racle/MixMHC2pred 2023 corpus.** PRIDE accession `PXD034773`,
   ~627k EL records, 88 allele motifs. Data is in MS-style format; needs
   a custom parser. Worth the effort because of motif diversity.

10. **HLA Ligand Atlas.** ~143k benign-tissue EL records, CC-BY licensed,
    clean TSV download. Cheapest data add — should be one afternoon.

11. **Skip SysteMHC v2** unless desperate. Its labels are partly
    predictor-derived, so training on it teaches our model to mimic
    NetMHCIIpan rather than improve on it.

**Acceptance:** val ROC-AUC ≥ 0.92, and per-locus AUC ≥ 0.90 on DR/DP.

## Phase D — calibration and honest benchmarking (no AUC gain, defensibility)

These don't lift numbers but make claims publishable.

12. **Per-allele percentile rank calibration.** Score 100k random proteome
    9-mers per allele, build empirical CDFs; predictions emit `%rank`
    alongside `score`. Users in the field filter on `%rank < 2%` (binder)
    and `< 0.5%` (strong binder) — not raw scores.

13. **FRANK metric.** For each true ligand, score all length-matched
    windows of its source protein and report the rank of the true peptide.
    NetMHCIIpan-4.3 reports median FRANK ~0.5-2%. This is the metric
    publications compare on.

14. **Benchmark adapters for external tools.** Wrap NetMHCIIpan,
    MixMHC2pred, MHCnuggets binaries (where users have legal access) so
    we score the *same* held-out set with all of them. Honest comparison
    in the model card.

15. **Per-allele and length-bucket test breakdown.** Already have
    per-locus; extend to per-allele AUC table and length-bucket AUC for
    9-, 12-, 15-, 18-, 21-mer peptides.

**Acceptance:** publishable model card with cross-tool comparison on
HLAIIPred test, NetMHCIIpan eval, and a Racle held-out set.

## Phase E — SOTA refinements (target: 0.94+)

16. **HLAIIPred-style deconvolution-aware loss.** For each polyallelic
    sample, use a soft EM step that infers which allele most likely
    presented each peptide. This is the HLAIIPred paper's main
    contribution. Substantial code; expect +0.01-0.02.

17. **Cluster-aware splits.** `splits.py` already implements 9-mer
    connected-component splits. Switch eval to use those — currently we
    use HLAIIPred's pre-defined splits, which leak somewhat. Will
    *lower* reported numbers (because honest), but the comparison vs.
    cluster-split published baselines is what matters.

18. **Length-aware and allele-frequency-aware loss weighting.** Down-weight
    common alleles and common lengths; up-weight rare ones. Helps tail
    performance.

19. **Fine-tune ESM weights end-to-end.** Once everything else is stable,
    unfreeze the top 4 layers of ESM at 1e-5 LR. Expected gain: +0.005-0.01.
    Last because it's easy to break a working model with this.

## What this plan is NOT

- **Not a multi-source distillation effort.** Training on outputs of
  NetMHCIIpan / MixMHC2pred would just teach our model to mimic them.
  We use only experimentally-grounded labels (EL + BA + biochemistry).
- **Not a license-laundering exercise.** SysteMHC v2 partially predictor-
  derived labels are excluded from training (allowed only for weak
  evaluation if explicitly tagged). Graph-pMHC dataset is benchmark-only
  (Genentech code is non-commercial).
- **Not a dog/cat extension.** All of this is human HLA-II only.
  Canine DLA / feline FLA class-II remains scientifically infeasible
  until enough species-specific peptide-ligand evidence accumulates.

## Time + cost estimate

| Phase | Engineering | GPU time | Cumulative AUC target |
|---|---|---|---|
| A | 1 evening | ~5h overnight | 0.85 |
| B | 3-5 days | ~10h training | 0.91 |
| C | ~1 week | ~20h training | 0.93 |
| D | 3-5 days | ~5h scoring | 0.93 (publishable) |
| E | 1-2 weeks | ~30h training | 0.94+ |

Total: ~3-5 weeks of focused work. Do phases A-C and stop is a
defensible "good open MHC-II predictor" milestone; D-E is for
"genuinely SOTA, published model card."
