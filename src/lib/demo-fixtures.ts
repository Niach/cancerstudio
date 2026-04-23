import type {
  AlignmentStageSummary,
  AnnotationStageSummary,
  ConstructOutputStageSummary,
  ConstructStageSummary,
  EpitopeStageSummary,
  IngestionLanePreview,
  NeoantigenStageSummary,
  VariantCallingStageSummary,
  Workspace,
  GeneDomainsResponse,
  SystemMemoryResponse,
  SystemResourcesResponse,
  AlignmentSettings,
} from "@/lib/types";

import epitopeJson from "../../backend/app/data/epitope_fixture.json";
import constructJson from "../../backend/app/data/construct_fixture.json";
import constructOutputJson from "../../backend/app/data/construct_output_fixture.json";

export const DEMO_WORKSPACE_ID = "demo-biscuit";

const NOW = "2026-04-01T10:00:00.000Z";
const LATER = "2026-04-01T16:42:00.000Z";

export const DEMO_WORKSPACE: Workspace = {
  id: DEMO_WORKSPACE_ID,
  displayName: "Biscuit — GSD mast cell tumor",
  species: "dog",
  analysisProfile: {
    referencePreset: "canfam4",
    referenceOverride: null,
  },
  activeStage: "construct-output",
  ingestion: {
    status: "ready",
    readyForAlignment: true,
    lanes: {
      tumor: {
        sampleLane: "tumor",
        status: "ready",
        readyForAlignment: true,
        sourceFileCount: 2,
        canonicalFileCount: 2,
        missingPairs: [],
        blockingIssues: [],
        readLayout: "paired",
        updatedAt: NOW,
        progress: null,
        activeBatchId: null,
      },
      normal: {
        sampleLane: "normal",
        status: "ready",
        readyForAlignment: true,
        sourceFileCount: 2,
        canonicalFileCount: 2,
        missingPairs: [],
        blockingIssues: [],
        readLayout: "paired",
        updatedAt: NOW,
        progress: null,
        activeBatchId: null,
      },
    },
  },
  files: [
    { id: "f1", batchId: "b1", sampleLane: "tumor",  filename: "biscuit_tumor_R1.fastq.gz",  format: "fastq", fileRole: "canonical", status: "ready", sizeBytes: 24_100_000_000, uploadedAt: NOW, readPair: "R1", sourcePath: null, managedPath: "/app-data/biscuit/tumor/R1.fastq.gz" },
    { id: "f2", batchId: "b1", sampleLane: "tumor",  filename: "biscuit_tumor_R2.fastq.gz",  format: "fastq", fileRole: "canonical", status: "ready", sizeBytes: 24_000_000_000, uploadedAt: NOW, readPair: "R2", sourcePath: null, managedPath: "/app-data/biscuit/tumor/R2.fastq.gz" },
    { id: "f3", batchId: "b2", sampleLane: "normal", filename: "biscuit_normal_R1.fastq.gz", format: "fastq", fileRole: "canonical", status: "ready", sizeBytes: 22_800_000_000, uploadedAt: NOW, readPair: "R1", sourcePath: null, managedPath: "/app-data/biscuit/normal/R1.fastq.gz" },
    { id: "f4", batchId: "b2", sampleLane: "normal", filename: "biscuit_normal_R2.fastq.gz", format: "fastq", fileRole: "canonical", status: "ready", sizeBytes: 22_700_000_000, uploadedAt: NOW, readPair: "R2", sourcePath: null, managedPath: "/app-data/biscuit/normal/R2.fastq.gz" },
  ],
  createdAt: NOW,
  updatedAt: LATER,
};

export const DEMO_INGESTION_LANE_PREVIEW: IngestionLanePreview = {
  workspaceId: DEMO_WORKSPACE_ID,
  sampleLane: "tumor",
  batchId: "b1",
  source: "canonical-fastq",
  readLayout: "paired",
  reads: {
    R1: [
      { header: "@biscuit:1:1:1000:100", sequence: "GATCGATCGCTAGCTACGTACGTACGTAAGCTAGCTA", quality: "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII", length: 150, gcPercent: 48.1, meanQuality: 38.5 },
    ],
    R2: [
      { header: "@biscuit:1:1:1000:100", sequence: "CGTACGTACGTACGTAAGCTAGCTAGATCGATCGCT", quality: "IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII", length: 150, gcPercent: 47.8, meanQuality: 38.1 },
    ],
  },
  stats: { sampledReadCount: 50000, averageReadLength: 150, sampledGcPercent: 47.9 },
};

