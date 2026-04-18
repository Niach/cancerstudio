"use client";

import { useState } from "react";

import type { FilterBreakdownEntry } from "@/lib/types";

interface FilterBreakdownProps {
  entries: FilterBreakdownEntry[];
  totalVariants: number;
}

interface Bucket {
  id: "pass" | "inherited" | "low_evidence" | "artifact";
  label: string;
  hint: string;
  color: string;
}

const BUCKETS: Bucket[] = [
  {
    id: "pass",
    label: "Kept",
    hint: "Passed every filter",
    color: "var(--accent)",
  },
  {
    id: "inherited",
    label: "Probably inherited",
    hint: "Looks like a normal genetic variant, not a cancer change",
    color: "var(--warm)",
  },
  {
    id: "low_evidence",
    label: "Low evidence",
    hint: "Too little signal to call confidently",
    color: "oklch(0.65 0.15 15)",
  },
  {
    id: "artifact",
    label: "Sequencing artifact",
    hint: "Looks like a reading glitch, not a real mutation",
    color: "oklch(0.65 0.18 330)",
  },
];

const INHERITED = new Set([
  "germline",
  "normal_artifact",
  "panel_of_normals",
]);
const LOW = new Set([
  "weak_evidence",
  "low_allele_frac",
  "base_qual",
  "map_qual",
  "fragment",
  "contamination",
]);
const ART = new Set([
  "strand_bias",
  "clustered_events",
  "haplotype",
  "duplicate",
  "slippage",
  "position",
  "n_ratio",
]);

function bucketOf(name: string, isPass: boolean): Bucket["id"] {
  if (isPass) return "pass";
  if (INHERITED.has(name)) return "inherited";
  if (LOW.has(name)) return "low_evidence";
  if (ART.has(name)) return "artifact";
  return "low_evidence";
}

export default function FilterBreakdown({
  entries,
  totalVariants,
}: FilterBreakdownProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  const tallies: Record<Bucket["id"], number> = {
    pass: 0,
    inherited: 0,
    low_evidence: 0,
    artifact: 0,
  };
  for (const e of entries) {
    const b = bucketOf(e.name, e.isPass);
    tallies[b] += e.count;
  }
  const total = Math.max(1, totalVariants);
  const passPct = Math.round((tallies.pass / total) * 100);

  return (
    <div className="cs-card">
      <div className="cs-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="cs-mono-label">Filter breakdown</span>
          </div>
          <h3>What we kept vs. set aside</h3>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 300,
              letterSpacing: "-0.01em",
              lineHeight: 1,
              color: "var(--ink)",
            }}
          >
            {passPct}%
          </div>
          <div className="cs-mono-label" style={{ fontSize: 9 }}>
            kept
          </div>
        </div>
      </div>
      <div style={{ padding: "16px 22px" }}>
        <div
          style={{
            display: "flex",
            height: 12,
            width: "100%",
            borderRadius: 999,
            overflow: "hidden",
            background: "color-mix(in oklch, var(--ink) 6%, transparent)",
          }}
        >
          {BUCKETS.map((b) => {
            const share = tallies[b.id] / total;
            if (share <= 0) return null;
            return (
              <div
                key={b.id}
                style={{
                  width: `${share * 100}%`,
                  background: b.color,
                  boxShadow:
                    b.id === "pass"
                      ? "inset 0 0 8px rgba(255,255,255,0.35)"
                      : undefined,
                  transition: "width 700ms ease",
                }}
                title={`${b.label} · ${tallies[b.id]}`}
              />
            );
          })}
        </div>

        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "16px 0 0",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {BUCKETS.map((b) =>
            tallies[b.id] > 0 ? (
              <li
                key={b.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  background: "var(--surface-sunk)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: b.color,
                      flexShrink: 0,
                      boxShadow: `0 0 8px ${b.color}`,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14.5,
                        fontWeight: 500,
                        color: "var(--ink)",
                      }}
                    >
                      {b.label}
                    </div>
                    <div className="cs-tiny" style={{ fontSize: 12.5 }}>
                      {b.hint}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13.5,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink-2)",
                    fontWeight: 500,
                  }}
                >
                  {tallies[b.id].toLocaleString()}
                </span>
              </li>
            ) : null
          )}
        </ul>

        <button
          type="button"
          onClick={() => setShowTechnical(!showTechnical)}
          style={{
            marginTop: 14,
            background: "transparent",
            border: "none",
            fontFamily: "inherit",
            fontSize: 11.5,
            color: "var(--muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: 0,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 0,
              height: 0,
              borderTop: "4px solid transparent",
              borderBottom: "4px solid transparent",
              borderLeft: "6px solid currentColor",
              transform: showTechnical ? "rotate(90deg)" : "none",
              transition: "transform 0.2s",
            }}
          />
          {showTechnical ? "Hide technical breakdown" : "Show technical breakdown"}
        </button>

        {showTechnical ? (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "10px 0 0",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {entries.map((e) => (
              <li
                key={e.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: "var(--surface-sunk)",
                  border: "1px solid var(--line)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "var(--ink-2)" }}>{e.name}</span>
                <span
                  style={{
                    color: "var(--muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {e.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
