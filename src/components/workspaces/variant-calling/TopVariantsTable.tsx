"use client";

import type { TopVariantEntry } from "@/lib/types";

interface TopVariantsTableProps {
  variants: TopVariantEntry[];
}

function variantTypeAbbrev(kind: TopVariantEntry["variantType"]) {
  if (kind === "snv") return "SNV";
  if (kind === "insertion") return "INS";
  if (kind === "deletion") return "DEL";
  return "MNV";
}

function truncateAllele(value: string, max = 10) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatPosition(value: number) {
  return value.toLocaleString();
}

function vafBarWidth(vaf?: number | null) {
  if (vaf == null) return 0;
  return Math.max(2, Math.min(100, vaf * 100));
}

export default function TopVariantsTable({ variants }: TopVariantsTableProps) {
  if (!variants.length) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-5 text-sm text-stone-500">
        No PASS variants yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Leading PASS variants
          </div>
          <h4 className="mt-1 font-display text-[18px] font-light text-stone-900">
            Top {variants.length} by tumor VAF
          </h4>
        </div>
      </div>

      <div className="mt-3 max-h-[360px] overflow-y-auto px-2 pb-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-400">
              <th className="px-2 py-2 text-left">Locus</th>
              <th className="px-2 py-2 text-left">Change</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Tumor VAF</th>
              <th className="px-2 py-2 text-right">DP T/N</th>
            </tr>
          </thead>
          <tbody className="font-[500] text-stone-700">
            {variants.map((variant, index) => (
              <tr
                key={`${variant.chromosome}-${variant.position}-${variant.alt}-${index}`}
                className="border-t border-stone-100 transition-colors hover:bg-stone-50"
              >
                <td className="px-2 py-2 font-mono text-[11px] tracking-wide text-stone-800">
                  <div className="flex items-baseline gap-1">
                    <span className="text-stone-500">{variant.chromosome}</span>
                    <span className="text-stone-900">:</span>
                    <span>{formatPosition(variant.position)}</span>
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-[11px]">
                  <span className="text-rose-700/70">{truncateAllele(variant.ref)}</span>
                  <span className="mx-1 text-stone-400">→</span>
                  <span className="text-emerald-700/80">{truncateAllele(variant.alt)}</span>
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${
                      variant.variantType === "snv"
                        ? "bg-emerald-50 text-emerald-700"
                        : variant.variantType === "insertion"
                          ? "bg-sky-50 text-sky-700"
                          : variant.variantType === "deletion"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-violet-50 text-violet-700"
                    }`}
                  >
                    {variantTypeAbbrev(variant.variantType)}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-[11px] text-stone-800"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {variant.tumorVaf != null
                        ? `${(variant.tumorVaf * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                    {variant.tumorVaf != null ? (
                      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                          style={{ width: `${vafBarWidth(variant.tumorVaf)}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                </td>
                <td
                  className="px-2 py-2 text-right font-mono text-[11px] text-stone-500"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {variant.tumorDepth ?? "—"}{" / "}
                  {variant.normalDepth ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