export const DEMO_ALIGNMENT_SUMMARY: AlignmentStageSummary = {
  workspaceId: DEMO_WORKSPACE_ID,
  status: "completed",
  blockingReason: null,
  analysisProfile: { referencePreset: "canfam4", referenceOverride: null },
  qcVerdict: "pass",
  readyForVariantCalling: true,
  latestRun: {
    id: "align-run-1",
    status: "completed",
    progress: 1,
    referencePreset: "canfam4",
    referenceOverride: null,
    referenceLabel: "CanFam4 (UU_Cfam_GSD_1.0)",
    runtimePhase: "finalizing",
    qcVerdict: "pass",
    createdAt: NOW,
    updatedAt: LATER,
    startedAt: NOW,
    completedAt: LATER,
    blockingReason: null,
    error: null,
    commandLog: [
      "strobealign --threads 16 -x canFam4.fa tumor_R1.fq.gz tumor_R2.fq.gz > tumor.sam",
      "samtools sort -@ 8 -O bam -o tumor.bam tumor.sam",
      "samtools markdup tumor.sorted.bam tumor.dedup.bam",
    ],
    recentLogTail: [
      "[strobealign] 99.1% of tumor reads mapped",
      "[samtools] 4.2% duplicates removed",
      "[bqsr] base quality recalibrated",
    ],
    lastActivityAt: LATER,
    etaSeconds: 0,
    progressComponents: { referencePrep: 1, aligning: 1, finalizing: 1, stats: 1 },
    expectedTotalPerLane: { tumor: 312_000_000, normal: 298_000_000 },
    laneMetrics: {
      tumor: { sampleLane: "tumor", totalReads: 312_000_000, mappedReads: 309_200_000, mappedPercent: 99.1, properlyPairedPercent: 97.8, duplicatePercent: 4.2, meanInsertSize: 348 },
      normal: { sampleLane: "normal", totalReads: 298_000_000, mappedReads: 295_600_000, mappedPercent: 99.2, properlyPairedPercent: 97.9, duplicatePercent: 3.8, meanInsertSize: 351 },
    },
    chunkProgress: {
      tumor: { phase: "merging", totalChunks: 64, completedChunks: 64, activeChunks: 0 },
      normal: { phase: "merging", totalChunks: 60, completedChunks: 60, activeChunks: 0 },
    },
    artifacts: [
      { id: "art-bam-t",  artifactKind: "bam",  sampleLane: "tumor",  filename: "biscuit_tumor.dedup.bam",  sizeBytes: 16_800_000_000, downloadPath: "/demo/tumor.bam",  localPath: null },
      { id: "art-bai-t",  artifactKind: "bai",  sampleLane: "tumor",  filename: "biscuit_tumor.dedup.bam.bai", sizeBytes: 6_800_000, downloadPath: "/demo/tumor.bai", localPath: null },
      { id: "art-bam-n",  artifactKind: "bam",  sampleLane: "normal", filename: "biscuit_normal.dedup.bam", sizeBytes: 15_900_000_000, downloadPath: "/demo/normal.bam", localPath: null },
      { id: "art-bai-n",  artifactKind: "bai",  sampleLane: "normal", filename: "biscuit_normal.dedup.bam.bai", sizeBytes: 6_600_000, downloadPath: "/demo/normal.bai", localPath: null },
    ],
  },
  laneMetrics: {
    tumor: { sampleLane: "tumor", totalReads: 312_000_000, mappedReads: 309_200_000, mappedPercent: 99.1, properlyPairedPercent: 97.8, duplicatePercent: 4.2, meanInsertSize: 348 },
    normal: { sampleLane: "normal", totalReads: 298_000_000, mappedReads: 295_600_000, mappedPercent: 99.2, properlyPairedPercent: 97.9, duplicatePercent: 3.8, meanInsertSize: 351 },
  },
  artifacts: [],
};

export const DEMO_ALIGNMENT_SETTINGS: AlignmentSettings = {
  alignerThreads: 16,
  samtoolsThreads: 8,
  samtoolsSortThreads: 4,
  samtoolsSortMemory: "2G",
  chunkReads: 5_000_000,
  chunkParallelism: 4,
  defaults: {
    alignerThreads: 16,
    samtoolsThreads: 8,
    samtoolsSortThreads: 4,
    samtoolsSortMemory: "2G",
    chunkReads: 5_000_000,
    chunkParallelism: 4,
  },
};

