"use client";

import { useState } from "react";

import { Card, Eyebrow } from "@/components/ui-kit";
import type {
  AnnotatedVariantEntry,
  AnnotationImpactTier,
} from "@/lib/types";

type FilterKey = "cancer" | "high" | "all";

interface AnnotatedVariantsTableProps {
  variants: AnnotatedVariantEntry[];
  defaultFilter?: FilterKey;
}

const IMPACT_PILL: Record<AnnotationImpactTier, { bg: string; color: string }> = {
  HIGH: {
    bg: "color-mix(in oklch, #e11d48 14%, transparent)",
    color: "#e11d48",
  },
  MODERATE: {
    bg: "color-mix(in oklch, #d97706 14%, transparent)",
    color: "#d97706",
  },
  LOW: {
    bg: "color-mix(in oklch, #0284c7 14%, transparent)",
    color: "#0284c7",
  },
  MODIFIER: { bg: "var(--surface-sunk)", color: "var(--muted)" },
};

export default function AnnotatedVariantsTable({
  variants,
  defaultFilter = "cancer",
}: AnnotatedVariantsTableProps) {
  const [filter, setFilter] = useState<FilterKey>(defaultFilter);

  const counts = {
    all: variants.length,
    cancer: variants.filter((v) => v.inCancerGene).length,
    high: variants.filter((v) => v.impact === "HIGH").length,
  };

  const rows = variants.filter((v) =>
    filter === "cancer" ? v.inCancerGene : filter === "high" ? v.impact === "HIGH" : true
  );

  const chips: Array<{ key: FilterKey; label: string }> = [
    { key: "cancer", label: "Cancer genes" },
    { key: "high", label: "High impact" },
    { key: "all", label: "All" },
  ];

  return (
    <Card style={{ marginTop: 16 }}>
      <div
        style={{
          padding: "18px 22px 12px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 220 }}>
          <Eyebrow>Annotated mutations</Eyebrow>
          <h3
            style={{
              margin: "6px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 20,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            Top {rows.length} of {variants.length}
          </h3>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border:
                  filter === c.key
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--line)",
                background:
                  filter === c.key
                    ? "color-mix(in oklch, var(--accent) 10%, var(--surface-strong))"
                    : "var(--surface-strong)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                color:
                  filter === c.key ? "var(--accent-ink)" : "var(--muted)",
                cursor: "pointer",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {c.label} · {counts[c.key]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 8px 10px" }}>
        <div
          className="mvx-data-row mvx-data-head"
          style={{
            gridTemplateColumns: "1.1fr 1.3fr 0.9fr 1.4fr 0.8fr 1fr",
          }}
        >
          <span>Gene</span>
          <span>Protein change</span>
          <span>Impact</span>
          <span>What changed</span>
          <span style={{ textAlign: "right" }}>VAF</span>
          <span style={{ textAlign: "right" }}>Locus</span>
        </div>
        {rows.map((v, i) => {
          const pill = IMPACT_PILL[v.impact];
          return (
            <div
              key={i}
              className="mvx-data-row"
              style={{
                gridTemplateColumns: "1.1fr 1.3fr 0.9fr 1.4fr 0.8fr 1fr",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: "var(--ink)",
                  }}
                >
                  {v.geneSymbol ?? "—"}
                </span>
                {v.inCancerGene ? (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      background:
                        "color-mix(in oklch, var(--accent) 14%, transparent)",
                      color: "var(--accent-ink)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.16em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    cancer
                  </span>
                ) : null}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--ink-2)",
                  fontWeight: 500,
                }}
              >
                {v.hgvsp ?? v.hgvsc ?? "—"}
              </span>
              <span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 6,
                    background: pill.bg,
                    color: pill.color,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "lowercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  {v.impact.toLowerCase()}
                </span>
              </span>
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                {v.consequenceLabel || v.consequence}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink-2)",
                }}
              >
                {v.tumorVaf != null ? `${(v.tumorVaf * 100).toFixed(1)}%` : "—"}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                chr{v.chromosome}:{v.position.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
