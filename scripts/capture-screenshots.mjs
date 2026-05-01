#!/usr/bin/env node
// Captures the four README + GitHub Pages screenshots against a mock API so
// the completed alignment / variant-calling states render with realistic
// metrics. Start from repo root: `node scripts/capture-screenshots.mjs`.

import { spawn } from "node:child_process";
import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SCREENSHOT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
const STUB_PORT = 7777;
const NEXT_PORT = 3001;
const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
const NEXT_URL = `http://127.0.0.1:${NEXT_PORT}`;

// ---------- fixtures ----------

const NOW = "2026-04-16T10:24:00Z";
const EARLIER = "2026-04-16T07:58:02Z";
const CREATED = "2026-04-12T09:14:00Z";

function laneSummary(sampleLane, status = "ready") {
  return {
    active_batch_id: `batch-${sampleLane}`,
    sample_lane: sampleLane,
    status,
    ready_for_alignment: status === "ready",
    source_file_count: status === "empty" ? 0 : 2,
    canonical_file_count: status === "ready" ? 2 : 0,
    missing_pairs: [],
    blocking_issues: [],
    read_layout: "paired",
    updated_at: NOW,
    progress: null,
  };
}

function readyIngestion() {
  return {
    status: "ready",
    ready_for_alignment: true,
    lanes: { tumor: laneSummary("tumor"), normal: laneSummary("normal") },
  };
}

function emptyIngestion() {
  return {
    status: "empty",
    ready_for_alignment: false,
    lanes: {
      tumor: laneSummary("tumor", "empty"),
      normal: laneSummary("normal", "empty"),
    },
  };
}

function sourceFile(sampleLane, pair, filename) {
  return {
    id: `${sampleLane}-${pair}`,
    batch_id: `batch-${sampleLane}`,
    source_file_id: null,
    sample_lane: sampleLane,
    filename,
    format: "fastq",
    file_role: "source",
    status: "ready",
    size_bytes: 5_832_191_004,
    uploaded_at: CREATED,
    read_pair: pair,
    source_path: `/Users/danny/sequencing/rosie/${filename}`,
    managed_path: null,
    error: null,
  };
}

const ROSIE = {
  id: "ws-rosie",
  display_name: "Rosie baseline",
  species: "dog",
  analysis_profile: {
    reference_preset: "canfam4",
    reference_override: null,
  },
  active_stage: "variant-calling",
  created_at: CREATED,
  updated_at: NOW,
  ingestion: readyIngestion(),
  files: [
    sourceFile("tumor", "R1", "rosie_tumor_R1.fastq.gz"),
    sourceFile("tumor", "R2", "rosie_tumor_R2.fastq.gz"),
    sourceFile("normal", "R1", "rosie_normal_R1.fastq.gz"),
    sourceFile("normal", "R2", "rosie_normal_R2.fastq.gz"),
  ],
};

const HCC = {
  id: "ws-hcc1395",
  display_name: "HCC1395 benchmark",
  species: "human",
  analysis_profile: {
    reference_preset: "grch38",
    reference_override: null,
  },
  active_stage: "ingestion",
  created_at: "2026-04-15T16:02:00Z",
  updated_at: "2026-04-15T16:45:22Z",
  ingestion: readyIngestion(),
  files: [
    sourceFile("tumor", "R1", "HCC1395_tumor_R1.fastq.gz"),
    sourceFile("tumor", "R2", "HCC1395_tumor_R2.fastq.gz"),
    sourceFile("normal", "R1", "HCC1395BL_normal_R1.fastq.gz"),
    sourceFile("normal", "R2", "HCC1395BL_normal_R2.fastq.gz"),
  ],
};

const FELIX = {
  id: "ws-felix",
  display_name: "Felix intake",
  species: "cat",
  analysis_profile: {
    reference_preset: "felcat9",
    reference_override: null,
  },
  active_stage: "ingestion",
  created_at: "2026-04-16T09:48:00Z",
  updated_at: "2026-04-16T09:48:00Z",
  ingestion: emptyIngestion(),
  files: [],
};

const WORKSPACES = [ROSIE, HCC, FELIX];

function workspaceFor(id) {
  return WORKSPACES.find((workspace) => workspace.id === id) ?? null;
}

function alignmentLaneMetrics(sampleLane, stats) {
  return {
    sample_lane: sampleLane,
    total_reads: stats.totalReads,
    mapped_reads: Math.round(stats.totalReads * (stats.mappedPercent / 100)),
    mapped_percent: stats.mappedPercent,
    properly_paired_percent: stats.properlyPairedPercent,
    duplicate_percent: stats.duplicatePercent,
    mean_insert_size: stats.meanInsertSize,
  };
}

function alignmentArtifact(id, kind, sampleLane, filename, sizeBytes) {
  return {
    id,
    artifact_kind: kind,
    sample_lane: sampleLane,
    filename,
    size_bytes: sizeBytes,
    download_path: `/api/workspaces/ws-rosie/alignment/artifacts/${id}/download`,
    local_path: `/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/alignment/run-01/${filename}`,
  };
}

const ROSIE_ALIGNMENT_METRICS = {
  tumor: {
    totalReads: 1_984_723_110,
    mappedPercent: 98.91,
    properlyPairedPercent: 96.32,
    duplicatePercent: 19.4,
    meanInsertSize: 312,
  },
  normal: {
    totalReads: 754_103_228,
    mappedPercent: 98.86,
    properlyPairedPercent: 95.81,
    duplicatePercent: 17.8,
    meanInsertSize: 308,
  },
};

