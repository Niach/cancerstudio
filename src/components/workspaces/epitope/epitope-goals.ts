import type {
  EpitopeCandidate,
  EpitopeGoalId,
  EpitopeSafetyFlag,
} from "@/lib/types";

export interface EpitopeGoal {
  id: EpitopeGoalId;
  label: string;
  target: string;
  check: (
    picks: EpitopeCandidate[],
    safety: Record<string, EpitopeSafetyFlag>,
  ) => boolean;
}

export const EPITOPE_GOALS: EpitopeGoal[] = [
  {
    id: "size",
    label: "Around 6–8 peptides",
    target: "fits the vaccine",
    check: (picks) => picks.length >= 6 && picks.length <= 8,
  },
  {
    id: "gene-diverse",
    label: "Several driver genes",
    target: "5 or more",
    check: (picks) => new Set(picks.map((p) => p.gene)).size >= 5,
  },
  {
    id: "allele-cov",
    label: "Reach multiple alleles",
    target: "3 or more",
    check: (picks) => new Set(picks.map((p) => p.alleleId)).size >= 3,
  },
  {
    id: "class-balance",
    label: "One peptide for T-cell help",
    target: "at least 1 class II",
    check: (picks) => picks.filter((p) => p.class === "II").length >= 1,
  },
  {
    id: "no-passenger",
    label: "Only cancer-driving mutations",
    target: "skip passengers",
    check: (picks) => picks.every((p) => p.cancerGene),
  },
  {
    id: "safety",
    label: "Nothing looks like self",
    target: "no critical flags",
    check: (picks, safety) =>
      picks.every((p) => safety[p.id]?.risk !== "critical"),
  },
];
