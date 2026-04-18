"use client";

import type { AnnotationImpactTier, AnnotationMetrics } from "@/lib/types";

interface ImpactSummaryProps {
  metrics: AnnotationMetrics;
}

const IMPACT_TILES: {
  tier: AnnotationImpactTier;
  title: string;
  hint: string;
  bar: string;
  accent: string;
}[] = [
  {
    tier: "HIGH",
    title: "Likely to break the protein",
    hint: "stop codons, frameshifts, splice disruptions",
    bar: "from-rose-300 via-rose-500 to-rose-600",
    accent: "text-rose-700",
  },
  {
    tier: "MODERATE",
    title: "Likely to change the protein",
    hint: "amino-acid changes, in-frame indels",
    bar: "from-amber-300 via-amber-500 to-amber-600",
    accent: "text-amber-700",
  },
  {
    tier: "LOW",
    title: "Minor protein changes",
    hint: "silent changes, near-splice edges",
    bar: "from-sky-300 via-sky-500 to-sky-600",
    accent: "text-sky-700",
  },
  {
    tier: "MODIFIER",
    title: "Outside the protein-coding region",
    hint: "introns, UTRs, intergenic",
    bar: "from-stone-200 via-stone-400 to-stone-500",
    accent: "text-stone-600",
  },
];

function formatNumber(value: number) {
  return value.toLocaleString();
}

export default function ImpactSummary({ metrics }: ImpactSummaryProps) {
  const total = metrics.annotatedVariants || 1;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {IMPACT_TILES.map((tile) => {
        const count = metrics.byImpact[tile.tier] ?? 0;
        const pct = Math.min(100, Math.round((count / total) * 100));
        return (
          <div
            key={tile.tier}
            className="relative overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-br from-white via-white to-stone-50 px-4 py-3"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.26em] text-stone-400">
              {tile.tier}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div
                className="font-display text-[30px] leading-none font-light text-stone-900"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatNumber(count)}
              </div>
              <span className={`font-mono text-[11px] ${tile.accent}`}>
                {pct}%
              </span>
            </div>
            <div className="mt-2 text-[13px] font-medium text-stone-900">
              {tile.title}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
              {tile.hint}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tile.bar}`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