export const DEMO_VARIANT_CALLING_SUMMARY: VariantCallingStageSummary = {
  workspaceId: DEMO_WORKSPACE_ID,
  status: "completed",
  blockingReason: null,
  readyForAnnotation: true,
  latestRun: {
    id: "vc-run-1",
    status: "completed",
    progress: 1,
    runtimePhase: "finalizing",
    createdAt: NOW,
    updatedAt: LATER,
    startedAt: NOW,
    completedAt: LATER,
    blockingReason: null,
    error: null,
    commandLog: [
      "gatk Mutect2 -R canFam4.fa -I tumor.bam -I normal.bam -normal normal -O biscuit.vcf.gz",
      "gatk FilterMutectCalls -V biscuit.vcf.gz -O biscuit.filtered.vcf.gz",
    ],
    metrics: {
      totalVariants: 28_233,
      snvCount: 24_831,
      indelCount: 3_402,
      insertionCount: 1_620,
      deletionCount: 1_782,
      mnvCount: 0,
      passCount: 26_119,
      passSnvCount: 23_180,
      passIndelCount: 2_939,
      tiTvRatio: 2.08,
      transitions: 16_810,
      transversions: 8_021,
      meanVaf: 0.39,
      medianVaf: 0.41,
      tumorMeanDepth: 46.1,
      normalMeanDepth: 42.3,
      tumorSample: "biscuit_tumor",
      normalSample: "biscuit_normal",
      referenceLabel: "CanFam4",
      ponLabel: null,
      perChromosome: Array.from({ length: 38 }, (_, i) => ({
        chromosome: `chr${i + 1}`,
        length: 100_000_000 - i * 1_200_000,
        total: 900 - i * 15,
        passCount: 820 - i * 14,
        snvCount: 780 - i * 13,
        indelCount: 110 - i * 2,
      })),
      filterBreakdown: [
        { name: "PASS", count: 26_119, isPass: true },
        { name: "weak_evidence", count: 1_204, isPass: false },
        { name: "germline", count: 610, isPass: false },
        { name: "strand_bias", count: 300, isPass: false },
      ],
      vafHistogram: [12, 22, 36, 58, 78, 92, 96, 84, 70, 54, 42, 32, 24, 18, 14, 10, 8, 6, 5, 4].map((count, i) => ({
        binStart: i * 0.05,
        binEnd: (i + 1) * 0.05,
        count: count * 40,
      })),
      topVariants: [
        { chromosome: "chr9",  position: 85_412_093, ref: "A", alt: "T", variantType: "snv", filter: "PASS", isPass: true, tumorVaf: 0.62, tumorDepth: 58, normalDepth: 44 },
        { chromosome: "chr11", position: 42_019_822, ref: "G", alt: "A", variantType: "snv", filter: "PASS", isPass: true, tumorVaf: 0.54, tumorDepth: 51, normalDepth: 42 },
        { chromosome: "chr5",  position: 17_002_115, ref: "C", alt: "T", variantType: "snv", filter: "PASS", isPass: true, tumorVaf: 0.48, tumorDepth: 49, normalDepth: 40 },
      ],
    },
    artifacts: [],
    completedShards: 64,
    totalShards: 64,
    accelerationMode: "cpu_gatk",
  },
  artifacts: [],
};

