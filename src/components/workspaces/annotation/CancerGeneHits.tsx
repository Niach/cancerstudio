"use client";

import type { AnnotationImpactTier, CancerGeneHit } from "@/lib/types";

interface CancerGeneHitsProps {
  hits: CancerGeneHit[];
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
}

const IMPACT_TONE: Record<AnnotationImpactTier, { stripe: string; label: string; text: string }> = {
  HIGH: {
    stripe: "from-rose-300 via-rose-500 to-rose-600",
    label: "high impact",
    text: "text-rose-700",
  },
  MODERATE: {
    stripe: "from-amber-300 via-amber-500 to-amber-600",
    label: "moderate impact",
    text: "text-amber-700",
  },
  LOW: {
    stripe: "from-sky-300 via-sky-500 to-sky-600",
    label: "low impact",
    text: "text-sky-700",
  },
  MODIFIER: {
    stripe: "from-stone-200 via-stone-400 to-stone-500",
    label: "modifier",
    text: "text-stone-600",
  },
};

function plainConsequence(raw: string | null | undefined) {
  if (!raw) return null;
  return raw.split("&")[0].replace(/_/g, " ");
}

export default function CancerGeneHits({
  hits,
  selectedSymbol,
  onSelect,
}: CancerGeneHitsProps) {
  if (!hits.length) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
          Cancer gene matches
        </div>
        <p className="mt-2 text-sm text-stone-500">
          No mutations landed in the known cancer-gene list for this run.
        </p>
        <p className="mt-1 text-[12px] text-stone-400">
          This happens often with low mutation counts and is not a reason to worry.
          All annotated mutations remain available below.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-stone-100 px-4 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Cancer gene matches
          </div>
          <h4 className="mt-0.5 font-display text-[18px] font-light text-stone-900">
            {hits.length} gene{hits.length === 1 ? "" : "s"} hit in this tumor
          </h4>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
          click a card to focus
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {hits.map((hit) => {
          const tone = IMPACT_TONE[hit.highestImpact];
          const isSelected = selectedSymbol === hit.symbol;
          const change =
            hit.topHgvsp?.split(":").pop() ||
            plainConsequence(hit.topConsequence) ||
            "—";
          return (
            <button
              key={hit.symbol}
              type="button"
              onClick={() => onSelect?.(hit.symbol)}
              className={`group relative overflow-hidden rounded-2xl border bg-white px-4 py-3 text-left transition ${
                isSelected
                  ? "border-emerald-500 ring-2 ring-emerald-200"
                  : "border-stone-200 hover:border-stone-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-[22px] leading-none font-semibold tracking-wide text-stone-900">
                    {hit.symbol}
                  </div>
                  <div className="mt-1 text-[11px] text-stone-500">{hit.role}</div>
                </div>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-stone-600">
                  {hit.variantCount}× mut
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.2em] ${tone.text}`}
                >
                  {tone.label}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full w-full bg-gradient-to-r ${tone.stripe}`} />
                </div>
              </div>

              <div
                className="mt-2 truncate font-mono text-[11px] text-stone-700"
                title={hit.topHgvsp ?? hit.topConsequence ?? ""}
              >
                {change}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
