export type ShowcaseStageId =
  | "ingest"
  | "align"
  | "variants"
  | "annotate"
  | "neo"
  | "epitope"
  | "construct"
  | "output"
  | "review";

export interface ShowcaseStage {
  id: ShowcaseStageId;
  n: string;
  label: string;
  sub: string;
  crumb: string;
  title: string;
}

export const SHOWCASE_STAGES: ShowcaseStage[] = [
  { id: "ingest",    n: "01", label: "Ingest",     sub: "2 × FASTQ",        crumb: "Intake",                 title: "Ingest" },
  { id: "align",     n: "02", label: "Align",      sub: "BWA-MEM2",         crumb: "Read alignment",         title: "Align" },
  { id: "variants",  n: "03", label: "Variants",   sub: "Mutect2",          crumb: "Variant calling",        title: "Variants" },
  { id: "annotate",  n: "04", label: "Annotate",   sub: "VEP · COSMIC",     crumb: "Functional annotation",  title: "Annotate" },
  { id: "neo",       n: "05", label: "Neoantigen", sub: "pVACseq",          crumb: "Neoantigen prediction",  title: "Neoantigen" },
  { id: "epitope",   n: "06", label: "Epitopes",   sub: "NetMHCpan",        crumb: "MHC binding prediction", title: "Epitopes" },
  { id: "construct", n: "07", label: "Construct",  sub: "mRNA assembly",    crumb: "mRNA design",            title: "Construct" },
  { id: "output",    n: "08", label: "Output",     sub: "FASTA + report",   crumb: "Deliverables",           title: "Output" },
  { id: "review",    n: "09", label: "Review",     sub: "Claude audit",     crumb: "Final review",           title: "Review" },
];
