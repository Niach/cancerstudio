"use client";

import type { VafHistogramBin } from "@/lib/types";

interface VafDistributionProps {
  bins: VafHistogramBin[];
  meanVaf?: number | null;
  medianVaf?: number | null;
}

export default function VafDistribution({
  bins,
  meanVaf,
  medianVaf,
}: VafDistributionProps) {
  if (!bins.length) {
    return null;
  }
  const max = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div className="cs-card">
      <div className="cs-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="cs-mono-label">VAF spectrum</span>
          </div>
          <h3>Variant allele frequency</h3>
          <p className="cs-tiny" style={{ margin: "2px 0 0" }}>
            How mixed the tumor is — peak near 0.2–0.3 usually means a dominant
            clone.
          </p>
        </div>
        {meanVaf != null || medianVaf != null ? (
          <div
            style={{
              textAlign: "right",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {medianVaf != null ? (
              <div>median {(medianVaf * 100).toFixed(1)}%</div>
            ) : null}
            {meanVaf != null ? (
              <div style={{ color: "var(--muted-2)" }}>
                mean {(meanVaf * 100).toFixed(1)}%
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ padding: "18px 22px" }}>
        <div className="cs-vaf-bars">
          {bins.map((b, i) => {
            const h = Math.max(1, Math.round((b.count / max) * 100));
            return (
              <div
                key={i}
                className="cs-vaf-bar"
                style={{
                  height: `${h}%`,
                  opacity: 0.4 + (b.count / max) * 0.6,
                }}
                title={`${(b.binStart * 100).toFixed(0)}–${(b.binEnd * 100).toFixed(0)}% · ${b.count}`}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--muted-2)",
            letterSpacing: "0.14em",
          }}
        >
          <span>0.0</span>
          <span>0.25</span>
          <span>0.5</span>
          <span>0.75</span>
          <span>1.0</span>
        </div>
      </div>
    </div>
  );
}