export const DEMO_ANNOTATION_SUMMARY: AnnotationStageSummary = {
  workspaceId: DEMO_WORKSPACE_ID,
  status: "completed",
  blockingReason: null,
  readyForNeoantigen: true,
  latestRun: {
    id: "ann-run-1",
    status: "completed",
    progress: 1,
    runtimePhase: "finalizing",
    createdAt: NOW,
    updatedAt: LATER,
    startedAt: NOW,
    completedAt: LATER,
    blockingReason: null,
    error: null,
    commandLog: [
      "vep -i biscuit.filtered.vcf.gz --cache --species canis_lupus_familiaris --offline",
    ],
    metrics: {
      totalVariants: 26_119,
      annotatedVariants: 18_402,
      byImpact: { HIGH: 342, MODERATE: 2_194, LOW: 4_820, MODIFIER: 11_046 },
      byConsequence: [
        { term: "missense_variant",     label: "Missense",     count: 2_194 },
        { term: "synonymous_variant",   label: "Synonymous",   count: 4_820 },
        { term: "intron_variant",       label: "Intronic",     count: 8_610 },
        { term: "intergenic_variant",   label: "Intergenic",   count: 2_436 },
        { term: "frameshift_variant",   label: "Frameshift",   count: 148 },
        { term: "stop_gained",          label: "Stop-gained",   count: 62 },
        { term: "splice_region_variant", label: "Splice region", count: 132 },
      ],
      cancerGeneHits: [
        { symbol: "KIT",    role: "oncogene",         variantCount: 3, highestImpact: "HIGH",     topHgvsp: "p.Asn816Ile", topConsequence: "missense_variant", transcriptId: "ENSCAFT00000012345", proteinLength: 976,  variants: [] },
        { symbol: "TP53",   role: "tumor suppressor", variantCount: 2, highestImpact: "HIGH",     topHgvsp: "p.Arg248Gln", topConsequence: "missense_variant", transcriptId: "ENSCAFT00000023456", proteinLength: 393,  variants: [] },
        { symbol: "PTEN",   role: "tumor suppressor", variantCount: 1, highestImpact: "MODERATE", topHgvsp: "p.Arg130Gln", topConsequence: "missense_variant", transcriptId: "ENSCAFT00000034567", proteinLength: 403,  variants: [] },
        { symbol: "NOTCH1", role: "signaling",        variantCount: 1, highestImpact: "MODERATE", topHgvsp: "p.Leu1574Pro", topConsequence: "missense_variant", transcriptId: "ENSCAFT00000045678", proteinLength: 2555, variants: [] },
        { symbol: "PIK3CA", role: "oncogene",         variantCount: 1, highestImpact: "MODERATE", topHgvsp: "p.Glu545Lys", topConsequence: "missense_variant", transcriptId: "ENSCAFT00000056789", proteinLength: 1068, variants: [] },
      ],
      cancerGeneVariantCount: 12,
      topGeneFocus: {
        symbol: "KIT",
        role: "oncogene",
        transcriptId: "ENSCAFT00000012345",
        proteinLength: 976,
        variants: [
          { chromosome: "chr13", position: 48_212_083, proteinPosition: 816, hgvsp: "p.Asn816Ile", hgvsc: "c.2447A>T", consequence: "missense_variant", impact: "HIGH",     tumorVaf: 0.47 },
          { chromosome: "chr13", position: 48_210_101, proteinPosition: 559, hgvsp: "p.Val559Asp", hgvsc: "c.1676T>A", consequence: "missense_variant", impact: "MODERATE", tumorVaf: 0.11 },
          { chromosome: "chr13", position: 48_210_099, proteinPosition: 814, hgvsp: "p.Asp814Val", hgvsc: "c.2441A>T", consequence: "missense_variant", impact: "MODERATE", tumorVaf: 0.16 },
        ],
        domains: [
          { start: 25,  end: 520, label: "Ig-like (extracellular)", kind: "neutral" },
          { start: 545, end: 935, label: "Kinase domain",           kind: "catalytic" },
        ],
      },
      topVariants: [
        { chromosome: "chr13", position: 48_212_083, ref: "A", alt: "T", geneSymbol: "KIT",  transcriptId: "ENSCAFT00000012345", consequence: "missense_variant", consequenceLabel: "Missense", impact: "HIGH",     hgvsc: "c.2447A>T", hgvsp: "p.Asn816Ile", proteinPosition: 816, tumorVaf: 0.47, inCancerGene: true },
        { chromosome: "chr11", position: 42_019_822, ref: "G", alt: "A", geneSymbol: "TP53", transcriptId: "ENSCAFT00000023456", consequence: "missense_variant", consequenceLabel: "Missense", impact: "HIGH",     hgvsc: "c.742C>T",  hgvsp: "p.Arg248Gln", proteinPosition: 248, tumorVaf: 0.41, inCancerGene: true },
        { chromosome: "chr5",  position: 17_002_115, ref: "C", alt: "T", geneSymbol: "PTEN", transcriptId: "ENSCAFT00000034567", consequence: "missense_variant", consequenceLabel: "Missense", impact: "MODERATE", hgvsc: "c.389G>A",  hgvsp: "p.Arg130Gln", proteinPosition: 130, tumorVaf: 0.26, inCancerGene: true },
      ],
      referenceLabel: "CanFam4",
      speciesLabel: "Canis lupus familiaris",
      vepRelease: "VEP 111",
    },
    artifacts: [],
    cachePending: false,
    cacheSpeciesLabel: "Canis lupus familiaris",
    cacheExpectedMegabytes: 2_100,
  },
  artifacts: [],
};

export const DEMO_GENE_DOMAINS_RESPONSE: GeneDomainsResponse = {
  symbol: "KIT",
  transcriptId: "ENSCAFT00000012345",
  proteinLength: 976,
  domains: [
    { start: 25,  end: 520, label: "Ig-like (extracellular)" },
    { start: 545, end: 935, label: "Kinase domain" },
  ],
};

