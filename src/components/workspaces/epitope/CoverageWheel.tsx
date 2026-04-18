"use client";

import { useMemo } from "react";

import { Card, Eyebrow } from "@/components/ui-kit";
import type { EpitopeAllele, EpitopeCandidate } from "@/lib/types";

import { tierForIc50 } from "./scoring";

const W = 380;
const H = 380;
const CX = W / 2;
const CY = H / 2;
const INNER_R = 56;
const OUTER_R = 148;
const RING_STEPS = 3;

type Tier = "strong" | "moderate" | "weak";

interface Hit {
  peptide: EpitopeCandidate;
  ic50: number;
  tier: Tier;
}

interface CoverageWheelProps {
  picked: EpitopeCandidate[];
  alleles: EpitopeAllele[];
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
}

function polar(angle: number, r: number): [number, number] {
  return [CX + Math.cos(angle) * r, CY + Math.sin(angle) * r];
}

export default function CoverageWheel({
  picked,
  alleles,
  hoverId,
  setHoverId,
}: CoverageWheelProps) {
  const N = alleles.length;

  const hitsByAllele = useMemo(() => {
    const out: Record<string, Hit[]> = {};
    for (const allele of alleles) {
      const hits: Hit[] = [];
      for (const peptide of picked) {
        if (peptide.alleleId === allele.id) {
          const tier = tierForIc50(peptide.ic50Nm);
          if (tier) hits.push({ peptide, ic50: peptide.ic50Nm, tier });
        }
      }
      out[allele.id] = hits;
    }
    return out;
  }, [picked, alleles]);

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 8px" }}>
        <Eyebrow>Coverage wheel</Eyebrow>
        <h3
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "-0.02em",
          }}
        >
          Does the shortlist reach every allele?
        </h3>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          Each spoke is one of the patient&apos;s MHC alleles. Dots move outward
          by binding strength.
        </p>
      </div>

      <div
        style={{
          padding: "2px 10px 10px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", maxWidth: 360, height: "auto" }}
        >
          {[1, 2, 3].map((i) => {
            const r = INNER_R + ((OUTER_R - INNER_R) * i) / RING_STEPS;
            return (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
            );
          })}
          <circle
            cx={CX}
            cy={CY}
            r={INNER_R}
            fill="var(--surface-sunk)"
            stroke="var(--line-strong)"
          />

          {alleles.map((allele, i) => {
            const angle = -Math.PI / 2 + (i / N) * Math.PI * 2;
            const [lx, ly] = polar(angle, OUTER_R + 16);
            const [sx, sy] = polar(angle, INNER_R);
            const [ex, ey] = polar(angle, OUTER_R);
            const hits = hitsByAllele[allele.id] ?? [];
            const anchor =
              Math.cos(angle) > 0.1
                ? "start"
                : Math.cos(angle) < -0.1
                  ? "end"
                  : "middle";

            return (
              <g key={allele.id}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  stroke={allele.color}
                  strokeWidth={hits.length ? 1.5 : 0.8}
                  opacity={hits.length ? 0.8 : 0.3}
                />

                {hits.map((hit, hi) => {
                  const tIdx =
                    hit.tier === "strong" ? 3 : hit.tier === "moderate" ? 2 : 1;
                  const baseR =
                    INNER_R + ((OUTER_R - INNER_R) * tIdx) / RING_STEPS;
                  const sameTier = hits.filter((h) => h.tier === hit.tier);
                  const myIdx = sameTier.indexOf(hit);
                  const offset = (myIdx - (sameTier.length - 1) / 2) * 7;
                  const px = Math.cos(angle + Math.PI / 2) * offset;
                  const py = Math.sin(angle + Math.PI / 2) * offset;
                  const [dx, dy] = polar(angle, baseR);
                  const isHover = hoverId === hit.peptide.id;
                  return (
                    <g
                      key={hi}
                      onMouseEnter={() => setHoverId(hit.peptide.id)}
                      onMouseLeave={() => setHoverId(null)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={dx + px}
                        cy={dy + py}
                        r={isHover ? 8 : 5.5}
                        fill={allele.color}
                        stroke="var(--surface-strong)"
                        strokeWidth="1.5"
                        opacity={
                          hit.tier === "strong"
                            ? 1
                            : hit.tier === "moderate"
                              ? 0.78
                              : 0.5
                        }
                      />
                      {isHover ? (
                        <text
                          x={dx + px}
                          y={dy + py - 12}
                          textAnchor="middle"
                          fontFamily="var(--font-mono)"
                          fontSize="10"
                          fontWeight="700"
                          fill="var(--ink)"
                        >
                          {hit.peptide.gene} · {hit.ic50.toLocaleString()} nM
                        </text>
                      ) : null}
                    </g>
                  );
                })}

                <g transform={`translate(${lx}, ${ly})`}>
                  <text
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontFamily="var(--font-mono)"
                    fontSize="10.5"
                    fontWeight="600"
                    fill={hits.length ? "var(--ink)" : "var(--muted-2)"}
                  >
                    {allele.id}
                  </text>
                  <text
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    dy="12"
                    fontFamily="var(--font-mono)"
                    fontSize="9"
                    fill={allele.color}
                    letterSpacing="0.1em"
                  >
                    {hits.length} {hits.length === 1 ? "hit" : "hits"} · class{" "}
                    {allele.class}
                  </text>
                </g>
              </g>
            );
          })}

          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontSize="22"
            fontWeight="500"
            fill="var(--ink)"
            letterSpacing="-0.02em"
          >
            {picked.length}
          </text>
          <text
            x={CX}
            y={CY + 10}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--muted-2)"
            letterSpacing="0.16em"
            style={{ textTransform: "uppercase" }}
          >
            picked
          </text>
        </svg>
      </div>
    </Card>
  );
}
