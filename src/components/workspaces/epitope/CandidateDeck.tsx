"use client";

import { useMemo } from "react";

import { Card, Eyebrow } from "@/components/ui-kit";
import type { EpitopeCandidate, EpitopeSafetyFlag } from "@/lib/types";

import { CLASS_COLOR, RISK_COLOR } from "./colors";
import { scoreCandidate } from "./scoring";

export type DeckFilter = "all" | "strong" | "cancer" | "classI" | "classII";
export type DeckSort = "score" | "ic50" | "vaf";

interface CandidateDeckProps {
  candidates: EpitopeCandidate[];
  picks: string[];
  safety: Record<string, EpitopeSafetyFlag>;
  filter: DeckFilter;
  sort: DeckSort;
  hoverId: string | null;
  onToggle: (id: string) => void;
  setFilter: (filter: DeckFilter) => void;
  setSort: (sort: DeckSort) => void;
  setHoverId: (id: string | null) => void;
}

const FILTER_CHIPS: { key: DeckFilter; label: string }[] = [
  { key: "all", label: "All 43" },
  { key: "strong", label: "Strong binders" },
  { key: "cancer", label: "Cancer genes" },
  { key: "classI", label: "Class I" },
  { key: "classII", label: "Class II" },
];

const SORT_CHIPS: { key: DeckSort; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "ic50", label: "IC50" },
  { key: "vaf", label: "VAF" },
];

export default function CandidateDeck({
  candidates,
  picks,
  safety,
  filter,
  sort,
  hoverId,
  onToggle,
  setFilter,
  setSort,
  setHoverId,
}: CandidateDeckProps) {
  const deck = useMemo(() => {
    let list = candidates.slice();
    if (filter === "cancer") list = list.filter((c) => c.cancerGene);
    if (filter === "classI") list = list.filter((c) => c.class === "I");
    if (filter === "classII") list = list.filter((c) => c.class === "II");
    if (filter === "strong") list = list.filter((c) => c.tier === "strong");
    list.sort((a, b) => {
      if (sort === "ic50") return a.ic50Nm - b.ic50Nm;
      if (sort === "vaf") return b.vaf - a.vaf;
      return scoreCandidate(b, safety) - scoreCandidate(a, safety);
    });
    return list;
  }, [candidates, filter, sort, safety]);

  const maxScore = useMemo(
    () =>
      deck.reduce((m, c) => Math.max(m, scoreCandidate(c, safety)), 0) || 1,
    [deck, safety],
  );

  const pickedSet = useMemo(() => new Set(picks), [picks]);

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "18px 22px 8px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 220 }}>
          <Eyebrow>Candidates · {candidates.length} peptides</Eyebrow>
          <h3
            style={{
              margin: "6px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Click a peptide to add or remove it from the cassette.
          </h3>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {FILTER_CHIPS.map((c) => (
            <button
              type="button"
              key={c.key}
              onClick={() => setFilter(c.key)}
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                border:
                  filter === c.key
                    ? "1.5px solid var(--accent)"
                    : "1px solid var(--line)",
                background:
                  filter === c.key
                    ? "color-mix(in oklch, var(--accent) 10%, var(--surface-strong))"
                    : "var(--surface-strong)",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                fontWeight: 600,
                color:
                  filter === c.key ? "var(--accent-ink)" : "var(--muted)",
                cursor: "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "6px 22px 4px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--muted-2)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        <span>Sort</span>
        {SORT_CHIPS.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => setSort(c.key)}
            style={{
              padding: "3px 8px",
              borderRadius: 6,
              border: "none",
              background:
                sort === c.key
                  ? "color-mix(in oklch, var(--ink) 8%, transparent)"
                  : "transparent",
              fontFamily: "inherit",
              fontSize: 10.5,
              color: sort === c.key ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div
        style={{
          maxHeight: 520,
          overflowY: "auto",
          borderTop: "1px solid var(--line)",
        }}
      >
        {deck.map((p) => {
          const picked = pickedSet.has(p.id);
          const sc = scoreCandidate(p, safety);
          const pct = (sc / maxScore) * 100;
          const risk = safety[p.id]?.risk ?? null;
          return (
            <div
              key={p.id}
              onMouseEnter={() => setHoverId(p.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onToggle(p.id)}
              style={{
                padding: "10px 22px",
                display: "grid",
                gridTemplateColumns: "22px 1.4fr 1fr 0.8fr 0.7fr 0.7fr 28px",
                gap: 12,
                alignItems: "center",
                borderBottom: "1px solid var(--line)",
                cursor: "pointer",
                background: picked
                  ? "color-mix(in oklch, var(--accent) 7%, var(--surface-strong))"
                  : hoverId === p.id
                    ? "var(--surface-sunk)"
                    : "var(--surface-strong)",
                transition: "background 120ms ease",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  background: picked ? "var(--accent)" : "var(--surface-strong)",
                  border: `1.5px solid ${picked ? "var(--accent)" : "var(--line-strong)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {picked ? "✓" : ""}
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--ink)",
                      letterSpacing: "0.02em",
                      background: picked ? "transparent" : "var(--surface-sunk)",
                      padding: picked ? 0 : "2px 6px",
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 180,
                    }}
                  >
                    {p.seq}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 3,
                      color: CLASS_COLOR[p.class],
                      background: `color-mix(in oklch, ${CLASS_COLOR[p.class]} 14%, transparent)`,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {p.class}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    color: "var(--muted)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      color: p.cancerGene ? "var(--ink-2)" : "var(--muted-2)",
                    }}
                  >
                    {p.gene}
                  </span>
                  {" · "}
                  {p.mutation}
                  {p.driverContext ? (
                    <span style={{ color: "var(--muted-2)" }}>
                      {" "}— {p.driverContext}
                    </span>
                  ) : null}
                </div>
              </div>

              <div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: "var(--surface-sunk)",
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background:
                        risk === "critical"
                          ? "linear-gradient(90deg, #dc262680, #dc2626)"
                          : risk === "elevated"
                            ? "linear-gradient(90deg, #d9770680, #d97706)"
                            : "linear-gradient(90deg, #0f766e80, #0f766e)",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--muted-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  score {sc.toFixed(2)}
                </div>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {p.alleleId.replace("DLA-", "")}
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted-2)",
                    marginTop: 2,
                  }}
                >
                  {p.ic50Nm} nM
                </div>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  color: "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                VAF {(p.vaf * 100).toFixed(0)}%
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted-2)",
                    marginTop: 2,
                  }}
                >
                  TPM {p.tpm.toFixed(0)}
                </div>
              </div>

              <div>
                {risk ? (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: RISK_COLOR[risk].bg,
                      color: RISK_COLOR[risk].fg,
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    ⚠ {RISK_COLOR[risk].label}
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--muted-2)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    safe
                  </span>
                )}
              </div>

              <span
                style={{
                  color: "var(--muted-2)",
                  fontSize: 14,
                  textAlign: "right",
                }}
              >
                {picked ? "−" : "+"}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
