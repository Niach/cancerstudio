"use client";

import { Card, MonoLabel } from "@/components/ui-kit";
import type { DosingProtocol } from "@/lib/types";

interface VetCardProps {
  dosing: DosingProtocol;
}

export default function VetCard({ dosing }: VetCardProps) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ marginBottom: 6 }}>
          <MonoLabel>For the vet</MonoLabel>
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          Dosing protocol
        </h3>
      </div>

      <div
        style={{
          padding: "16px 22px 22px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="mvx-dose-meta">
          <DoseMeta k="Formulation" v={dosing.formulation} />
          <DoseMeta k="Route" v={dosing.route} />
          <DoseMeta k="Dose" v={dosing.dose} />
        </div>

        <div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--muted-2)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              marginBottom: 10,
            }}
          >
            Schedule
          </div>
          <div className="mvx-dose-grid">
            {dosing.schedule.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background:
                    i === 0
                      ? "color-mix(in oklch, var(--accent) 10%, var(--surface-strong))"
                      : "var(--surface-sunk)",
                  border:
                    i === 0
                      ? "1px solid color-mix(in oklch, var(--accent) 35%, transparent)"
                      : "1px solid var(--line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minHeight: 86,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--muted-2)",
                  }}
                >
                  {s.when}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    lineHeight: 1.4,
                  }}
                >
                  {s.what}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "color-mix(in oklch, var(--warm) 6%, var(--surface-sunk))",
            border: "1px solid color-mix(in oklch, var(--warm) 18%, var(--line))",
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.55,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
              color: "var(--warm)",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Watch for
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 16,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {dosing.watchFor.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function DoseMeta({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--surface-sunk)",
        border: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--muted-2)",
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {k}
      </span>
      <span style={{ color: "var(--ink-2)", fontSize: 13, lineHeight: 1.45 }}>{v}</span>
    </div>
  );
}
