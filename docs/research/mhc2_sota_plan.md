# MHC-II open predictor — path to a defensibly SOTA result

This replaces the earlier "Phase A → B → C → D → E hit-AUC-X-by-epoch-Y"
plan. After running through Phase A (val_auc 0.7632 on cloud) and a leaky
first cut at Phase B, the right framing is no longer "which AUC do we
hit." Real SOTA is a **comparative claim against current published tools
on a leakage-controlled benchmark** — and we don't yet have the harness to
make that claim defensibly. The plan below puts that harness first, then
adds the architecture/data levers that close the gap.

## What "SOTA" actually means here

SOTA for MHC-II ligand prediction in 2025-2026 is the cluster of:

- NetMHCIIpan-4.3 / 4.3j (DTU, EL+BA, motif-aware MIL)
- MixMHC2pred-2.0 (Racle et al., Trans-Lab, 2023 data)
- Graph-pMHC (Genentech, structural / context-aware)
- HLAIIPred (Nature Comm 2025; soft-EM deconvolution + cluster-weighted)

They report ROC-AUC ≈ 0.94-0.95 on the splits they each published, but
the splits are not interchangeable, and the MS pipelines that produced the
labels are not interchangeable either. **A 0.85 number on HLAIIPred's own
val split tells us nothing about whether we beat them on a shared
benchmark.** That is the methodological hole this plan closes.

The SOTA bar we want to clear is:

> Beat current published baselines on at least two **independent**
> benchmark families (NetMHCIIpan-4.3 eval + Racle/HLA Ligand Atlas
> hold-out) under a **leakage-controlled** split, with no major DR/DP/DQ
> regression and per-allele percentile-rank calibration.

That is the gate; everything below is the path to clearing it.

## The previous plan vs. this one

The Phase A→E plan was right about *what* to add (ESM features, multi-task
BA, deconvolution, calibration) but wrong about *order*. It treated the
benchmark as the last step. Codex's critique made the point: we need the
benchmark first, because (a) we cannot iterate without measuring against
real tools, (b) the splits used for those measurements decide everything
the model learns, and (c) the ESM lever alone is not the gap to SOTA.

## Workstreams (parallelizable, ranked by value)

### 1. Locked benchmark harness — *gate for every later claim*

Concretely:

- **Cluster-aware splits.** `splits.py` already implements connected-
  component splits over 9-mer overlap. Replace the HLAIIPred-shipped
  splits with a single shared train/valid/test produced by that path.
  Save under `data/mhc2/curated/cluster/`. Re-run our model + every
  baseline against the same `test.cluster.jsonl`.
- **Adapter for each baseline tool** under
  `backend/app/research/mhc2/baselines/`:
  * `netmhciipan.py` — wrap the DTU CLI (license required, free for
    academic use).
  * `mixmhc2pred.py` — pip-installable; trivial wrapper.
  * `hlaiipred.py` — open-source on GitHub.
  * `graph_pmhc.py` — non-commercial license; eval-only.
  Each adapter takes `(peptide, allele)` pairs and returns
  `(score, %rank, predicted_core)`.
- **Metrics.** Extend `metrics.py` with FRANK, bootstrap CIs (1000-iter
  basic-bootstrap by default), per-locus DR/DP/DQ, per-length 9/12/15/18/
  21-mer slices, per-allele rare-allele table.
- **Driver.** `scripts/mhc2_benchmark_baselines.py` runs N models against
  the locked test set, writes `benchmark_results.json` + a markdown
  comparison table. CI-friendly subset for fixture-based tests.
- **Acceptance:** running the harness on a stable corpus reproduces
  published numbers within ±0.01 AUC for at least one baseline. That
  proves our adapters are correct before we trust comparison numbers.

### 2. Schema + data extensions — *unlocks everything else*

Extend `MHC2Record` (backward-compatible defaults) with:

- `label_type`: `"presentation"` (EL) or `"affinity"` (BA)
- `ba_value`: float, log-transformed binding affinity for BA records
- `cluster_id`, `cluster_weight`: from cluster-aware splits
- `sample_allele_set`: original sample-level allele set when from a
  polyallelic sample
- `context_left`, `context_right`: 8-residue source-protein flanks (when
  available — NetMHCIIpan EL has them, HLAIIPred CSV does not)

Then plumb through parsers, collator, training loop. Multi-task BA + soft-
EM both depend on these.

### 3. Multi-task BA head — *cheap +0.02-0.03*

`c000_ba … c004_ba` are already on disk from the NetMHCIIpan tarball but
unused. ~25k records labeled with IC50.

