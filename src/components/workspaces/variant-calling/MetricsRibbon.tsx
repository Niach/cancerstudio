"use client";

import type { VariantCallingMetrics } from "@/lib/types";

interface MetricsRibbonProps {
  metrics: VariantCallingMetrics;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatRatio(value?: number | null, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatVaf(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDepth(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(0)}×`;
}

export default function MetricsRibbon({ metrics }: MetricsRibbonProps) {
  const indelRatio =
    metrics.snvCount > 0
      ? (metrics.indelCount / metrics.snvCount).toFixed(2)
      : "—";

  const items: Array<{
    label: string;
    value: string;
    hint: string;
    accent?: "emerald" | "sky" | "amber" | "rose" | "stone";
  }> = [
    {
      label: "PASS calls",
      value: formatNumber(metrics.passCount),
      hint: `of ${formatNumber(metrics.totalVariants)} total`,
      accent: "emerald",
    },
    {
      label: "SNV : indel",
      value: `${formatNumber(metrics.snvCount)} / ${formatNumber(metrics.indelCount)}`,
      hint: `${indelRatio} indels per SNV`,
      accent: "sky",
    },
    {
      label: "Ti / Tv",
      value: formatRatio(metrics.tiTvRatio),
      hint: `${formatNumber(metrics.transitions)} Ti · ${formatNumber(metrics.transversions)} Tv`,
      accent: "amber",
    },
    {
      label: "Median VAF",
      value: formatVaf(metrics.medianVaf),
      hint: `mean ${formatVaf(metrics.meanVaf)}`,
      accent: "emerald",
    },
    {
      label: "Tumor depth",
      value: formatDepth(metrics.tumorMeanDepth),
      hint: metrics.tumorSample ?? "tumor",
      accent: "stone",
    },
    {
      label: "Normal depth",
      value: formatDepth(metrics.normalMeanDepth),
      hint: metrics.normalSample ?? "normal",
      accent: "stone",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-white via-white to-stone-50 px-4 py-3"
        >
          <div className="font-mono text-[9px] uppercase tracking-[0.26em] text-stone-400">
            {item.label}
          </div>
          <div
            className="mt-1 font-display text-[26px] leading-none font-light text-stone-900"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {item.value}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
            {item.hint}
          </div>
          <AccentStripe accent={item.accent} />
        </div>
      ))}
    </div>
  );
}

function AccentStripe({ accent }: { accent?: "emerald" | "sky" | "amber" | "rose" | "stone" }) {
  const palette: Record<string, string> = {
    emerald: "from-emerald-400/0 via-emerald-400 to-emerald-400/0",
    sky: "from-sky-400/0 via-sky-400 to-sky-400/0",
    amber: "from-amber-400/0 via-amber-400 to-amber-400/0",
    rose: "from-rose-400/0 via-rose-400 to-rose-400/0",
    stone: "from-stone-300/0 via-stone-400 to-stone-300/0",
  };
  const key = accent ?? "stone";
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r ${palette[key]}`}
    />
  );
}
