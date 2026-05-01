"use client";

import type { AnnotationImpactTier, AnnotationMetrics } from "@/lib/types";

interface ImpactSummaryProps {
  metrics: AnnotationMetrics;
}

const IMPACT_COLOR: Record<AnnotationImpactTier, string> = {
  HIGH: "#e11d48",
  MODERATE: "#d97706",
  LOW: "#0284c7",
  MODIFIER: "#78716c",
};

const TILES: Array<{
  tier: AnnotationImpactTier;
  title: string;
  hint: string;
}> = [
  {
    tier: "HIGH",
    title: "Likely to break the protein",
    hint: "stop codons, frameshifts, splice disruptions",
  },
  {
    tier: "MODERATE",
    title: "Likely to change the protein",
    hint: "amino-acid changes, in-frame indels",
  },
  {
    tier: "LOW",
    title: "Minor protein changes",
    hint: "silent changes, near-splice edges",
  },
  {
    tier: "MODIFIER",
    title: "Outside the protein-coding region",
    hint: "introns, UTRs, intergenic",
  },
];

export default function ImpactSummary({ metrics }: ImpactSummaryProps) {
  const total = Math.max(1, metrics.annotatedVariants);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
        marginBottom: 18,
      }}
    >
      {TILES.map((tile) => {
        const count = metrics.byImpact[tile.tier] ?? 0;
        const pct = Math.min(100, Math.round((count / total) * 100));
        const color = IMPACT_COLOR[tile.tier];
        return (
          <div
            key={tile.tier}
            style={{
              position: "relative",
              borderRadius: "var(--radius-mvx-lg)",
              border: "1px solid var(--line)",
              background: "var(--surface-strong)",
              padding: "16px 18px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.26em",
                color,
              }}
            >
              {tile.tier}
            </div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "baseline",
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  fontWeight: 400,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: "var(--ink)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count.toLocaleString()}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color,
                  fontWeight: 600,
                }}
              >
                {pct}%
              </span>
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 14.5,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              {tile.title}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12.5,
                color: "var(--muted)",
                lineHeight: 1.45,
              }}
            >
              {tile.hint}
            </div>
            <div
              style={{
                marginTop: 14,
                height: 6,
                borderRadius: 999,
                background: "var(--surface-sunk)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(pct, 2)}%`,
                  background: `linear-gradient(90deg, ${color}80, ${color})`,
                  borderRadius: 999,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