export const DEMO_NEOANTIGEN_SUMMARY: NeoantigenStageSummary = {
  workspaceId: DEMO_WORKSPACE_ID,
  status: "completed",
  blockingReason: null,
  readyForEpitopeSelection: true,
  alleles: [
    { allele: "DLA-88*034:01",  class: "I",  typing: "typed",    source: "NGS MHC typing", frequency: null },
    { allele: "DLA-88*508:01",  class: "I",  typing: "typed",    source: "NGS MHC typing", frequency: null },
    { allele: "DLA-12*01:01",   class: "I",  typing: "inferred", source: "imputed",         frequency: 0.12 },
    { allele: "DLA-64*01:01",   class: "I",  typing: "inferred", source: "imputed",         frequency: 0.09 },
    { allele: "DLA-DRB1*015:01", class: "II", typing: "typed",    source: "NGS MHC typing", frequency: null },
    { allele: "DLA-DQB1*008:01", class: "II", typing: "typed",    source: "NGS MHC typing", frequency: null },
  ],
  latestRun: {
    id: "neo-run-1",
    status: "completed",
    progress: 1,
    runtimePhase: "finalizing",
    createdAt: NOW,
    updatedAt: LATER,
    startedAt: NOW,
    completedAt: LATER,
    blockingReason: null,
    error: null,
    commandLog: ["pvacseq run ..."],
    metrics: {
      pvacseqVersion: "3.1.2",
      netmhcpanVersion: "4.2",
      netmhciipanVersion: "4.3",
      speciesLabel: "Canis lupus familiaris",
      assembly: "CanFam4",
      alleles: [
        { allele: "DLA-88*034:01",  class: "I",  typing: "typed", source: null, frequency: null },
        { allele: "DLA-88*508:01",  class: "I",  typing: "typed", source: null, frequency: null },
        { allele: "DLA-12*01:01",   class: "I",  typing: "inferred", source: null, frequency: null },
        { allele: "DLA-64*01:01",   class: "I",  typing: "inferred", source: null, frequency: null },
        { allele: "DLA-DRB1*015:01", class: "II", typing: "typed", source: null, frequency: null },
        { allele: "DLA-DQB1*008:01", class: "II", typing: "typed", source: null, frequency: null },
      ],
      rejectedAlleles: [],
      annotatedVariants: 18_402,
      proteinChangingVariants: 2_194,
      peptidesGenerated: 1_842,
      visibleCandidates: 412,
      classICount: 318,
      classIICount: 94,
      buckets: [
        { key: "strong",   label: "Strong",   threshold: "IC50 < 50 nM",   plain: "Will bind reliably",           count: 31 },
        { key: "moderate", label: "Moderate", threshold: "50-500 nM",       plain: "May bind",                     count: 48 },
        { key: "weak",     label: "Weak",     threshold: "500-5000 nM",     plain: "Unlikely to bind",             count: 122 },
        { key: "none",     label: "None",     threshold: "≥ 5000 nM",       plain: "Filtered out",                  count: 211 },
      ],
      heatmap: {
        alleles: ["DLA-88*034:01", "DLA-88*508:01", "DLA-12*01:01", "DLA-64*01:01"],
        peptides: [
          { seq: "NIIQLLFMGH", gene: "KIT",   mut: "p.Asn816Ile", length: 10, class: "I", vaf: 0.47, ic50: [14, 220, 820, 1400],  mutPos: 8 },
          { seq: "LNTIHRASV",  gene: "TP53",  mut: "p.Arg248Gln", length: 9,  class: "I", vaf: 0.41, ic50: [180, 21, 740, 1100],  mutPos: 6 },
          { seq: "QEVDPVGHM",  gene: "ATM",   mut: "p.Gln1162*",  length: 9,  class: "I", vaf: 0.19, ic50: [29, 350, 520, 1600],  mutPos: 4 },
          { seq: "YEVKEHCKM",  gene: "PIK3CA", mut: "p.Glu545Lys", length: 9, class: "I", vaf: 0.32, ic50: [46, 310, 880, 2100],  mutPos: 5 },
          { seq: "APLDEYFRV",  gene: "NRAS",  mut: "p.Gln61Arg",  length: 9,  class: "I", vaf: 0.29, ic50: [620, 510, 18, 780],   mutPos: 5 },
        ],
      },
      funnel: [
        { label: "Somatic variants",     count: 26_119, hint: "PASS after filter" },
        { label: "Protein-changing",      count: 2_194,  hint: "Missense + frameshift" },
        { label: "Peptides generated",    count: 1_842,  hint: "9-11mers, all frames" },
        { label: "Expressed (RNA-seq)",   count: 412,    hint: "VAF ≥ 0.1 · expressed" },
        { label: "High-confidence hits",  count: 86,     hint: "Dedup + frame check" },
      ],
      top: [
        { seq: "NIIQLLFMGH", gene: "KIT",    mut: "p.Asn816Ile", length: 10, class: "I", allele: "DLA-88*034:01", ic50: 14, wtIc50: 1240, agretopicity: 88.6,  vaf: 0.47, tpm: 142.3, cancerGene: true, strong: true  },
        { seq: "LNTIHRASV",  gene: "TP53",   mut: "p.Arg248Gln", length: 9,  class: "I", allele: "DLA-88*508:01", ic50: 21, wtIc50: 2800, agretopicity: 133.3, vaf: 0.41, tpm: 98.7,  cancerGene: true, strong: true  },
        { seq: "QEVDPVGHM",  gene: "ATM",    mut: "p.Gln1162*",  length: 9,  class: "I", allele: "DLA-88*034:01", ic50: 29, wtIc50: 221,  agretopicity: 7.6,   vaf: 0.19, tpm: 24.1,  cancerGene: true, strong: true  },
        { seq: "YEVKEHCKM",  gene: "PIK3CA", mut: "p.Glu545Lys", length: 9,  class: "I", allele: "DLA-88*034:01", ic50: 46, wtIc50: 163,  agretopicity: 28.2,  vaf: 0.32, tpm: 58.1,  cancerGene: true, strong: true  },
      ],
    },
    artifacts: [],
  },
  artifacts: [],
};

