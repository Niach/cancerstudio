"use client";

import { useState } from "react";

import type { FilterBreakdownEntry } from "@/lib/types";

interface FilterBreakdownProps {
  entries: FilterBreakdownEntry[];
  totalVariants: number;
}

type BucketId = "pass" | "inherited" | "low_evidence" | "artifact" | "combined" | "other";

interface Bucket {
  id: BucketId;
  label: string;
  hint: string;
  tone: string;
}

const BUCKETS: Record<BucketId, Bucket> = {
  pass: {
    id: "pass",
    label: "Kept",
    hint: "Passed every filter",
    tone: "bg-emerald-400",
  },
  inherited: {
    id: "inherited",
    label: "Probably inherited",
    hint: "Looks like a normal genetic variant, not a cancer change",
    tone: "bg-amber-400",
  },
  low_evidence: {
    id: "low_evidence",
    label: "Low evidence",
    hint: "Too little signal to call confidently",
    tone: "bg-rose-400",
  },
  artifact: {
    id: "artifact",
    label: "Sequencing artifact",
    hint: "Looks like a reading glitch, not a real mutation",
    tone: "bg-fuchsia-400",
  },
  combined: {
    id: "combined",
    label: "Multiple flags",
    hint: "Flagged by more than one filter",
    tone: "bg-stone-400",
  },
  other: {
    id: "other",
    label: "Other",
    hint: "Uncategorized filters",
    tone: "bg-violet-400",
  },
};

const INHERITED_FLAGS = new Set([
  "germline",
  "normal_artifact",
  "panel_of_normals",
]);

const LOW_EVIDENCE_FLAGS = new Set([
  "weak_evidence",
  "low_allele_frac",
  "base_qual",
  "map_qual",
  "fragment",
  "contamination",
]);

const ARTIFACT_FLAGS = new Set([
  "strand_bias",
  "clustered_events",
  "haplotype",
  "duplicate",
  "slippage",
  "position",
  "n_ratio",
]);

function bucketForFilter(name: string, isPass: boolean): BucketId {
  if (isPass) return "pass";
  if (name.includes(";")) return "combined";
  if (INHERITED_FLAGS.has(name)) return "inherited";
  if (LOW_EVIDENCE_FLAGS.has(name)) return "low_evidence";
  if (ARTIFACT_FLAGS.has(name)) return "artifact";
  return "other";
}

function humanizeFilter(name: string) {
  if (name === ".") return "unmarked";
  if (name === "PASS") return "PASS";
  return name.replace(/_/g, " ");
}

interface BucketTotal {
  bucket: Bucket;
  count: number;
  entries: FilterBreakdownEntry[];
}

function aggregate(entries: FilterBreakdownEntry[]): BucketTotal[] {
  const map = new Map<BucketId, BucketTotal>();
  for (const entry of entries) {
    const id = bucketForFilter(entry.name, entry.isPass);
    const existing = map.get(id);
    if (existing) {
      existing.count += entry.count;
      existing.entries.push(entry);
    } else {
      map.set(id, {
        bucket: BUCKETS[id],
        count: entry.count,
        entries: [entry],
      });
    }
  }
  const order: BucketId[] = [
    "pass",
    "inherited",
    "low_evidence",
    "artifact",
    "combined",
    "other",
  ];
  return order
    .map((id) => map.get(id))
    .filter((value): value is BucketTotal => value !== undefined && value.count > 0);
}

export default function FilterBreakdown({ entries, totalVariants }: FilterBreakdownProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!entries.length || totalVariants === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-5 text-sm text-stone-500">
        No filter breakdown available.
      </div>
    );
  }

  const buckets = aggregate(entries);
  const passCount = buckets.find((bucket) => bucket.bucket.id === "pass")?.count ?? 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Filter breakdown
          </div>
          <h4 className="mt-1 font-display text-[18px] font-light text-stone-900">
            What we kept vs. set aside
          </h4>
        </div>
        <div className="text-right">
          <div className="font-display text-[20px] leading-none font-light text-stone-900">
            {Math.round((passCount / totalVariants) * 100)}%
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-stone-400">
            kept
          </div>
        </div>
      </div>

      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
        {buckets.map((bucketTotal) => {
          const share = Math.max(0, bucketTotal.count / totalVariants);
          if (share <= 0) return null;
          return (
            <div
              key={bucketTotal.bucket.id}
              className={`${bucketTotal.bucket.tone} transition-[width] duration-700`}
              style={{
                width: `${share * 100}%`,
                boxShadow:
                  bucketTotal.bucket.id === "pass"
                    ? "inset 0 0 8px rgba(255,255,255,0.35)"
                    : undefined,
              }}
              title={`${bucketTotal.bucket.label} · ${bucketTotal.count.toLocaleString()}`}
            />
          );
        })}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {buckets.map((bucketTotal) => (
          <li
            key={bucketTotal.bucket.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 bg-stone-50/60 px-2.5 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-block size-1.5 shrink-0 rounded-full ${bucketTotal.bucket.tone}`}
              />
              <div className="min-w-0">
                <div className="truncate text-[12px] text-stone-700">
                  {bucketTotal.bucket.label}
                </div>
                <div className="truncate text-[11px] text-stone-500">
                  {bucketTotal.bucket.hint}
                </div>
              </div>
            </div>
            <span
              className="font-mono text-[11px] tracking-[0.14em] text-stone-500"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {bucketTotal.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-stone-100 pt-3">
        <button
          type="button"
          onClick={() => setShowTechnical((value) => !value)}
          aria-expanded={showTechnical}
          className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 transition hover:text-stone-800"
        >
          <span
            className={`inline-block size-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform duration-200 ${
              showTechnical ? "rotate-90" : ""
            }`}
          />
          {showTechnical ? "Hide technical breakdown" : "Show technical breakdown"}
        </button>

        {showTechnical ? (
          <ul className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-stone-600 sm:grid-cols-2">
            {entries.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center justify-between gap-3 rounded-md border border-stone-100 bg-white px-2 py-1"
              >
                <span className="truncate font-mono text-[11px] text-stone-700">
                  {humanizeFilter(entry.name)}
                </span>
                <span
                  className="font-mono text-[10px] tracking-[0.14em] text-stone-500"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {entry.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
