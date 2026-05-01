"use client";

import { Card, MonoLabel } from "@/components/ui-kit";
import type { ConstructOutputOrder } from "@/lib/types";

interface CmoCardProps {
  order: ConstructOutputOrder | null;
  released: boolean;
}

export default function CmoCard({ order, released }: CmoCardProps) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ marginBottom: 6 }}>
          <MonoLabel>Manufacturing handoff</MonoLabel>
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "baseline",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: "-0.015em",
            }}
          >
            CMO partners — coming soon
          </h3>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-2)",
              padding: "3px 8px",
              borderRadius: 999,
              border: "1px solid var(--line-strong)",
              background: "var(--surface-sunk)",
            }}
          >
            Soon
          </span>
        </div>
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: "68ch",
            fontSize: 14,
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          The FASTA above is synthesis-ready for any IVT-capable contract manufacturer today — download it and email the file, just like Paul did for Rosie. One-click ordering with preferred partners (template synthesis, GMP-grade mRNA, capped IVT) will ship in a later release.
        </p>
      </div>

      <div style={{ padding: "18px 22px 22px" }}>
        <div className="mvx-cmo-ghost-grid">
          {[0, 1, 2].map((i) => (
            <GhostTile key={i} index={i} />
          ))}
        </div>

        {released && order ? (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: 12,
              background: "color-mix(in oklch, var(--accent) 10%, var(--surface-sunk))",
              border: "1px solid color-mix(in oklch, var(--accent) 35%, transparent)",
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--accent-ink)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                marginBottom: 4,
                fontWeight: 600,
              }}
            >
              ✓ Construct locked
            </div>
            Reference #{order.poNumber} · handoff recorded to the audit trail.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function GhostTile({ index }: { index: number }) {
  return (
    <div
      aria-hidden
      style={{
        padding: "18px 18px 20px",
        borderRadius: "var(--radius-mvx-lg, 16px)",
        background: "var(--surface-sunk)",
        border: "1px dashed var(--line-strong)",
        opacity: 0.75,
        minHeight: 132,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted-2)",
        }}
      >
        Partner {String(index + 1).padStart(2, "0")}
      </div>
      <div
        style={{
          height: 14,
          width: "62%",
          borderRadius: 4,
          background: "color-mix(in oklch, var(--ink) 8%, transparent)",
        }}
      />
      <div
        style={{
          height: 10,
          width: "42%",
          borderRadius: 4,
          background: "color-mix(in oklch, var(--ink) 6%, transparent)",
        }}
      />
      <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill />
        <Pill width={54} />
      </div>
    </div>
  );
}

function Pill({ width = 68 }: { width?: number }) {
  return (
    <div
      style={{
        height: 16,
        width,
        borderRadius: 999,
        background: "color-mix(in oklch, var(--ink) 5%, transparent)",
        border: "1px solid var(--line)",
      }}
    />
  );
}
