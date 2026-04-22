"use client";

import type { ChromosomeMetricsEntry } from "@/lib/types";

interface KaryogramProps {
  chromosomes: ChromosomeMetricsEntry[];
  referenceLabel?: string | null;
  hue?: number;
}

function isCanonicalChromosome(name: string) {
  const stripped = name.toLowerCase().startsWith("chr") ? name.slice(3) : name;
  if (/^\d+$/.test(stripped)) return true;
  return ["x", "y", "m", "mt"].includes(stripped.toLowerCase());
}

function chromKey(name: string) {
  const stripped = name.toLowerCase().startsWith("chr") ? name.slice(3) : name;
  const n = parseInt(stripped, 10);
  if (Number.isFinite(n)) return n;
  const order: Record<string, number> = { x: 1000, y: 1001, m: 1002, mt: 1002 };
  return order[stripped.toLowerCase()] ?? 9999;
}

export default function Karyogram({
  chromosomes,
  referenceLabel,
  hue = 152,
}: KaryogramProps) {
  const canonical = chromosomes.filter((c) => isCanonicalChromosome(c.chromosome));
  const tracks = (canonical.length ? canonical : chromosomes)
    .slice()
    .sort((a, b) => chromKey(a.chromosome) - chromKey(b.chromosome));
  if (!tracks.length) return null;

  const maxCount = Math.max(1, ...tracks.map((t) => t.total));
  const totalVariants = chromosomes.reduce((a, c) => a + c.total, 0);
  const hiddenContigCount = chromosomes.length - tracks.length;
  const hiddenVariantCount = chromosomes
    .filter((c) => !isCanonicalChromosome(c.chromosome))
    .reduce((a, c) => a + c.total, 0);

  const title = `Mutations across ${tracks.length} ${
    referenceLabel ? referenceLabel.split(" ")[0].toLowerCase() : ""
  } chromosomes`.replace(/\s+/g, " ").trim();

  return (
    <div className="cs-karyo">
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          color: "rgba(110, 231, 183, 0.8)",
        }}
      >
        Karyogram
        {referenceLabel ? (
          <span style={{ color: "rgba(231,236,243,0.5)", letterSpacing: "0.14em" }}>
            {" · "}
            {referenceLabel}
          </span>
        ) : null}
      </div>
      <h3
        style={{
          margin: "6px 0 14px",
          fontFamily: "var(--font-display)",
          fontWeight: 500,
          fontSize: 22,
          color: "#e7ecf3",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "6px 20px",
        }}
      >
        {tracks.map((c) => {
          const pct = Math.min(100, (c.total / maxCount) * 100);
          return (
            <div
              key={c.chromosome}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr 48px",
                alignItems: "center",
                gap: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
              }}
            >
              <span style={{ color: "rgba(231,236,243,0.5)", textAlign: "right" }}>
                {c.chromosome}
              </span>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "rgba(148,163,184,0.14)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, oklch(0.72 0.14 ${hue}), oklch(0.65 0.12 ${(hue + 40) % 360}))`,
                    borderRadius: 4,
                  }}
                />
              </div>
              <span style={{ color: "rgba(231,236,243,0.75)", textAlign: "right" }}>
                {c.total}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 16,
          fontSize: 11,
          color: "#58677a",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.14em",
        }}
      >
        <span style={{ textTransform: "uppercase", letterSpacing: "0.22em" }}>
          Variant count per chromosome →
        </span>
        <span>{totalVariants.toLocaleString()} total</span>
      </div>
      {hiddenContigCount > 0 ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#58677a",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.12em",
          }}
        >
          + {hiddenVariantCount.toLocaleString()} on{" "}
          {hiddenContigCount.toLocaleString()} unplaced contigs (not shown)
        </div>
      ) : null}
    </div>
  );
}
