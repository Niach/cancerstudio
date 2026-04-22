"use client";

import type { FilterBreakdownEntry } from "@/lib/types";

interface FilterBreakdownProps {
  entries: FilterBreakdownEntry[];
  totalVariants: number;
}

export default function FilterBreakdown({ entries }: FilterBreakdownProps) {
  const sorted = entries
    .slice()
    .sort((a, b) => {
      if (a.isPass !== b.isPass) return a.isPass ? -1 : 1;
      return b.count - a.count;
    });

  return (
    <div className="cs-card">
      <div className="cs-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="cs-mono-label">Filter breakdown</span>
          </div>
          <h3>Why variants were rejected</h3>
        </div>
      </div>
      <div style={{ padding: "10px 22px 18px" }}>
        {sorted.map((f) => (
          <div
            key={f.name}
            className="cs-spread"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid var(--line)",
              fontSize: 13,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: f.isPass ? "var(--accent-ink)" : "var(--muted)",
              }}
            >
              {f.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--ink-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {f.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
