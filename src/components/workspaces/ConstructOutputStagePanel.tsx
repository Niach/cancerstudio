"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Btn, Callout, Chip } from "@/components/ui-kit";
import AuditCard from "@/components/workspaces/construct-output/AuditCard";
import CmoCard from "@/components/workspaces/construct-output/CmoCard";
import FastaHero from "@/components/workspaces/construct-output/FastaHero";
import VetCard from "@/components/workspaces/construct-output/VetCard";
import { api } from "@/lib/api";
import type { ConstructOutputStageSummary, Workspace } from "@/lib/types";

interface ConstructOutputStagePanelProps {
  workspace: Workspace;
  initialSummary: ConstructOutputStageSummary;
  onSummaryChange?: (summary: ConstructOutputStageSummary) => void;
}

export default function ConstructOutputStagePanel({
  workspace,
  initialSummary,
  onSummaryChange,
}: ConstructOutputStagePanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [submitting, setSubmitting] = useState(false);

  const push = useCallback(
    (next: ConstructOutputStageSummary) => {
      setSummary(next);
      onSummaryChange?.(next);
    },
    [onSummaryChange]
  );

  const handleRelease = useCallback(async () => {
    setSubmitting(true);
    try {
      const next = await api.updateConstructOutput(workspace.id, {
        action: "release",
        cmoId: summary.selectedCmo ?? summary.cmoOptions[0]?.id ?? null,
      });
      push(next);
    } finally {
      setSubmitting(false);
    }
  }, [workspace.id, summary.selectedCmo, summary.cmoOptions, push]);

  const handleDownload = useCallback(
    (format: "fasta" | "genbank" | "json") => {
      if (typeof window === "undefined") return;
      const content = renderDownload(summary, format);
      const blob = new Blob([content], { type: mimeFor(format) });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${summary.constructId}.${extensionFor(format)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    [summary]
  );

  const header = (
    <div className="cs-view-head">
      <div>
        <div className="cs-crumb">
          {workspace.displayName} / 08 Construct output
        </div>
        <h1 style={{ textWrap: "pretty", margin: "4px 0 0" }}>
          The vaccine, as a file.
        </h1>
        <p
          style={{
            maxWidth: "62ch",
            marginTop: 12,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: "var(--ink-2)",
          }}
        >
          Everything upstream collapses into one {summary.totalNt.toLocaleString()}
          -nucleotide string of text. Hand that text to any CMO with an IVT line and ≈10
          days later it comes back as a vial of mRNA ready to formulate into lipid
          nanoparticles.
        </p>
      </div>
      <div style={{ textAlign: "right", minWidth: 200 }}>
        {summary.status === "released" ? (
          <Chip kind="live">Stage 08 · Released</Chip>
        ) : (
          <Chip kind="scaffold">Stage 08 · Ready</Chip>
        )}
        <div
          style={{
            marginTop: 8,
            fontSize: 12.5,
            fontFamily: "var(--font-mono)",
            color: "var(--muted)",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {summary.constructId} · {summary.version}
        </div>
      </div>
    </div>
  );

  if (summary.status === "blocked") {
    return (
      <>
        {header}
        <Callout tone="warm" style={{ marginTop: 12 }}>
          <div>
            <strong>Confirm the construct design first.</strong>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-2)" }}>
              {summary.blockingReason ??
                "Confirm the construct design before generating the output."}
            </p>
            <div style={{ marginTop: 10 }}>
              <Link href={`/workspaces/${workspace.id}/construct-design`}>
                <Btn variant="primary" size="sm">
                  Go to construct design
                </Btn>
              </Link>
            </div>
          </div>
        </Callout>
      </>
    );
  }

  return (
    <>
      {header}

      <FastaHero
        summary={summary}
        onDownload={handleDownload}
        onRelease={handleRelease}
        submitting={submitting}
        released={summary.status === "released"}
      />

      <div className="cs-stage8-stack">
        <CmoCard
          order={summary.order ?? null}
          released={summary.status === "released"}
        />
        <VetCard dosing={summary.dosing} />
        <AuditCard trail={summary.auditTrail} onExport={() => handleDownload("json")} />
      </div>

      <div
        style={{
          marginTop: 28,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Btn
          variant="ghost"
          onClick={() => router.push(`/workspaces/${workspace.id}/construct-design`)}
        >
          ← Back to construct design
        </Btn>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--muted-2)",
            letterSpacing: "0.08em",
          }}
        >
          End of pipeline · {summary.checksum}
        </div>
      </div>
    </>
  );
}

function renderDownload(
  summary: ConstructOutputStageSummary,
  format: "fasta" | "genbank" | "json"
): string {
  if (format === "fasta") {
    const header = `> ${summary.constructId} | mRNA | ${summary.totalNt} nt | ${summary.species}\n`;
    const lines: string[] = [];
    for (let i = 0; i < summary.fullNt.length; i += 60) {
      lines.push(summary.fullNt.slice(i, i + 60));
    }
    return header + lines.join("\n") + "\n";
  }
  if (format === "json") {
    return JSON.stringify(summary, null, 2);
  }
  // Backend generates the real GenBank record via Biopython SeqIO — we just
  // hand it to the download. Empty string only in the blocked/loading state.
  return summary.genbank;
}

function mimeFor(format: "fasta" | "genbank" | "json"): string {
  if (format === "json") return "application/json";
  return "text/plain";
}

function extensionFor(format: "fasta" | "genbank" | "json"): string {
  if (format === "fasta") return "fasta";
  if (format === "genbank") return "gb";
  return "json";
}
