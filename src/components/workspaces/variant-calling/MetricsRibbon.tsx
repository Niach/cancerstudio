"use client";

import type { VariantCallingMetrics } from "@/lib/types";

interface MetricsRibbonProps {
  metrics: VariantCallingMetrics;
}

function fmt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

export default function MetricsRibbon({ metrics }: MetricsRibbonProps) {
  const items: Array<{ label: string; value: string; hint: string; accent: string }> = [
    {
      label: "PASS calls",
      value: fmt(metrics.passCount),
      hint: `of ${fmt(metrics.totalVariants)} total`,
      accent: "var(--accent)",
    },
    {
      label: "SNV : indel",
      value: `${fmt(metrics.snvCount)} / ${fmt(metrics.indelCount)}`,
      hint:
        metrics.snvCount > 0
          ? `${(metrics.indelCount / Math.max(1, metrics.snvCount)).toFixed(2)} indels / SNV`
          : "—",
      accent: "var(--cool)",
    },
    {
      label: "Ti / Tv",
      value: metrics.tiTvRatio != null ? metrics.tiTvRatio.toFixed(2) : "—",
      hint:
        metrics.transitions > 0 || metrics.transversions > 0
          ? `${fmt(metrics.transitions)} Ti · ${fmt(metrics.transversions)} Tv`
          : "—",
      accent: "var(--warm)",
    },
    {
      label: "Median VAF",
      value:
        metrics.medianVaf != null
          ? `${(metrics.medianVaf * 100).toFixed(1)}%`
          : "—",
      hint:
        metrics.meanVaf != null
          ? `mean ${(metrics.meanVaf * 100).toFixed(1)}%`
          : "—",
      accent: "var(--accent)",
    },
    {
      label: "Tumor depth",
      value:
        metrics.tumorMeanDepth != null ? `${Math.round(metrics.tumorMeanDepth)}×` : "—",
      hint: metrics.tumorSample ?? "tumor",
      accent: "var(--muted)",
    },
    {
      label: "Normal depth",
      value:
        metrics.normalMeanDepth != null ? `${Math.round(metrics.normalMeanDepth)}×` : "—",
      hint: metrics.normalSample ?? "normal",
      accent: "var(--muted)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 8,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="cs-card"
          style={{
            position: "relative",
            padding: "14px 16px",
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <div className="cs-mono-label" style={{ fontSize: 9 }}>
            {it.label}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 400,
              marginTop: 4,
              lineHeight: 1,
              letterSpacing: "-0.015em",
              fontVariantNumeric: "tabular-nums",
              color: "var(--ink)",
            }}
          >
            {it.value}
          </div>
          <div
            className="cs-mono-label"
            style={{ fontSize: 9, marginTop: 4, color: "var(--muted-2)" }}
          >
            {it.hint}
          </div>
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${it.accent}, transparent)`,
              opacity: 0.7,
            }}
          />
        </div>
      ))}
    </div>
  );
}
