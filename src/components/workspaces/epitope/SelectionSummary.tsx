"use client";

import { Card, Eyebrow, MonoLabel } from "@/components/ui-kit";
import type { EpitopeAllele, EpitopeCandidate } from "@/lib/types";

import { CLASS_COLOR } from "./colors";

interface SelectionSummaryProps {
  picked: EpitopeCandidate[];
  alleles: EpitopeAllele[];
}

export default function SelectionSummary({
  picked,
  alleles,
}: SelectionSummaryProps) {
  const genes = new Set(picked.map((p) => p.gene));
  const pickedAlleles = new Set(picked.map((p) => p.alleleId));
  const missing = alleles.filter((a) => !pickedAlleles.has(a.id));
  const classI = picked.filter((p) => p.class === "I").length;
  const classII = picked.filter((p) => p.class === "II").length;
  const driverTop = picked
    .filter((p) => p.cancerGene)
    .slice()
    .sort((a, b) => b.vaf - a.vaf)
    .slice(0, 3);
  const totalAA = picked.reduce((a, p) => a + p.length + 3, 0);
  const linkerCount = Math.max(0, picked.length - 1);

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "18px 22px 10px" }}>
        <Eyebrow>In plain English</Eyebrow>
        <h3
          style={{
            margin: "6px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "-0.02em",
          }}
        >
          What this cassette does
        </h3>
      </div>

      <div
        style={{
          padding: "0 22px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ink-2)",
          }}
        >
          The vaccine will teach the immune system to recognize{" "}
          <strong>{genes.size} driver genes</strong> (
          {Array.from(genes).slice(0, 4).join(", ")}
          {genes.size > 4 ? ", …" : ""}). It uses <strong>{classI}</strong>{" "}
          short peptide{classI === 1 ? "" : "s"} for killer T cells and{" "}
          <strong>{classII}</strong> longer peptide{classII === 1 ? "" : "s"}{" "}
          for helper T cells. The final cassette is {totalAA} amino acids
          long, including {linkerCount} linker{linkerCount === 1 ? "" : "s"}.
        </p>

        <div>
          <MonoLabel>Anchored in</MonoLabel>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 6,
            }}
          >
            {driverTop.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--surface-sunk)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 24,
                    borderRadius: 2,
                    background: CLASS_COLOR[p.class],
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--ink)",
                    }}
                  >
                    {p.gene}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--muted)",
                    }}
                  >
                    {p.mutation} · {p.driverContext ?? "—"}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--muted-2)",
                  }}
                >
                  <div style={{ color: "var(--ink-2)", fontWeight: 600 }}>
                    {(p.vaf * 100).toFixed(0)}% VAF
                  </div>
                  <div style={{ marginTop: 2 }}>TPM {p.tpm.toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {missing.length > 0 ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border:
                "1px solid color-mix(in oklch, #d97706 30%, transparent)",
              background:
                "color-mix(in oklch, #d97706 6%, var(--surface-strong))",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              <MonoLabel style={{ color: "#b45309" }}>Allele gap</MonoLabel>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.5,
              }}
            >
              No peptide currently covers{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                }}
              >
                {missing.map((m) => m.id).join(", ")}
              </span>
              . The vaccine will still work — just not for tumor cells that
              only present via{" "}
              {missing.length === 1 ? "that allele" : "those alleles"}.
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--surface-sunk)",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              <MonoLabel>Class balance</MonoLabel>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.4,
              }}
            >
              <strong>{classI}</strong> class I · <strong>{classII}</strong>{" "}
              class II
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--surface-sunk)",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              <MonoLabel>Cassette size</MonoLabel>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--ink-2)",
                lineHeight: 1.4,
              }}
            >
              {totalAA} aa · {linkerCount} linkers
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
