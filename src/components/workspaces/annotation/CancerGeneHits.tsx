"use client";

import type { AnnotationImpactTier, CancerGeneHit } from "@/lib/types";

import { Card, Eyebrow, MonoLabel } from "@/components/ui-kit";

interface CancerGeneHitsProps {
  hits: CancerGeneHit[];
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
}

const IMPACT_COLOR: Record<AnnotationImpactTier, { fill: string; label: string }> = {
  HIGH: { fill: "#e11d48", label: "high impact" },
  MODERATE: { fill: "#d97706", label: "moderate impact" },
  LOW: { fill: "#0284c7", label: "low impact" },
  MODIFIER: { fill: "#78716c", label: "modifier" },
};

export default function CancerGeneHits({
  hits,
  selectedSymbol,
  onSelect,
}: CancerGeneHitsProps) {
  if (!hits.length) return null;

  return (
    <Card style={{ marginBottom: 18 }}>
      <div
        style={{
          padding: "18px 22px 10px",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Eyebrow>Cancer gene matches</Eyebrow>
          <h3
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {hits.length} gene{hits.length === 1 ? "" : "s"} hit in this tumor
          </h3>
        </div>
        <MonoLabel>click a card to focus the map below</MonoLabel>
      </div>
      <div
        style={{
          padding: "0 18px 18px",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {hits.map((hit) => {
          const tone = IMPACT_COLOR[hit.highestImpact];
          const isSelected = selectedSymbol === hit.symbol;
          return (
            <button
              key={hit.symbol}
              type="button"
              onClick={() => onSelect?.(hit.symbol)}
              style={{
                position: "relative",
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: "var(--radius-cs-lg)",
                border: isSelected
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--line)",
                background: isSelected
                  ? "color-mix(in oklch, var(--accent) 8%, var(--surface-strong))"
                  : "var(--surface-strong)",
                boxShadow: isSelected
                  ? "0 0 0 4px color-mix(in oklch, var(--accent) 16%, transparent)"
                  : "none",
                fontFamily: "inherit",
                color: "var(--ink)",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 24,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      lineHeight: 1,
                      color: "var(--ink)",
                    }}
                  >
                    {hit.symbol}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "var(--muted)",
                      lineHeight: 1.4,
                    }}
                  >
                    {hit.role}
                  </div>
                </div>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "var(--surface-sunk)",
                    border: "1px solid var(--line)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {hit.variantCount}× mut
                </span>
              </div>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    color: tone.fill,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tone.label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 999,
                    background: "var(--surface-sunk)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: "100%",
                      background: `linear-gradient(90deg, ${tone.fill}60, ${tone.fill})`,
                    }}
                  />
                </div>
              </div>
              {hit.topHgvsp ? (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                    fontWeight: 500,
                  }}
                >
                  {hit.topHgvsp}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