interface EpitopeFixtureShape {
  alleles: Array<{ id: string; class: "I" | "II"; color: string }>;
  candidates: Array<{
    id: string; seq: string; gene: string; mutation: string; length: number;
    class: "I" | "II"; allele_id: string; ic50_nm: number; agretopicity: number;
    vaf: number; tpm: number; cancer_gene: boolean; driver_context: string | null;
    tier: "strong" | "moderate"; flags: string[];
  }>;
  safety: Record<string, { peptide_id: string; self_hit: string; identity: number; risk: "critical" | "elevated" | "mild"; note: string }>;
  default_picks: string[];
}

const epitopeFixture = epitopeJson as EpitopeFixtureShape;

export const DEMO_EPITOPE_SUMMARY: EpitopeStageSummary = {
  workspaceId: DEMO_WORKSPACE_ID,
  status: "completed",
  blockingReason: null,
  candidates: epitopeFixture.candidates.map(c => ({
    id: c.id,
    seq: c.seq,
    gene: c.gene,
    mutation: c.mutation,
    length: c.length,
    class: c.class,
    alleleId: c.allele_id,
    ic50Nm: c.ic50_nm,
    agretopicity: c.agretopicity,
    vaf: c.vaf,
    tpm: c.tpm,
    cancerGene: c.cancer_gene,
    driverContext: c.driver_context,
    tier: c.tier,
    flags: c.flags,
  })),
  safety: Object.fromEntries(
    Object.entries(epitopeFixture.safety ?? {}).map(([k, v]) => [k, {
      peptideId: v.peptide_id,
      selfHit: v.self_hit,
      identity: v.identity,
      risk: v.risk,
      note: v.note,
    }])
  ),
  alleles: epitopeFixture.alleles,
  defaultPicks: epitopeFixture.default_picks,
  selection: epitopeFixture.default_picks,
  readyForConstructDesign: true,
};

interface ConstructFixtureShape {
  flanks: {
    signal: { name: string; short_name: string; aa: string; why: string };
    mitd: { name: string; short_name: string; aa: string; why: string };
    kozak: string;
    utr5: string;
    utr3: string;
    poly_a_len: number;
  };
  linkers: Record<string, string>;
  codon_unopt: Record<string, string>;
  codon_opt: Record<string, string>;
  preview_peptide: { aa: string; unopt_nt: string; opt_nt: string; gene: string; mut: string };
}

const constructFixture = constructJson as ConstructFixtureShape;

function buildConstructPreview(): ConstructStageSummary["preview"] {
  const p = constructFixture.preview_peptide;
  const codons: ConstructStageSummary["preview"]["codons"] = [];
  for (let i = 0; i < p.aa.length; i++) {
    const aa = p.aa[i];
    const unopt = p.unopt_nt.slice(i * 3, (i + 1) * 3);
    const opt = p.opt_nt.slice(i * 3, (i + 1) * 3);
    codons.push({ aa, unopt, opt, swapped: unopt !== opt });
  }
  return { gene: p.gene, mut: p.mut, codons };
}

