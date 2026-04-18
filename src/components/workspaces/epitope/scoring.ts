import type { EpitopeCandidate, EpitopeSafetyFlag } from "@/lib/types";

export function scoreCandidate(
  c: EpitopeCandidate,
  safety: Record<string, EpitopeSafetyFlag>,
): number {
  const bind = Math.max(
    0,
    1 - Math.log10(Math.max(c.ic50Nm, 1)) / Math.log10(500),
  );
  const agretN = Math.min(c.agretopicity / 50, 1);
  const vafN = Math.min(c.vaf * 2, 1);
  const exprN = Math.min(Math.log10(c.tpm + 1) / Math.log10(150), 1);
  const cancerN = c.cancerGene ? 1 : 0.3;
  const risk = safety[c.id]?.risk;
  const riskPen =
    risk === "critical"
      ? 0.15
      : risk === "elevated"
        ? 0.45
        : risk === "mild"
          ? 0.85
          : 1;
  return (
    (bind * 0.35 + agretN * 0.2 + vafN * 0.2 + exprN * 0.15 + cancerN * 0.1) *
    riskPen
  );
}

export function tierForIc50(
  v: number | null | undefined,
): "strong" | "moderate" | "weak" | null {
  if (v == null) return null;
  if (v < 50) return "strong";
  if (v < 500) return "moderate";
  if (v < 5000) return "weak";
  return null;
}
