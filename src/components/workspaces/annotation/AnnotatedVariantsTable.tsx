"use client";

import { useMemo, useState } from "react";

import type { AnnotatedVariantEntry, AnnotationImpactTier } from "@/lib/types";

interface AnnotatedVariantsTableProps {
  variants: AnnotatedVariantEntry[];
  defaultFilter?: FilterKey;
}

type FilterKey = "all" | "cancer" | "high";

const IMPACT_PILL: Record<AnnotationImpactTier, { bg: string; text: string; label: string }> = {
  HIGH: { bg: "bg-rose-50", text: "text-rose-700", label: "high" },
  MODERATE: { bg: "bg-amber-50", text: "text-amber-700", label: "moderate" },
  LOW: { bg: "bg-sky-50", text: "text-sky-700", label: "low" },
  MODIFIER: { bg: "bg-stone-100", text: "text-stone-500", label: "modifier" },
};

function formatPosition(value: number) {
  return value.toLocaleString();
}

function truncate(value: string, max = 10) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export default function AnnotatedVariantsTable({
  variants,
  defaultFilter = "cancer",
}: AnnotatedVariantsTableProps) {
  const [filter, setFilter] = useState<FilterKey>(
    variants.some((v) => v.inCancerGene) ? defaultFilter : "all"
  );

  const filtered = useMemo(() => {
    if (filter === "cancer") return variants.filter((v) => v.inCancerGene);
    if (filter === "high") return variants.filter((v) => v.impact === "HIGH");
    return variants;
  }, [variants, filter]);

  const counts: Record<FilterKey, number> = {
    all: variants.length,
    cancer: variants.filter((v) => v.inCancerGene).length,
    high: variants.filter((v) => v.impact === "HIGH").length,
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-stone-100 px-4 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Annotated mutations
          </div>
          <h4 className="mt-0.5 font-display text-[18px] font-light text-stone-900">
            Top {filtered.length} of {variants.length}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              { key: "cancer" as const, label: "Cancer genes" },
              { key: "high" as const, label: "High impact" },
              { key: "all" as const, label: "All" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                filter === chip.key
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
              }`}
              disabled={counts[chip.key] === 0 && filter !== chip.key}
            >
              {chip.label} · {counts[chip.key]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-6 text-sm text-stone-500">
          No variants match this filter.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-400">
                <th className="px-2 py-2 text-left">Gene</th>
                <th className="px-2 py-2 text-left">Protein change</th>
                <th className="px-2 py-2 text-left">Impact</th>
                <th className="px-2 py-2 text-left">What changed</th>
                <th className="px-2 py-2 text-right">VAF</th>
                <th className="px-2 py-2 text-right">Locus</th>
              </tr>
            </thead>
            <tbody className="font-[500] text-stone-700">
              {filtered.map((variant, index) => {
                const pill = IMPACT_PILL[variant.impact];
                const proteinChange =
                  variant.hgvsp?.split(":").pop() ||
                  variant.hgvsc?.split(":").pop() ||
                  "—";
                return (
                  <tr
                    key={`${variant.chromosome}-${variant.position}-${variant.alt}-${index}`}
                    className="border-t border-stone-100 transition-colors hover:bg-stone-50"
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-[13px] font-semibold text-stone-900">
                          {variant.geneSymbol ?? "—"}
                        </span>
                        {variant.inCancerGene ? (
                          <span
                            title="On the curated cancer gene list"
                            className="rounded-sm bg-emerald-50 px-1 font-mono text-[9px] uppercase tracking-[0.16em] text-emerald-700"
                          >
                            cancer
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="px-2 py-2 font-mono text-[11px]"
                      title={variant.hgvsp ?? variant.hgvsc ?? ""}
                    >
                      {truncate(proteinChange, 18)}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${pill.bg} ${pill.text}`}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-stone-600">
                      {variant.consequenceLabel}
                    </td>
                    <td
                      className="px-2 py-2 text-right font-mono text-[11px] text-stone-700"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {variant.tumorVaf != null
                        ? `${(variant.tumorVaf * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td
                      className="px-2 py-2 text-right font-mono text-[10px] text-stone-400"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {variant.chromosome}:{formatPosition(variant.position)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