function alignmentSummaryCompleted(workspace) {
  const metrics = ROSIE_ALIGNMENT_METRICS;
  const artifacts = [
    alignmentArtifact("tumor-bam", "bam", "tumor", "rosie_tumor.aligned.bam", 48_200_000_000),
    alignmentArtifact("tumor-bai", "bai", "tumor", "rosie_tumor.aligned.bam.bai", 8_400_000),
    alignmentArtifact("tumor-flagstat", "flagstat", "tumor", "rosie_tumor.flagstat.txt", 520),
    alignmentArtifact("tumor-idxstats", "idxstats", "tumor", "rosie_tumor.idxstats.txt", 1_240),
    alignmentArtifact("tumor-stats", "stats", "tumor", "rosie_tumor.stats.txt", 64_000),
    alignmentArtifact("normal-bam", "bam", "normal", "rosie_normal.aligned.bam", 19_800_000_000),
    alignmentArtifact("normal-bai", "bai", "normal", "rosie_normal.aligned.bam.bai", 7_900_000),
    alignmentArtifact("normal-flagstat", "flagstat", "normal", "rosie_normal.flagstat.txt", 520),
    alignmentArtifact("normal-idxstats", "idxstats", "normal", "rosie_normal.idxstats.txt", 1_240),
    alignmentArtifact("normal-stats", "stats", "normal", "rosie_normal.stats.txt", 63_000),
  ];

  return {
    workspace_id: workspace.id,
    status: "completed",
    blocking_reason: null,
    analysis_profile: workspace.analysis_profile,
    qc_verdict: "pass",
    ready_for_variant_calling: true,
    latest_run: {
      id: "run-01",
      status: "completed",
      progress: 1,
      reference_preset: workspace.analysis_profile.reference_preset,
      reference_override: null,
      reference_label: "CanFam4 (UU_Cfam_GSD_1.0)",
      runtime_phase: "finalizing",
      qc_verdict: "pass",
      created_at: EARLIER,
      updated_at: NOW,
      started_at: EARLIER,
      completed_at: NOW,
      blocking_reason: null,
      error: null,
      command_log: [
        "samtools faidx CanFam4.fa",
        "strobealign --create-index -r 150 CanFam4.fa",
        "strobealign -t 24 -U CanFam4.fa rosie_tumor_R1.fastq.gz rosie_tumor_R2.fastq.gz | samtools sort -@ 8 -m 2G -o rosie_tumor.aligned.bam -",
        "samtools index rosie_tumor.aligned.bam",
        "samtools flagstat rosie_tumor.aligned.bam > rosie_tumor.flagstat.txt",
        "samtools idxstats rosie_tumor.aligned.bam > rosie_tumor.idxstats.txt",
        "samtools stats rosie_tumor.aligned.bam > rosie_tumor.stats.txt",
      ],
      recent_log_tail: null,
      last_activity_at: NOW,
      eta_seconds: null,
      progress_components: {
        reference_prep: 1,
        aligning: 1,
        finalizing: 1,
        stats: 1,
      },
      expected_total_per_lane: { tumor: 24, normal: 12 },
      lane_metrics: {
        tumor: alignmentLaneMetrics("tumor", metrics.tumor),
        normal: alignmentLaneMetrics("normal", metrics.normal),
      },
      chunk_progress: {
        tumor: { phase: "merging", total_chunks: 24, completed_chunks: 24, active_chunks: 0 },
        normal: { phase: "merging", total_chunks: 12, completed_chunks: 12, active_chunks: 0 },
      },
      artifacts,
    },
    lane_metrics: {
      tumor: alignmentLaneMetrics("tumor", metrics.tumor),
      normal: alignmentLaneMetrics("normal", metrics.normal),
    },
    artifacts,
  };
}

function alignmentSummaryReady(workspace) {
  return {
    workspace_id: workspace.id,
    status: "ready",
    blocking_reason: null,
    analysis_profile: workspace.analysis_profile,
    qc_verdict: null,
    ready_for_variant_calling: false,
    latest_run: null,
    lane_metrics: { tumor: null, normal: null },
    artifacts: [],
  };
}

function alignmentSummaryBlocked(workspace) {
  return {
    workspace_id: workspace.id,
    status: "blocked",
    blocking_reason:
      "Add both the tumor and healthy sample files before alignment can start.",
    analysis_profile: workspace.analysis_profile,
    qc_verdict: null,
    ready_for_variant_calling: false,
    latest_run: null,
    lane_metrics: { tumor: null, normal: null },
    artifacts: [],
  };
}

function alignmentSummaryFor(workspace) {
  if (workspace.id === ROSIE.id) return alignmentSummaryCompleted(workspace);
  if (workspace.id === HCC.id) return alignmentSummaryReady(workspace);
  return alignmentSummaryBlocked(workspace);
}

// ---- variant calling metrics for Rosie ----

const DOG_CHROMS = [
  ["chr1", 122_678_785],
  ["chr2", 85_426_708],
  ["chr3", 91_889_043],
  ["chr4", 88_276_631],
  ["chr5", 88_915_250],
  ["chr6", 77_573_801],
  ["chr7", 80_974_532],
  ["chr8", 74_330_416],
  ["chr9", 61_074_082],
  ["chr10", 69_331_447],
  ["chr11", 74_389_097],
  ["chr12", 72_498_081],
  ["chr13", 63_241_923],
  ["chr14", 60_966_679],
  ["chr15", 64_190_966],
  ["chr16", 59_632_846],
  ["chr17", 64_289_059],
  ["chr18", 55_844_845],
  ["chr19", 53_741_614],
  ["chr20", 58_134_056],
  ["chr21", 50_858_623],
  ["chr22", 61_439_934],
  ["chr23", 52_294_480],
  ["chr24", 47_698_779],
  ["chr25", 51_628_933],
  ["chr26", 38_964_690],
  ["chr27", 45_876_710],
  ["chr28", 41_182_112],
  ["chr29", 41_845_238],
  ["chr30", 40_214_260],
  ["chr31", 39_895_921],
  ["chr32", 38_810_281],
  ["chr33", 31_377_067],
  ["chr34", 42_125_770],
  ["chr35", 26_816_948],
  ["chr36", 30_888_429],
  ["chr37", 30_937_877],
  ["chr38", 23_753_152],
  ["chrX", 123_869_142],
];

// Deterministic, uneven mutation density per chromosome.
function chromosomeMetrics() {
  const weights = [
    8, 5, 6, 4, 5, 3, 4, 3, 2, 3, 3, 2, 3, 2, 4, 2, 3, 2, 2, 2, 2, 3, 2, 2, 1, 1,
    2, 1, 2, 1, 1, 1, 0, 1, 0, 1, 0, 0, 4,
  ];
  return DOG_CHROMS.map(([name, length], index) => {
    const total = weights[index] * 34 + (index % 5) * 3;
    const passCount = Math.round(total * 0.86);
    const snvCount = Math.round(total * 0.82);
    const indelCount = total - snvCount;
    return {
      chromosome: name,
      length,
      total,
      pass_count: passCount,
      snv_count: snvCount,
      indel_count: indelCount,
    };
  });
}

const CHROMS = chromosomeMetrics();
const TOTAL_VARIANTS = CHROMS.reduce((sum, entry) => sum + entry.total, 0);
const PASS_COUNT = CHROMS.reduce((sum, entry) => sum + entry.pass_count, 0);
const SNV_COUNT = CHROMS.reduce((sum, entry) => sum + entry.snv_count, 0);
const INDEL_COUNT = CHROMS.reduce((sum, entry) => sum + entry.indel_count, 0);

const VAF_HISTOGRAM = [
  0, 0, 42, 128, 287, 534, 812, 1043, 1284, 1421, 1360, 1208, 964, 708, 482,
  298, 186, 114, 68, 24,
].map((count, index) => ({
  bin_start: index * 0.05,
  bin_end: (index + 1) * 0.05,
  count,
}));

const FILTER_BREAKDOWN = [
  { name: "PASS", count: PASS_COUNT, is_pass: true },
  { name: "weak_evidence", count: 621, is_pass: false },
  { name: "germline", count: 543, is_pass: false },
  { name: "panel_of_normals", count: 264, is_pass: false },
  { name: "clustered_events", count: 218, is_pass: false },
  { name: "strand_bias", count: 172, is_pass: false },
  { name: "normal_artifact", count: 148, is_pass: false },
  { name: "base_qual", count: 132, is_pass: false },
  { name: "haplotype", count: 96, is_pass: false },
  { name: "map_qual", count: 88, is_pass: false },
  { name: "low_allele_frac", count: 74, is_pass: false },
  { name: "fragment", count: 52, is_pass: false },
  { name: "duplicate", count: 34, is_pass: false },
  { name: "strand_bias;weak_evidence", count: 48, is_pass: false },
];