function buildConstructSummary(): ConstructStageSummary {
  const picks = epitopeFixture.candidates.filter(c => epitopeFixture.default_picks.includes(c.id));
  const peptideAa = picks.map(p => p.seq).join("");
  const aaSeq = constructFixture.flanks.signal.aa + peptideAa + constructFixture.flanks.mitd.aa;
  const aaLen = aaSeq.length;
  const ntLen = aaLen * 3;
  const fullMrnaNt =
    constructFixture.flanks.utr5.length +
    ntLen +
    3 +
    constructFixture.flanks.utr3.length +
    constructFixture.flanks.poly_a_len;
  const segments: ConstructStageSummary["segments"] = [
    { kind: "signal", label: "Signal peptide (tPA)", sub: `${constructFixture.flanks.signal.aa.length} aa`, aa: constructFixture.flanks.signal.aa, class: null, peptideId: null, color: "#3b82f6" },
    ...picks.flatMap((p, i) => {
      const pepSegment = { kind: "peptide" as const, label: p.gene + " " + p.mutation, sub: `${p.class} · ${p.seq.length} aa`, aa: p.seq, class: p.class, peptideId: p.id, color: p.class === "I" ? "#10b981" : "#f59e0b" };
      if (i === picks.length - 1) return [pepSegment];
      const linkerAa = p.class === "II" ? constructFixture.linkers.classII : constructFixture.linkers.classI;
      return [
        pepSegment,
        { kind: "linker" as const, label: linkerAa, sub: "linker", aa: linkerAa, class: null, peptideId: null, color: "#94a3b8" },
      ];
    }),
    { kind: "mitd", label: "MITD tail", sub: `${constructFixture.flanks.mitd.aa.length} aa`, aa: constructFixture.flanks.mitd.aa, class: null, peptideId: null, color: "#a78bfa" },
  ];
  return {
    workspaceId: DEMO_WORKSPACE_ID,
    status: "scaffolded",
    blockingReason: null,
    options: { lambda: 0.5, signal: true, mitd: true, confirmed: false },
    flanks: {
      kozak: constructFixture.flanks.kozak,
      utr5: constructFixture.flanks.utr5,
      utr3: constructFixture.flanks.utr3,
      polyA: constructFixture.flanks.poly_a_len,
      signalAa: constructFixture.flanks.signal.aa,
      mitdAa: constructFixture.flanks.mitd.aa,
      signalWhy: constructFixture.flanks.signal.why,
      mitdWhy: constructFixture.flanks.mitd.why,
    },
    linkers: constructFixture.linkers,
    segments,
    aaSeq,
    metrics: {
      aaLen,
      ntLen,
      cai: 0.82,
      mfe: -412,
      gc: 56.4,
      fullMrnaNt,
      mfePerNt: -412 / fullMrnaNt,
    },
    preview: buildConstructPreview(),
    manufacturingChecks: [
      { id: "gc",       label: "GC content within 40-65%",        why: "Manufacturability — extreme GC disrupts IVT yield.", status: "pass" },
      { id: "length",   label: "Total mRNA ≤ 4 kb",                 why: "Larger transcripts have lower translation yield.",  status: "pass" },
      { id: "repeats",  label: "No > 6 nt homopolymer runs",        why: "Long runs misprime; mRNA synthesis stalls.",        status: "pass" },
      { id: "sites",    label: "No restriction sites (BsaI, BsmBI)", why: "Would be cleaved by cloning enzymes.",              status: "pass" },
      { id: "hairpin",  label: "Cap-proximal ΔG ≥ -20 kcal/mol",    why: "Strong hairpins at cap slow ribosome scanning.",    status: "pass" },
    ],
    peptideCount: picks.length,
    readyForOutput: true,
  };
}

export const DEMO_CONSTRUCT_SUMMARY: ConstructStageSummary = buildConstructSummary();

interface ConstructOutputFixtureShape {
  version: string;
  species_labels: Record<string, string>;
  cmo_options: Array<{ id: string; name: string; type: string; tat: string; cost: string; good: string[] }>;
  dosing_protocol: {
    formulation: string;
    route: string;
    dose: string;
    schedule: Array<{ when: string; label: string; what: string }>;
    watch_for: string[];
  };
}

const constructOutputFixture = constructOutputJson as ConstructOutputFixtureShape;

function codonOf(aa: string): string {
  return constructFixture.codon_opt[aa] ?? "NNN";
}

function translateToNt(aa: string): string {
  let out = "";
  for (const ch of aa) out += codonOf(ch);
  return out;
}

