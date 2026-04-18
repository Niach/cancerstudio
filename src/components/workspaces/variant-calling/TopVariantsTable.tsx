"use client";

import type { TopVariantEntry } from "@/lib/types";

interface TopVariantsTableProps {
  variants: TopVariantEntry[];
}

export default function TopVariantsTable({ variants }: TopVariantsTableProps) {
  if (!variants.length) return null;

  return (
    <div className="cs-card">
      <div className="cs-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="cs-mono-label">Top variants</span>
          </div>
          <h3>Highest-confidence somatic calls</h3>
          <p className="cs-tiny" style={{ margin: "2px 0 0" }}>
            Sorted by VAF × depth — biggest signal first.
          </p>
        </div>
      </div>
      <div>
        <div
          className="cs-data-row cs-data-head"
          style={{
            gridTemplateColumns: "60px 1.4fr 1fr 1.2fr 1.4fr 1fr 80px",
          }}
        >
          <span>CHR</span>
          <span>LOCUS</span>
          <span>REF → ALT</span>
          <span>VAF</span>
          <span>FILTER</span>
          <span>T / N DEPTH</span>
          <span style={{ textAlign: "right" }}>STATUS</span>
        </div>
        {variants.map((v, i) => {
          const vaf = v.tumorVaf ?? 0;
          return (
            <div
              key={i}
              className="cs-data-row"
              style={{
                gridTemplateColumns: "60px 1.4fr 1fr 1.2fr 1.4fr 1fr 80px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: "var(--ink-2)",
                }}
              >
                {v.chromosome}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--muted)",
                }}
              >
                {v.position.toLocaleString()}
              </span>
              <span
                style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}
              >
                <span style={{ color: "var(--muted)" }}>{v.ref}</span>
                <span style={{ margin: "0 6px", color: "var(--muted-2)" }}>
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
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div
                  style={{
                    width: 60,
                    height: 5,
                    borderRadius: 999,
                    background:
                      "color-mix(in oklch, var(--ink) 6%, transparent)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${vaf * 100}%`,
                      height: "100%",
                      background: v.isPass ? "var(--accent)" : "var(--warm)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11.5,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink-2)",
                  }}
                >
                  {(vaf * 100).toFixed(1)}%
                </span>
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted-2)",
                }}
              >
                {v.filter}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--muted)",
                }}
              >
                {v.tumorDepth ?? "—"}× / {v.normalDepth ?? "—"}×
              </span>
              <span style={{ textAlign: "right" }}>
                {v.isPass ? (
                  <span className="cs-chip cs-chip-live">PASS</span>
                ) : (
                  <span
                    className="cs-chip"
                    style={{
                      background:
                        "color-mix(in oklch, var(--warm) 14%, transparent)",
                      color: "var(--warm)",
                    }}
                  >
                    filtered
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