const TOP_VARIANTS = [
  ["chr1", 58_214_991, "C", "T", "snv", "PASS", true, 0.487, 94, 86],
  ["chr2", 31_048_662, "G", "A", "snv", "PASS", true, 0.462, 88, 81],
  ["chr5", 72_930_418, "A", "G", "snv", "PASS", true, 0.441, 76, 72],
  ["chr1", 104_528_119, "T", "C", "snv", "PASS", true, 0.418, 102, 94],
  ["chr7", 18_332_401, "CAG", "C", "deletion", "PASS", true, 0.401, 71, 68],
  ["chr4", 60_914_733, "G", "T", "snv", "PASS", true, 0.389, 68, 64],
  ["chr3", 87_145_226, "A", "AG", "insertion", "PASS", true, 0.377, 64, 60],
  ["chr9", 44_982_103, "C", "T", "snv", "PASS", true, 0.362, 58, 54],
  ["chr12", 38_117_982, "G", "A", "snv", "PASS", true, 0.348, 54, 50],
  ["chr6", 27_448_019, "T", "G", "snv", "PASS", true, 0.332, 62, 58],
  ["chr11", 48_219_773, "C", "CGG", "insertion", "PASS", true, 0.318, 50, 48],
  ["chr8", 25_033_804, "G", "A", "snv", "PASS", true, 0.304, 48, 46],
  ["chr14", 9_988_241, "A", "G", "snv", "PASS", true, 0.289, 44, 42],
  ["chr16", 22_544_187, "T", "C", "snv", "PASS", true, 0.276, 52, 48],
  ["chr20", 12_881_442, "G", "T", "snv", "PASS", true, 0.261, 38, 36],
  ["chr5", 29_002_884, "AAT", "A", "deletion", "PASS", true, 0.248, 42, 40],
  ["chr22", 33_187_601, "C", "T", "snv", "PASS", true, 0.236, 40, 38],
  ["chr18", 15_884_502, "A", "G", "snv", "PASS", true, 0.224, 34, 32],
  ["chrX", 77_129_903, "G", "A", "snv", "PASS", true, 0.211, 48, 46],
].map(([chromosome, position, ref, alt, variantType, filter, isPass, vaf, tD, nD]) => ({
  chromosome,
  position,
  ref,
  alt,
  variant_type: variantType,
  filter,
  is_pass: isPass,
  tumor_vaf: vaf,
  tumor_depth: tD,
  normal_depth: nD,
}));

function variantCallingSummaryCompleted(workspace) {
  const artifacts = [
    {
      id: "vcf",
      artifact_kind: "vcf",
      filename: "rosie.mutect2.filtered.vcf.gz",
      size_bytes: 148_320_000,
      download_path: "/api/workspaces/ws-rosie/variant-calling/artifacts/vcf/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/variant-calling/run-01/rosie.mutect2.filtered.vcf.gz",
    },
    {
      id: "tbi",
      artifact_kind: "tbi",
      filename: "rosie.mutect2.filtered.vcf.gz.tbi",
      size_bytes: 2_800_000,
      download_path: "/api/workspaces/ws-rosie/variant-calling/artifacts/tbi/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/variant-calling/run-01/rosie.mutect2.filtered.vcf.gz.tbi",
    },
    {
      id: "stats",
      artifact_kind: "stats",
      filename: "rosie.mutect2.stats",
      size_bytes: 412_000,
      download_path: "/api/workspaces/ws-rosie/variant-calling/artifacts/stats/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/variant-calling/run-01/rosie.mutect2.stats",
    },
  ];

  return {
    workspace_id: workspace.id,
    status: "completed",
    blocking_reason: null,
    ready_for_annotation: true,
    latest_run: {
      id: "vc-run-01",
      status: "completed",
      progress: 1,
      runtime_phase: "finalizing",
      created_at: NOW,
      updated_at: NOW,
      started_at: NOW,
      completed_at: NOW,
      blocking_reason: null,
      error: null,
      command_log: [
        "gatk Mutect2 -R CanFam4.fa -I rosie_tumor.aligned.bam -I rosie_normal.aligned.bam -normal rosie_normal -O rosie.mutect2.vcf.gz",
        "gatk FilterMutectCalls -V rosie.mutect2.vcf.gz -R CanFam4.fa -O rosie.mutect2.filtered.vcf.gz",
      ],
      metrics: {
        total_variants: TOTAL_VARIANTS,
        snv_count: SNV_COUNT,
        indel_count: INDEL_COUNT,
        insertion_count: Math.round(INDEL_COUNT * 0.44),
        deletion_count: Math.round(INDEL_COUNT * 0.48),
        mnv_count: Math.round(INDEL_COUNT * 0.08),
        pass_count: PASS_COUNT,
        pass_snv_count: Math.round(PASS_COUNT * 0.82),
        pass_indel_count: Math.round(PASS_COUNT * 0.18),
        ti_tv_ratio: 2.18,
        transitions: Math.round(SNV_COUNT * 0.69),
        transversions: Math.round(SNV_COUNT * 0.31),
        mean_vaf: 0.271,
        median_vaf: 0.248,
        tumor_mean_depth: 64.4,
        normal_mean_depth: 38.2,
        tumor_sample: "rosie_tumor",
        normal_sample: "rosie_normal",
        reference_label: "CanFam4 (UU_Cfam_GSD_1.0)",
        per_chromosome: CHROMS,
        filter_breakdown: FILTER_BREAKDOWN,
        vaf_histogram: VAF_HISTOGRAM,
        top_variants: TOP_VARIANTS,
      },
      artifacts,
    },
    artifacts,
  };
}

// ---- annotation metrics for Rosie ----

const ANNOTATION_CANCER_HITS = [
  { symbol: "TP53",   role: "tumor suppressor", variant_count: 3, highest_impact: "HIGH",     top_hgvsp: "ENSCAFP00805002691:p.Arg175His",  top_consequence: "missense_variant" },
  { symbol: "SETD2",  role: "tumor suppressor", variant_count: 2, highest_impact: "HIGH",     top_hgvsp: "ENSCAFP00805016138:p.Arg1625*",   top_consequence: "stop_gained" },
  { symbol: "FBXW7",  role: "tumor suppressor", variant_count: 1, highest_impact: "MODERATE", top_hgvsp: "ENSCAFP00805035248:p.Arg465Cys",  top_consequence: "missense_variant" },
  { symbol: "PIK3CA", role: "oncogene",         variant_count: 1, highest_impact: "MODERATE", top_hgvsp: "ENSCAFP00805042493:p.His1047Arg", top_consequence: "missense_variant" },
  { symbol: "BRCA2",  role: "DNA repair",       variant_count: 2, highest_impact: "MODERATE", top_hgvsp: "ENSCAFP00805048660:p.Glu2590Val", top_consequence: "missense_variant" },
  { symbol: "NOTCH1", role: "dual role",        variant_count: 1, highest_impact: "MODERATE", top_hgvsp: "ENSCAFP00805015488:p.Pro1614Leu", top_consequence: "missense_variant" },
  { symbol: "APC",    role: "tumor suppressor", variant_count: 1, highest_impact: "LOW",      top_hgvsp: "ENSCAFP00805020012:p.Ser1400=",   top_consequence: "synonymous_variant" },
  { symbol: "MYC",    role: "oncogene",         variant_count: 1, highest_impact: "MODERATE", top_hgvsp: "ENSCAFP00805007441:p.Thr58Ala",   top_consequence: "missense_variant" },
];