function buildConstructOutputSummary(): ConstructOutputStageSummary {
  const picks = epitopeFixture.candidates.filter(c => epitopeFixture.default_picks.includes(c.id));
  const runs: ConstructOutputStageSummary["runs"] = [
    { kind: "utr5",   label: "5' UTR",         nt: constructFixture.flanks.utr5 },
    { kind: "signal", label: "Signal peptide", nt: translateToNt(constructFixture.flanks.signal.aa) },
    ...picks.flatMap<ConstructOutputStageSummary["runs"][number]>((p, i) => {
      const kind: "classI" | "classII" = p.class === "II" ? "classII" : "classI";
      const pepRun: ConstructOutputStageSummary["runs"][number] = { kind, label: `${p.gene} ${p.mutation}`, nt: translateToNt(p.seq) };
      if (i === picks.length - 1) return [pepRun];
      const linkerAa = p.class === "II" ? constructFixture.linkers.classII : constructFixture.linkers.classI;
      return [pepRun, { kind: "linker", label: p.class === "II" ? "GPGPG" : "AAY", nt: translateToNt(linkerAa) }];
    }),
    { kind: "mitd", label: "MITD tail", nt: translateToNt(constructFixture.flanks.mitd.aa) },
    { kind: "stop", label: "Stop", nt: "TAA" },
    { kind: "utr3", label: "3' UTR", nt: constructFixture.flanks.utr3 },
    { kind: "polyA", label: "polyA tail", nt: "A".repeat(constructFixture.flanks.poly_a_len) },
  ];
  const fullNt = runs.map(r => r.nt).join("");
  return {
    workspaceId: DEMO_WORKSPACE_ID,
    status: "ready",
    blockingReason: null,
    constructId: "biscuit-v1",
    species: constructOutputFixture.species_labels.dog,
    version: constructOutputFixture.version,
    checksum: "sha256:7e4a9c1fde18a2b7301bd8f44e6c3b0a0e9b7a1c2e8f1b8a6c13f0a2d4e5c6b78",
    releasedAt: null,
    releasedBy: null,
    runs,
    fullNt,
    totalNt: fullNt.length,
    genbank: "LOCUS       biscuit-v1              " + fullNt.length + " bp    mRNA    linear   SYN 23-APR-2026\nDEFINITION  Biscuit personalised mRNA vaccine — demo fixture.\n//\n",
    cmoOptions: constructOutputFixture.cmo_options,
    selectedCmo: null,
    order: null,
    dosing: {
      formulation: constructOutputFixture.dosing_protocol.formulation,
      route: constructOutputFixture.dosing_protocol.route,
      dose: constructOutputFixture.dosing_protocol.dose,
      schedule: constructOutputFixture.dosing_protocol.schedule,
      watchFor: constructOutputFixture.dosing_protocol.watch_for,
    },
    auditTrail: [
      { stage: "ingestion",     when: NOW,   who: "biscuit-owner", what: "Uploaded tumour + normal FASTQs",          kind: "human" },
      { stage: "alignment",     when: NOW,   who: "pipeline",       what: "Aligned against CanFam4 (99.1% mapped)",   kind: "auto" },
      { stage: "variant-calling", when: NOW, who: "pipeline",       what: "Mutect2 → 26,119 PASS variants",           kind: "auto" },
      { stage: "annotation",    when: NOW,   who: "pipeline",       what: "VEP 111 + canine cache · 18,402 annotated", kind: "auto" },
      { stage: "neoantigen",    when: LATER, who: "pipeline",       what: "pVACseq shortlisted 86 candidates",         kind: "auto" },
      { stage: "epitope",       when: LATER, who: "biscuit-owner",  what: "Curated 8-peptide cassette",                kind: "human" },
      { stage: "construct",     when: LATER, who: "pipeline",       what: "LinearDesign + DNAchisel · CAI 0.82",       kind: "auto" },
    ],
  };
}

export const DEMO_CONSTRUCT_OUTPUT_SUMMARY: ConstructOutputStageSummary = buildConstructOutputSummary();

export const DEMO_SYSTEM_MEMORY: SystemMemoryResponse = {
  availableBytes: 16 * 1024 ** 3,
  totalBytes: 32 * 1024 ** 3,
  thresholdBytes: 8 * 1024 ** 3,
};

export const DEMO_SYSTEM_RESOURCES: SystemResourcesResponse = {
  cpuCount: 16,
  totalMemoryBytes: 32 * 1024 ** 3,
  availableMemoryBytes: 16 * 1024 ** 3,
  appDataDiskTotalBytes: 2 * 1024 ** 4,
  appDataDiskFreeBytes: 1_400 * 1024 ** 3,
  appDataRoot: "/app-data",
};
