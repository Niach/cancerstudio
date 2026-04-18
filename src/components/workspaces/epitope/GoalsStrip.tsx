"use client";

import { Card, Eyebrow } from "@/components/ui-kit";
import type { EpitopeCandidate, EpitopeSafetyFlag } from "@/lib/types";

import { EPITOPE_GOALS } from "./epitope-goals";

interface GoalsStripProps {
  picked: EpitopeCandidate[];
  safety: Record<string, EpitopeSafetyFlag>;
}

export default function GoalsStrip({ picked, safety }: GoalsStripProps) {
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 8px" }}>
        <Eyebrow>What makes a good cassette</Eyebrow>
        <h3
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "-0.02em",
          }}
        >
          Six things to aim for.
        </h3>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "4px 14px 14px",
        }}
      >
        {EPITOPE_GOALS.map((goal) => {
          const ok = goal.check(picked, safety);
          return (
            <div
              key={goal.id}
              style={{
                padding: "10px 8px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <span
                style={{
                  flex: "0 0 22px",
                  height: 22,
                  borderRadius: 7,
                  background: ok
                    ? "color-mix(in oklch, #0f766e 18%, transparent)"
                    : "var(--surface-sunk)",
                  border: `1px solid ${ok ? "color-mix(in oklch, #0f766e 50%, transparent)" : "var(--line-strong)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: ok ? "#0f766e" : "var(--muted-2)",
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {ok ? "✓" : "–"}
              </span>
              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "var(--ink)",
                    lineHeight: 1.3,
                  }}
                >
                  {goal.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--muted-2)",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {goal.target}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