const ANNOTATION_TOP_GENE_FOCUS = {
  symbol: "TP53",
  role: "tumor suppressor",
  transcript_id: "ENSCAFT00805002691",
  protein_length: 394,
  variants: [
    { chromosome: "5", position: 32_771_278, protein_position: 175, hgvsp: "ENSCAFP00805002691:p.Arg175His", hgvsc: null, consequence: "missense_variant",  impact: "HIGH",     tumor_vaf: 0.48 },
    { chromosome: "5", position: 32_771_092, protein_position: 248, hgvsp: "ENSCAFP00805002691:p.Arg248Gln", hgvsc: null, consequence: "missense_variant",  impact: "MODERATE", tumor_vaf: 0.39 },
    { chromosome: "5", position: 32_770_455, protein_position: 282, hgvsp: "ENSCAFP00805002691:p.Arg282Trp", hgvsc: null, consequence: "missense_variant",  impact: "HIGH",     tumor_vaf: 0.33 },
  ],
};

const ANNOTATION_TOP_VARIANTS = [
  { chromosome: "5",  position: 32_771_278, ref: "C", alt: "T", gene_symbol: "TP53",   transcript_id: "ENSCAFT00805002691", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "HIGH",     hgvsc: "c.524G>A", hgvsp: "ENSCAFP00805002691:p.Arg175His", protein_position: 175, tumor_vaf: 0.482, in_cancer_gene: true },
  { chromosome: "20", position: 42_161_903, ref: "C", alt: "T", gene_symbol: "SETD2",  transcript_id: "ENSCAFT00805016138", consequence: "stop_gained",        consequence_label: "Protein cut short",  impact: "HIGH",     hgvsc: "c.4873C>T", hgvsp: "ENSCAFP00805016138:p.Arg1625*",   protein_position: 1625, tumor_vaf: 0.411, in_cancer_gene: true },
  { chromosome: "5",  position: 32_770_455, ref: "G", alt: "A", gene_symbol: "TP53",   transcript_id: "ENSCAFT00805002691", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "HIGH",     hgvsc: "c.844C>T", hgvsp: "ENSCAFP00805002691:p.Arg282Trp", protein_position: 282, tumor_vaf: 0.331, in_cancer_gene: true },
  { chromosome: "34", position: 12_832_861, ref: "A", alt: "G", gene_symbol: "PIK3CA", transcript_id: "ENSCAFT00805042493", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.3140A>G", hgvsp: "ENSCAFP00805042493:p.His1047Arg", protein_position: 1047, tumor_vaf: 0.374, in_cancer_gene: true },
  { chromosome: "15", position: 50_552_597, ref: "C", alt: "T", gene_symbol: "FBXW7",  transcript_id: "ENSCAFT00805035248", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.1393C>T", hgvsp: "ENSCAFP00805035248:p.Arg465Cys", protein_position: 465, tumor_vaf: 0.258, in_cancer_gene: true },
  { chromosome: "5",  position: 32_771_092, ref: "C", alt: "T", gene_symbol: "TP53",   transcript_id: "ENSCAFT00805002691", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.743G>A", hgvsp: "ENSCAFP00805002691:p.Arg248Gln", protein_position: 248, tumor_vaf: 0.389, in_cancer_gene: true },
  { chromosome: "25", position: 7_810_930,  ref: "T", alt: "A", gene_symbol: "BRCA2",  transcript_id: "ENSCAFT00805048660", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.7769A>T", hgvsp: "ENSCAFP00805048660:p.Glu2590Val", protein_position: 2590, tumor_vaf: 0.183, in_cancer_gene: true },
  { chromosome: "25", position: 7_812_448,  ref: "G", alt: "A", gene_symbol: "BRCA2",  transcript_id: "ENSCAFT00805048660", consequence: "splice_region_variant", consequence_label: "Near a splice site", impact: "LOW",      hgvsc: "c.6869-3G>A", hgvsp: null, protein_position: null, tumor_vaf: 0.162, in_cancer_gene: true },
  { chromosome: "9",  position: 62_104_502, ref: "C", alt: "T", gene_symbol: "NOTCH1", transcript_id: "ENSCAFT00805015488", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.4841C>T", hgvsp: "ENSCAFP00805015488:p.Pro1614Leu", protein_position: 1614, tumor_vaf: 0.221, in_cancer_gene: true },
  { chromosome: "18", position: 22_330_018, ref: "A", alt: "G", gene_symbol: "MYC",    transcript_id: "ENSCAFT00805007441", consequence: "missense_variant",  consequence_label: "Amino-acid change",  impact: "MODERATE", hgvsc: "c.172A>G", hgvsp: "ENSCAFP00805007441:p.Thr58Ala", protein_position: 58, tumor_vaf: 0.306, in_cancer_gene: true },
  { chromosome: "7",  position: 31_884_229, ref: "G", alt: "T", gene_symbol: "APC",    transcript_id: "ENSCAFT00805020012", consequence: "synonymous_variant", consequence_label: "Silent change",     impact: "LOW",      hgvsc: "c.4200C>A", hgvsp: "ENSCAFP00805020012:p.Ser1400=", protein_position: 1400, tumor_vaf: 0.128, in_cancer_gene: true },
];

const ANNOTATION_BY_CONSEQUENCE = [
  { term: "missense_variant",       label: "Amino-acid change",   count: 68 },
  { term: "synonymous_variant",     label: "Silent change",        count: 42 },
  { term: "intron_variant",         label: "Inside an intron",     count: 31 },
  { term: "3_prime_UTR_variant",    label: "3' UTR change",        count: 14 },
  { term: "5_prime_UTR_variant",    label: "5' UTR change",        count: 9 },
  { term: "splice_region_variant",  label: "Near a splice site",   count: 6 },
  { term: "stop_gained",            label: "Protein cut short",    count: 3 },
  { term: "frameshift_variant",     label: "Reading-frame shift",  count: 2 },
  { term: "inframe_deletion",       label: "In-frame deletion",    count: 1 },
  { term: "upstream_gene_variant",  label: "Near a gene (upstream)", count: 12 },
  { term: "intergenic_variant",     label: "Between genes",        count: 21 },
];

function annotationSummaryCompleted(workspace) {
  const metrics = {
    total_variants: 219,
    annotated_variants: 209,
    by_impact: { HIGH: 6, MODERATE: 74, LOW: 47, MODIFIER: 82 },
    by_consequence: ANNOTATION_BY_CONSEQUENCE,
    cancer_gene_hits: ANNOTATION_CANCER_HITS,
    cancer_gene_variant_count: ANNOTATION_CANCER_HITS.reduce((n, h) => n + h.variant_count, 0),
    top_gene_focus: ANNOTATION_TOP_GENE_FOCUS,
    top_variants: ANNOTATION_TOP_VARIANTS,
    reference_label: "CanFam4 (UU_Cfam_GSD_1.0)",
    species_label: "Dog (UU_Cfam_GSD_1.0)",
    vep_release: "111",
  };
  const artifacts = [
    {
      id: "ann-vcf",
      artifact_kind: "annotated_vcf",
      filename: "rosie.annotated.vcf.gz",
      size_bytes: 162_480_000,
      download_path: "/api/workspaces/ws-rosie/annotation/artifacts/ann-vcf/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/annotation/run-01/rosie.annotated.vcf.gz",
    },
    {
      id: "ann-tbi",
      artifact_kind: "annotated_vcf_index",
      filename: "rosie.annotated.vcf.gz.tbi",
      size_bytes: 2_980_000,
      download_path: "/api/workspaces/ws-rosie/annotation/artifacts/ann-tbi/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/annotation/run-01/rosie.annotated.vcf.gz.tbi",
    },
    {
      id: "ann-html",
      artifact_kind: "vep_summary",
      filename: "vep_summary.html",
      size_bytes: 84_220,
      download_path: "/api/workspaces/ws-rosie/annotation/artifacts/ann-html/download",
      local_path: "/Users/danny/mutavax/data/app-data/workspaces/ws-rosie/annotation/run-01/vep_summary.html",
    },
  ];
  return {
    workspace_id: workspace.id,
    status: "completed",
    blocking_reason: null,
    ready_for_neoantigen: true,
    latest_run: {
      id: "ann-run-01",
      status: "completed",
      progress: 1,
      runtime_phase: null,
      created_at: NOW,
      updated_at: NOW,
      started_at: NOW,
      completed_at: NOW,
      blocking_reason: null,
      error: null,
      command_log: [
        "vep_install --AUTO cf --SPECIES canis_lupus_familiarisgsd --ASSEMBLY UU_Cfam_GSD_1.0 --CACHEDIR /vep-cache --CACHE_VERSION 111",
        "vep --input_file rosie.mutect2.filtered.vcf.gz --output_file rosie.annotated.vcf.gz --format vcf --vcf --compress_output bgzip --offline --cache --dir_cache /vep-cache --species canis_lupus_familiarisgsd --assembly UU_Cfam_GSD_1.0 --cache_version 111 --fasta CanFam4.fa --symbol --terms SO --canonical --biotype --hgvs --numbers --protein --pick_allele --dir_plugins /opt/vep-plugins --plugin Frameshift --plugin Wildtype --plugin Downstream --fork 4",
        "tabix -p vcf rosie.annotated.vcf.gz",
      ],
      metrics,
      artifacts,
      cache_pending: false,
      cache_species_label: "Dog (UU_Cfam_GSD_1.0)",
      cache_expected_megabytes: null,
    },
    artifacts,
  };
}

function annotationSummaryBlocked(workspace, reason) {
  return {
    workspace_id: workspace.id,
    status: "blocked",
    blocking_reason: reason,
    ready_for_neoantigen: false,
    latest_run: null,
    artifacts: [],
  };
}

function annotationSummaryFor(workspace) {
  if (workspace.id === ROSIE.id) return annotationSummaryCompleted(workspace);
  return annotationSummaryBlocked(
    workspace,
    "Finish variant calling before annotation."
  );
}

// ---- neoantigen metrics for Rosie ----

const DLA_ALLELES = [
  { allele: "DLA-88*034:01",   class: "I",  typing: "inferred", frequency: null, source: "IPD-MHC default" },
  { allele: "DLA-88*508:01",   class: "I",  typing: "inferred", frequency: null, source: "IPD-MHC default" },
  { allele: "DLA-12*01:01",    class: "I",  typing: "inferred", frequency: null, source: "IPD-MHC default" },
  { allele: "DLA-64*01:01",    class: "I",  typing: "inferred", frequency: null, source: "IPD-MHC default" },
  { allele: "DLA-DRB1*015:01", class: "II", typing: "inferred", frequency: null, source: "IPD-MHC default" },
  { allele: "DLA-DQB1*008:01", class: "II", typing: "inferred", frequency: null, source: "IPD-MHC default" },
];

const NEO_TOP = [
  { seq: "NIIQLLFMGH", gene: "KIT",    mut: "p.Asn816Ile", length: 10, class: "I",  allele: "DLA-88*034:01",  ic50: 14,  wt_ic50: 1240, agretopicity: 88.6,  vaf: 0.47, tpm: 142.3, cancer_gene: true, strong: true },
  { seq: "HFSQAIRRL", gene: "TP53",   mut: "p.Arg175His", length: 9,  class: "I",  allele: "DLA-88*034:01",  ic50: 39,  wt_ic50: 2100, agretopicity: 53.8,  vaf: 0.41, tpm: 98.7,  cancer_gene: true, strong: true },
  { seq: "LPNSVLGAK", gene: "BRAF",   mut: "p.Val600Glu", length: 9,  class: "I",  allele: "DLA-12*01:01",   ic50: 12,  wt_ic50: 1150, agretopicity: 96.1,  vaf: 0.38, tpm: 52.0,  cancer_gene: true, strong: true },
  { seq: "APLDEYFRV", gene: "NRAS",   mut: "p.Gln61Arg",  length: 9,  class: "I",  allele: "DLA-12*01:01",   ic50: 18,  wt_ic50: 756,  agretopicity: 42.0,  vaf: 0.29, tpm: 71.4,  cancer_gene: true, strong: true },
  { seq: "KFEDCLPNY", gene: "MYC",    mut: "p.Thr58Ala",  length: 9,  class: "I",  allele: "DLA-88*034:01",  ic50: 19,  wt_ic50: 840,  agretopicity: 44.2,  vaf: 0.34, tpm: 118.5, cancer_gene: true, strong: true },
  { seq: "LNTIHRASV", gene: "TP53",   mut: "p.Arg248Gln", length: 9,  class: "I",  allele: "DLA-88*508:01",  ic50: 21,  wt_ic50: 2800, agretopicity: 133.3, vaf: 0.22, tpm: 98.7,  cancer_gene: true, strong: true },
  { seq: "IYQADRFTL", gene: "PTEN",   mut: "p.Arg130Gln", length: 9,  class: "I",  allele: "DLA-12*01:01",   ic50: 36,  wt_ic50: 1400, agretopicity: 61.5,  vaf: 0.26, tpm: 43.8,  cancer_gene: true, strong: true },
  { seq: "RSLNELWKV", gene: "NOTCH1", mut: "p.Leu1574Pro", length: 9, class: "I",  allele: "DLA-64*01:01",   ic50: 42,  wt_ic50: 1300, agretopicity: 30.9,  vaf: 0.37, tpm: 61.2,  cancer_gene: true, strong: true },
  { seq: "AKVLDERTLHCTAM", gene: "TP53", mut: "p.Arg175His", length: 14, class: "II", allele: "DLA-DRB1*015:01", ic50: 64, wt_ic50: 2400, agretopicity: 15.3, vaf: 0.41, tpm: 98.7, cancer_gene: true, strong: false },
  { seq: "FNIIQLLFMGHLKE", gene: "KIT",  mut: "p.Asn816Ile", length: 14, class: "II", allele: "DLA-DQB1*008:01", ic50: 72, wt_ic50: 2800, agretopicity: 22.2, vaf: 0.47, tpm: 142.3, cancer_gene: true, strong: false },
];

const NEO_HEATMAP_ALLELES = DLA_ALLELES.map((a) => a.allele);

// Per-peptide IC50 row across all 6 alleles (strong on their home allele, weaker
// elsewhere). Log-scale heatmap — the home-allele binder shows up as the dark
// cell in each row.
function heatmapRow(peptide, homeAllele, homeIc50, otherSpread) {
  return {
    seq: peptide.seq,
    gene: peptide.gene,
    mut: peptide.mut,
    length: peptide.length,
    class: peptide.class,
    vaf: peptide.vaf,
    mut_pos: 5,
    ic50: NEO_HEATMAP_ALLELES.map((allele) =>
      allele === homeAllele ? homeIc50 : otherSpread[allele] ?? 9500
    ),
  };
}

const NEO_HEATMAP_ROWS = NEO_TOP.slice(0, 10).map((p) =>
  heatmapRow(p, p.allele, p.ic50, {
    [NEO_HEATMAP_ALLELES[0]]: 4200,
    [NEO_HEATMAP_ALLELES[1]]: 3800,
    [NEO_HEATMAP_ALLELES[2]]: 5100,
    [NEO_HEATMAP_ALLELES[3]]: 6300,
    [NEO_HEATMAP_ALLELES[4]]: 7200,
    [NEO_HEATMAP_ALLELES[5]]: 8100,
  })
);

function neoantigenSummaryCompleted(workspace) {
  const metrics = {
    pvacseq_version: "5.4.0",
    netmhcpan_version: "4.1",
    netmhciipan_version: "4.3",
    species_label: "Dog (UU_Cfam_GSD_1.0)",
    assembly: "UU_Cfam_GSD_1.0",
    alleles: DLA_ALLELES,
    annotated_variants: 209,
    protein_changing_variants: 74,
    peptides_generated: 1482,
    visible_candidates: 43,
    class_i_count: 31,
    class_ii_count: 12,
    buckets: [
      { key: "strong",   label: "Strong",   threshold: "< 50 nM",   plain: "High-confidence binders", count: 17 },
      { key: "moderate", label: "Moderate", threshold: "50–500 nM", plain: "Likely binders",           count: 26 },
      { key: "weak",     label: "Weak",     threshold: "500–5000 nM", plain: "Low-affinity",           count: 84 },
      { key: "none",     label: "None",     threshold: "> 5000 nM", plain: "Filtered out",              count: 1355 },
    ],
    heatmap: { alleles: NEO_HEATMAP_ALLELES, peptides: NEO_HEATMAP_ROWS },
    funnel: [
      { label: "Annotated variants",        count: 209,  hint: "from VEP" },
      { label: "Protein-changing variants", count: 74,   hint: "missense + frameshift + stop-gained" },
      { label: "Peptides generated",        count: 1482, hint: "8–11 aa class I · 12–18 aa class II" },
      { label: "Visible candidates",        count: 43,   hint: "IC50 < 500 nM vs. healthy wild-type" },
    ],
    top: NEO_TOP,
  };
  return {
    workspace_id: workspace.id,
    status: "completed",
    blocking_reason: null,
    ready_for_epitope_selection: true,
    alleles: DLA_ALLELES,
    latest_run: {
      id: "neo-run-01",
      status: "completed",
      progress: 1,
      runtime_phase: null,
      created_at: NOW,
      updated_at: NOW,
      started_at: EARLIER,
      completed_at: NOW,
      blocking_reason: null,
      error: null,
      command_log: [
        "pvacseq run rosie.annotated.vcf.gz sample 'DLA-88*034:01,DLA-88*508:01,DLA-12*01:01,DLA-64*01:01' NetMHCpan 8,9,10,11 class_i/",
        "pvacseq run rosie.annotated.vcf.gz sample 'DLA-DRB1*015:01,DLA-DQB1*008:01' NetMHCIIpan 12,13,14,15,16,17,18 class_ii/",
      ],
      metrics,
      artifacts: [],
    },
    artifacts: [],
  };
}

function neoantigenSummaryBlocked(workspace, reason) {
  return {
    workspace_id: workspace.id,
    status: "blocked",
    blocking_reason: reason,
    ready_for_epitope_selection: false,
    alleles: [],
    latest_run: null,
    artifacts: [],
  };
}

function neoantigenSummaryFor(workspace) {
  if (workspace.id === ROSIE.id) return neoantigenSummaryCompleted(workspace);
  return neoantigenSummaryBlocked(workspace, "Finish annotation before predicting neoantigens.");
}

// ---- epitope selection fixture ----

const EPITOPE_ALLELES = [
  { id: "DLA-88*034:01",   class: "I",  color: "#0f766e" },
  { id: "DLA-88*508:01",   class: "I",  color: "#0ea5e9" },
  { id: "DLA-12*01:01",    class: "I",  color: "#6366f1" },
  { id: "DLA-64*01:01",    class: "I",  color: "#8b5cf6" },
  { id: "DLA-DRB1*015:01", class: "II", color: "#d97706" },
  { id: "DLA-DQB1*008:01", class: "II", color: "#dc2626" },
];

// Same 43-peptide deck the backend fixture ships (abbreviated construction).
const EPITOPE_DECK = (() => {
  const rows = [
    ["ep01","NIIQLLFMGH","KIT","p.Asn816Ile",10,"I","DLA-88*034:01",14,88.6,0.47,142.3,true,"canonical MCT driver","strong",[]],
    ["ep02","LNTIHRASV","TP53","p.Arg248Gln",9,"I","DLA-88*508:01",21,133.3,0.22,98.7,true,"hotspot tumor suppressor","strong",[]],
    ["ep03","FMGEHIMAKY","KIT","p.Val559Asp",10,"I","DLA-88*034:01",22,67.3,0.11,142.3,true,"subclonal KIT","strong",["subclonal"]],
    ["ep04","QEVDPVGHM","ATM","p.Gln1162*",9,"I","DLA-88*034:01",29,7.6,0.19,24.1,true,"stop-gained","strong",["low-agretopicity"]],
    ["ep05","HFSQAIRRL","TP53","p.Arg175His",9,"I","DLA-88*034:01",39,53.8,0.41,98.7,true,"hotspot tumor suppressor","strong",[]],
    ["ep06","YEVKEHCKM","PIK3CA","p.Glu545Lys",9,"I","DLA-88*034:01",46,28.2,0.32,58.1,true,"activating hotspot","strong",[]],
    ["ep07","APLDEYFRV","NRAS","p.Gln61Arg",9,"I","DLA-12*01:01",18,42.0,0.29,71.4,true,"activating hotspot","strong",[]],
    ["ep08","IYQADRFTL","PTEN","p.Arg130Gln",9,"I","DLA-12*01:01",36,61.5,0.26,43.8,true,"tumor suppressor","strong",[]],
    ["ep09","RSLNELWKV","NOTCH1","p.Leu1574Pro",9,"I","DLA-64*01:01",42,30.9,0.37,61.2,true,"signaling","strong",[]],
    ["ep10","TFAEKLGAF","CDKN2A","p.Asp84Asn",9,"I","DLA-64*01:01",33,55.4,0.25,18.2,true,"cell-cycle inhibitor","strong",[]],
    ["ep11","VLKDEHRAF","ARID1A","p.Ser2264fs",9,"I","DLA-88*034:01",27,112.7,0.18,29.6,true,"frameshift neoepitope","strong",[]],
    ["ep12","GRDCFCRLY","FBXW7","p.Arg465Cys",9,"I","DLA-64*01:01",44,18.3,0.24,22.7,true,"E3 ligase","strong",[]],
    ["ep13","SMAQDIQVL","SETD2","p.Pro1962Leu",9,"I","DLA-88*508:01",48,7.0,0.28,41.8,true,"chromatin modifier","strong",["low-agretopicity"]],
    ["ep14","YTRLDKCVM","KMT2D","p.Arg4693His",9,"I","DLA-88*508:01",31,24.8,0.21,33.5,true,"chromatin modifier","strong",[]],
    ["ep15","LPNSVLGAK","BRAF","p.Val600Glu",9,"I","DLA-12*01:01",12,96.1,0.38,52.0,true,"activating hotspot","strong",[]],
    ["ep16","ETCDEYRAF","RB1","p.Gln702*",9,"I","DLA-64*01:01",38,15.8,0.20,16.3,true,"tumor suppressor","strong",[]],
    ["ep17","KFEDCLPNY","MYC","p.Thr58Ala",9,"I","DLA-88*034:01",19,44.2,0.34,118.5,true,"oncogene","strong",[]],
    ["ep18","RPLTIHDSF","KIT","p.Asp814Val",9,"I","DLA-88*508:01",180,9.2,0.16,142.3,true,"subclonal KIT","moderate",["subclonal"]],
    ["ep19","AHIFECNAQ","SF3B1","p.Lys700Glu",9,"I","DLA-12*01:01",220,31.5,0.31,73.8,true,"splicing factor","moderate",[]],
    ["ep20","EEYFRPLNQ","SMAD4","p.Arg361His",9,"I","DLA-88*034:01",280,62.4,0.23,22.0,true,"TGF-beta effector","moderate",[]],
    ["ep21","DTLGAFRPV","EZH2","p.Tyr646Asn",9,"I","DLA-64*01:01",340,58.1,0.19,47.5,true,"chromatin modifier","moderate",[]],
    ["ep22","GYIKLQSFA","CTNNB1","p.Ser45Phe",9,"I","DLA-88*508:01",410,74.6,0.27,89.1,true,"Wnt effector","moderate",[]],
    ["ep23","NIPKLRMAG","APC","p.Arg1450*",9,"I","DLA-12*01:01",450,12.7,0.17,26.4,true,"tumor suppressor","moderate",[]],
    ["ep24","VCEYADRPK","GNAS","p.Arg201Cys",9,"I","DLA-88*034:01",120,49.8,0.14,33.2,true,"G-protein","moderate",["subclonal"]],
    ["ep25","SLWAGEDIR","MSH2","p.Glu749Lys",9,"I","DLA-88*508:01",160,26.0,0.22,19.7,true,"MMR","moderate",[]],
    ["ep26","AIFQEDHKL","KRAS","p.Gly12Asp",9,"I","DLA-64*01:01",260,72.3,0.36,68.2,true,"activating hotspot","moderate",[]],
    ["ep27","DLPEYRAFC","IDH1","p.Arg132His",9,"I","DLA-88*034:01",310,91.5,0.25,55.8,true,"metabolic hotspot","moderate",[]],
    ["ep28","HRVPLSAFE","VHL","p.Tyr98His",9,"I","DLA-12*01:01",390,13.6,0.18,14.3,true,"tumor suppressor","moderate",["low-expression"]],
    ["ep29","QTCMRLFYV","COL1A1","p.Gly1012Ala",9,"I","DLA-88*034:01",140,4.2,0.09,8.1,false,null,"moderate",["low-agretopicity","passenger"]],
    ["ep30","EDFMAGQLR","TTN","p.Glu24782Lys",9,"I","DLA-88*508:01",260,2.1,0.12,12.5,false,null,"moderate",["passenger","low-agretopicity"]],
    ["ep31","AAAAGLPQR","MUC16","p.Ser5102Pro",9,"I","DLA-12*01:01",480,1.8,0.08,4.2,false,null,"moderate",["low-complexity","passenger"]],
    ["ep32","AKVLDERTLHCTAM","TP53","p.Arg175His",14,"II","DLA-DRB1*015:01",64,15.3,0.41,98.7,true,"hotspot + class-II coverage","strong",[]],
    ["ep33","FNIIQLLFMGHLKE","KIT","p.Asn816Ile",14,"II","DLA-DQB1*008:01",72,22.2,0.47,142.3,true,"T-help for KIT","strong",[]],
    ["ep34","SQEVDPVGHMVKEL","ATM","p.Gln1162*",14,"II","DLA-DQB1*008:01",96,4.8,0.19,24.1,true,"frameshift context","strong",["low-agretopicity"]],
    ["ep35","MLPETDYRVPLGAK","NRAS","p.Gln61Arg",14,"II","DLA-DRB1*015:01",120,18.9,0.29,71.4,true,"activating hotspot","moderate",[]],
    ["ep36","EYPLSAIRHCKMGV","NOTCH1","p.Leu1574Pro",14,"II","DLA-DQB1*008:01",160,11.4,0.37,61.2,true,"signaling","moderate",[]],
    ["ep37","HFPSRVLDEYAKMT","PIK3CA","p.Glu545Lys",14,"II","DLA-DRB1*015:01",210,14.7,0.32,58.1,true,"activating hotspot","moderate",[]],
    ["ep38","IYQADRFTLMAVPE","PTEN","p.Arg130Gln",14,"II","DLA-DQB1*008:01",280,9.1,0.26,43.8,true,"tumor suppressor","moderate",[]],
    ["ep39","CTPLGMEAFDRQVK","ARID1A","p.Ser2264fs",14,"II","DLA-DRB1*015:01",340,31.2,0.18,29.6,true,"frameshift neoepitope","moderate",[]],
    ["ep40","DLPEYRAFCMGTHN","IDH1","p.Arg132His",14,"II","DLA-DRB1*015:01",380,26.8,0.25,55.8,true,"metabolic hotspot","moderate",[]],
    ["ep41","LPNSVLGAKDFHRQ","BRAF","p.Val600Glu",14,"II","DLA-DQB1*008:01",110,48.5,0.38,52.0,true,"activating hotspot","moderate",[]],
    ["ep42","KFEDCLPNYIRHAM","MYC","p.Thr58Ala",14,"II","DLA-DQB1*008:01",140,22.0,0.34,118.5,true,"oncogene","moderate",[]],
    ["ep43","AAAGGGPPPPQQLM","MUC16","p.Ser5102Pro",14,"II","DLA-DRB1*015:01",460,2.0,0.08,4.2,false,null,"moderate",["low-complexity","passenger"]],
  ];
  return rows.map(([id, seq, gene, mutation, length, cls, allele_id, ic50_nm, agretopicity, vaf, tpm, cancer_gene, driver_context, tier, flags]) => ({
    id, seq, gene, mutation, length, class: cls, allele_id, ic50_nm, agretopicity, vaf, tpm, cancer_gene, driver_context, tier, flags,
  }));
})();

const EPITOPE_SAFETY = {
  ep30: { peptide_id: "ep30", self_hit: "TTN",              identity: 100, risk: "critical", note: "perfect 9-mer match in healthy TTN" },
  ep31: { peptide_id: "ep31", self_hit: "MUC16",            identity: 100, risk: "critical", note: "repeat region" },
  ep29: { peptide_id: "ep29", self_hit: "COL1A1",           identity: 89,  risk: "elevated", note: "7/9 identical · structural protein" },
  ep43: { peptide_id: "ep43", self_hit: "MUC16",            identity: 100, risk: "critical", note: "homopolymer tract" },
  ep18: { peptide_id: "ep18", self_hit: "KIT (wild-type)",  identity: 78,  risk: "mild",     note: "close to healthy KIT" },
};

const EPITOPE_DEFAULT_PICKS = ["ep01", "ep05", "ep07", "ep15", "ep17", "ep32", "ep33"];

function epitopeSummaryFor(workspace) {
  if (workspace.id !== ROSIE.id) {
    return {
      workspace_id: workspace.id,
      status: "blocked",
      blocking_reason: "Finish neoantigen prediction before curating the cassette.",
      candidates: [],
      safety: {},
      alleles: [],
      default_picks: [],
      selection: [],
      ready_for_construct_design: false,
    };
  }
  return {
    workspace_id: workspace.id,
    status: "scaffolded",
    blocking_reason: null,
    candidates: EPITOPE_DECK,
    safety: EPITOPE_SAFETY,
    alleles: EPITOPE_ALLELES,
    default_picks: EPITOPE_DEFAULT_PICKS,
    selection: EPITOPE_DEFAULT_PICKS,
    ready_for_construct_design: false,
  };
}

function variantCallingSummaryBlocked(workspace, reason) {
  return {
    workspace_id: workspace.id,
    status: "blocked",
    blocking_reason: reason,
    ready_for_annotation: false,
    latest_run: null,
    artifacts: [],
  };
}

function variantCallingSummaryFor(workspace) {
  if (workspace.id === ROSIE.id) return variantCallingSummaryCompleted(workspace);
  return variantCallingSummaryBlocked(
    workspace,
    "Finish alignment cleanly before calling variants."
  );
}

function ingestionLanePreview(workspace, sampleLane) {
  const sequence =
    "AGGCTGAGGCAGGAGGATCACCTGAGGCCAGGAGTTTGAGACCAGCCTGGCCAACATGGTG" +
    "AAACCCCATCTCTACCAAAATACAAAAATTAGCCAGGCGTGGTGGCGCATGCCTGTAATCC";
  const quality = "H".repeat(sequence.length);
  const reads = (pair, stem) =>
    Array.from({ length: 6 }).map((_, index) => ({
      header: `${stem}.${pair}.read${index + 1} length=${sequence.length}`,
      sequence,
      quality,
      length: sequence.length,
      gc_percent: 48.3 + index * 0.4,
      mean_quality: 36.8,
    }));
  return {
    workspace_id: workspace.id,
    sample_lane: sampleLane,
    batch_id: `batch-${sampleLane}`,
    source: "canonical-fastq",
    read_layout: "paired",
    reads: {
      R1: reads("R1", `${workspace.id}_${sampleLane}`),
      R2: reads("R2", `${workspace.id}_${sampleLane}`),
    },
    stats: {
      sampled_read_count: 6,
      average_read_length: sequence.length,
      sampled_gc_percent: 49.1,
    },
  };
}

// ---------- stub HTTP server ----------

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function startStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", STUB_URL);
    const parts = url.pathname.replace(/\/+$/, "").split("/");

    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && url.pathname === "/api/workspaces") {
      return send(res, 200, WORKSPACES);
    }

    // /api/workspaces/{id}...
    if (parts[1] === "api" && parts[2] === "workspaces" && parts[3]) {
      const workspace = workspaceFor(parts[3]);
      if (!workspace) return send(res, 404, { detail: "Workspace not found" });

      if (req.method === "GET" && parts.length === 4) {
        return send(res, 200, workspace);
      }
      if (req.method === "GET" && parts[4] === "alignment" && parts.length === 5) {
        return send(res, 200, alignmentSummaryFor(workspace));
      }
      if (
        req.method === "GET" &&
        parts[4] === "variant-calling" &&
        parts.length === 5
      ) {
        return send(res, 200, variantCallingSummaryFor(workspace));
      }
      if (
        req.method === "GET" &&
        parts[4] === "annotation" &&
        parts.length === 5
      ) {
        return send(res, 200, annotationSummaryFor(workspace));
      }
      if (
        req.method === "GET" &&
        parts[4] === "neoantigen" &&
        parts.length === 5
      ) {
        return send(res, 200, neoantigenSummaryFor(workspace));
      }
      if (
        req.method === "GET" &&
        parts[4] === "epitope" &&
        parts.length === 5
      ) {
        return send(res, 200, epitopeSummaryFor(workspace));
      }
      if (
        req.method === "PUT" &&
        parts[4] === "epitope" &&
        parts[5] === "selection"
      ) {
        return send(res, 200, epitopeSummaryFor(workspace));
      }
      if (
        req.method === "GET" &&
        parts[4] === "ingestion" &&
        parts[5] === "preview" &&
        parts[6]
      ) {
        return send(res, 200, ingestionLanePreview(workspace, parts[6]));
      }
    }

    send(res, 404, { detail: `Unhandled ${req.method} ${url.pathname}` });
  });

  return new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", () => resolve(server)));
}

// ---------- Next.js dev server ----------

function startNextDev() {
  const env = {
    ...process.env,
    PORT: String(NEXT_PORT),
    NEXT_PUBLIC_API_URL: STUB_URL,
    INTERNAL_API_URL: STUB_URL,
  };
  const proc = spawn("npx", ["next", "dev", "--port", String(NEXT_PORT)], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const prefix = "[next] ";
  proc.stdout.on("data", (chunk) => process.stdout.write(prefix + chunk.toString()));
  proc.stderr.on("data", (chunk) => process.stderr.write(prefix + chunk.toString()));
  return proc;
}

function killNext(proc) {
  if (!proc.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try {
      proc.kill("SIGTERM");
    } catch {}
  }
}

async function waitFor(url, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

// ---------- screenshot plan ----------

const SHOTS = [
  {
    name: "landing",
    path: "/",
    height: 760,
    // Make sure we land before the network finishes so the loading state does
    // not flicker into the shot.
    wait: 600,
  },
  {
    name: "ingestion",
    path: `/workspaces/${HCC.id}/ingestion`,
    height: 860,
    wait: 900,
  },
  {
    name: "alignment",
    path: `/workspaces/${ROSIE.id}/alignment`,
    height: 1100,
    wait: 1200,
  },
  {
    name: "variant-calling",
    path: `/workspaces/${ROSIE.id}/variant-calling`,
    height: 2100,
    wait: 1500,
  },
  {
    name: "annotation",
    path: `/workspaces/${ROSIE.id}/annotation`,
    height: 2400,
    wait: 1500,
  },
  {
    name: "neoantigen",
    path: `/workspaces/${ROSIE.id}/neoantigen-prediction`,
    height: 2600,
    wait: 1500,
  },
  {
    name: "epitope-selection",
    path: `/workspaces/${ROSIE.id}/epitope-selection`,
    height: 2800,
    wait: 1500,
  },
];

async function capture() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: shot.height },
        deviceScaleFactor: 1,
        colorScheme: "light",
      });
      const page = await context.newPage();
      await page.goto(`${NEXT_URL}${shot.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(shot.wait);
      const outPath = path.join(SCREENSHOT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      await context.close();
      console.log(`wrote ${path.relative(REPO_ROOT, outPath)}`);
    }
  } finally {
    await browser.close();
  }
}

// ---------- orchestration ----------

async function main() {
  const stub = await startStub();
  console.log(`stub API on ${STUB_URL}`);

  const next = startNextDev();
  console.log(`starting next dev on ${NEXT_URL}...`);

  try {
    await waitFor(`${NEXT_URL}/`);
    console.log("next dev ready");
    await waitFor(`${STUB_URL}/health`);
    await capture();
  } finally {
    killNext(next);
    stub.close();
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

main().then(
  () => {
    console.log("done");
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
