"use client";

import type { TopVariantEntry } from "@/lib/types";

interface TopVariantsTableProps {
  variants: TopVariantEntry[];
}

function variantTypeLabel(v: TopVariantEntry) {
  switch (v.variantType) {
    case "insertion":
      return "insertion";
    case "deletion":
      return "deletion";
    case "mnv":
      return "mnv";
    default:
      return "snv";
  }
}

export default function TopVariantsTable({ variants }: TopVariantsTableProps) {
  if (!variants.length) return null;

  const gridTemplate =
    "1.1fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr";

  return (
    <div className="mvx-card">
      <div className="mvx-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="mvx-mono-label">Top variants</span>
          </div>
          <h3>Highest-impact mutations</h3>
          <p className="mvx-tiny" style={{ margin: "2px 0 0" }}>
            Sorted by VAF. PASS calls first.
          </p>
        </div>
      </div>
      <div style={{ padding: "0 8px 10px" }}>
        <div
          className="mvx-data-row mvx-data-head"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span>Chr:Pos</span>
          <span>Ref → Alt</span>
          <span>Type</span>
          <span style={{ textAlign: "right" }}>VAF</span>
          <span style={{ textAlign: "right" }}>T / N depth</span>
          <span style={{ textAlign: "right" }}>Filter</span>
        </div>
        {variants.map((v, i) => {
          const vaf = v.tumorVaf ?? 0;
          return (
            <div
              key={i}
              className="mvx-data-row"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                {v.chromosome}:{v.position.toLocaleString()}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
              >
                <span style={{ color: "var(--muted)" }}>{v.ref}</span>
                <span style={{ margin: "0 4px", color: "var(--muted-2)" }}>
                  →
                </span>
                <span
                  style={{
                    color:
                      v.variantType === "snv"
                        ? "var(--accent-ink)"
                        : "var(--cool)",
                    fontWeight: 600,
                  }}
                >
                  {v.alt}
                </span>
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted-2)",
                  textTransform: "lowercase",
                }}
              >
                {variantTypeLabel(v)}
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--ink-2)",
                }}
              >
                {(vaf * 100).toFixed(1)}%
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {v.tumorDepth ?? "—"}× / {v.normalDepth ?? "—"}×
              </span>
              <span
                style={{
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: v.isPass ? "var(--accent-ink)" : "var(--warm)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {v.isPass ? "PASS" : v.filter}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
