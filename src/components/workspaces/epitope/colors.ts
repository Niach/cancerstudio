import type { EpitopeRisk, MhcClass } from "@/lib/types";

export const CLASS_COLOR: Record<MhcClass, string> = {
  I: "#0f766e",
  II: "#7c3aed",
};

export const RISK_COLOR: Record<
  EpitopeRisk,
  { bg: string; fg: string; label: string }
> = {
  critical: { bg: "#dc2626", fg: "#fff", label: "Critical" },
  elevated: { bg: "#f59e0b", fg: "#1a1a1a", label: "Elevated" },
  mild: { bg: "#fde68a", fg: "#78350f", label: "Mild" },
};

export function linkerFor(cls: MhcClass): string {
  return cls === "II" ? "GPGPG" : "AAY";
}