- New parser: `iter_netmhciipan_ba_partition_file()`.
- New regression head on `MHCIIESMModel`: shares the encoder, predicts
  `log(IC50 / 50000)`.
- Multi-task loss: `L = L_el + λ * L_ba` with λ ≈ 0.3 to start.
- Sample mixing: round-robin batches between EL and BA partitions, or
  joint-batch with a head-mask.

### 4. Cluster-weighted loss — *fairness across motifs*

Per-record weight = `1 / max(1, n_records_in_same_cluster)`. Same data,
same architecture, just loss weighting. Most directly addresses HLAIIPred's
observation that motif-redundant clusters overwhelm rare-allele signal.

### 5. HLAIIPred-style soft-EM deconvolution — *the publication-tier lever*

For each polyallelic sample, alternate:

1. E-step: given current scores, infer per-peptide allele responsibility
   `q(a | x)` via softmax over allele scores within the sample.
2. M-step: weight each (peptide, allele) loss term by `q(a | x)`.

This is the architectural change that turns plain max-over-alleles MIL
into a soft assignment. HLAIIPred reports +0.02-0.04 from this alone.

### 6. Per-allele %rank calibration — *required for any release*

For each allele:

- Sample 100k random 9-mer windows from the human proteome.
- Score them with the trained model.
- Build the empirical CDF.
- `%rank(score) = 1 - CDF(score)`.

Save calibration tables alongside the checkpoint. `predict.py` then emits
`score_el` + `rank_el` per (peptide, allele). Users in the field filter
on `rank < 2%` (binder) and `< 0.5%` (strong binder); raw sigmoid scores
are not interpretable.

### 7. ESM adapter — *now: the architecture, not the headline*

The Phase B v2 leak fix + Phase B v3 packed cache (commits `94c95e8` and
`ba76e68`) leave us with a working ESM-2 35M frozen-features adapter that
trains end-to-end. We hit step 49k of epoch 1 with loss 0.20 and a clean
descent before stopping. Treat this as the **default model architecture**
that the workstreams above plug into, not as the marquee result.

If after workstreams 1-6 we are still ≥0.04 below SOTA, *then* try
unfreezing the top 4 ESM layers at lr 1e-5, or jumping to
`esm2_t30_150M_UR50D`. Don't reach for those until the fundamentals
above are in.

## Production discipline

- This is **research-only** until at least the harness gate is met.
- Production neoantigen pipeline keeps using pVACseq + NetMHCIIpan/
  MHCflurry; nothing in this branch lands anywhere close to that
  pipeline until the benchmark says we beat the current tools.
- Checkpoints/calibration tables will be Hetzner-S3-hosted with a
  manifest committed to git; no model weights in git.

## Order of operations

1. **Cluster splits** (data prep, no GPU). Builds `test.cluster.jsonl`.
2. **Schema extension** + parser updates for BA + context fields.
3. **Metrics** (FRANK, bootstrap, per-slice).
4. **Baseline adapter for MixMHC2pred** (cheapest baseline to install).
   Confirms the harness reproduces published numbers within ±0.01.
5. **Cluster-weighted loss** + retrain on cluster splits → first honest
   internal number.
6. **Multi-task BA head** → second iteration.
7. **NetMHCIIpan + HLAIIPred adapters** in the harness.
8. **Per-allele %rank calibration**.
9. **Soft-EM deconvolution** (the big architectural lever).
10. Publishable model card with cross-tool comparison.

Steps 1-4 are gating; once the harness reproduces a baseline, every later
step is measured against the locked benchmark, not against itself.

## What we do NOT do

- Train more before the harness exists. The cost-benefit on a 30h cloud
  run with no comparator is bad now that we know the architecture works.
- Race three architectures in parallel before establishing one good one.
- Add ESM-2 150M before the smaller model has been honestly benchmarked.
- Train on predictor-derived labels (SysteMHC v2 partial labels stay out
  of training, they would teach our model to mimic NetMHCIIpan).
- Extend to canine DLA / feline FLA. Human HLA-II only.

## References

- NetMHCIIpan-4.3: https://services.healthtech.dtu.dk/services/NetMHCIIpan-4.3/
- HLAIIPred 2025 (open-source): https://www.nature.com/articles/s42003-025-08500-2
- MixMHC2pred / Racle 2023 corpus: https://www.sciencedirect.com/science/article/pii/S1074761323001292
- Reactome 2024 MHC-II benchmark: https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2024.1293706/full
