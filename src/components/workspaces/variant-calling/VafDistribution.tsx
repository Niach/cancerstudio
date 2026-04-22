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
  if (!bins.length) return null;
  const max = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div className="cs-card">
      <div className="cs-card-head">
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className="cs-mono-label">VAF distribution</span>
          </div>
          <h3>Variant allele frequency</h3>
          <p className="cs-tiny" style={{ margin: "2px 0 0" }}>
            Most tumor mutations cluster around 20–30% VAF — consistent with a
            mixed-clonality tumor biopsy.
          </p>
        </div>
        {medianVaf != null || meanVaf != null ? (
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
      <div style={{ padding: "16px 22px 22px" }}>
        <div className="cs-vaf-bars">
          {bins.map((b, i) => (
            <div
              key={i}
              className="cs-vaf-bar"
              style={{
                height: `${Math.max(1, Math.round((b.count / max) * 100))}%`,
              }}
              title={`${(b.binStart * 100).toFixed(0)}–${(b.binEnd * 100).toFixed(0)}% · ${b.count}`}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--muted-2)",
          }}
        >
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
