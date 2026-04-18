"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import FilterBreakdown from "@/components/workspaces/variant-calling/FilterBreakdown";
import Karyogram from "@/components/workspaces/variant-calling/Karyogram";
import MetricsRibbon from "@/components/workspaces/variant-calling/MetricsRibbon";
import TopVariantsTable from "@/components/workspaces/variant-calling/TopVariantsTable";
import VafDistribution from "@/components/workspaces/variant-calling/VafDistribution";
import Helix from "@/components/helix/Helix";
import {
  Btn,
  Callout,
  Card,
  CardHead,
  Chip,
  Dot,
  Eyebrow,
} from "@/components/ui-kit";
import { useTweaks } from "@/components/dev/TweaksProvider";
import {
  api,
  InsufficientMemoryError,
  MissingToolsError,
  StageNotActionableError,
} from "@/lib/api";
import type {
  VariantCallingStageSummary,
  Workspace,
} from "@/lib/types";

interface VariantCallingStagePanelProps {
  workspace: Workspace;
  initialSummary: VariantCallingStageSummary;
}

export default function VariantCallingStagePanel({
  workspace,
  initialSummary,
}: VariantCallingStagePanelProps) {
  const { tweaks } = useTweaks();
  const [summary, setSummary] = useState(initialSummary);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [missingTools, setMissingTools] = useState<{ tools: string[]; hints: string[] } | null>(
    null
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setSummary(initialSummary);
    setActionError(null);
    setMissingTools(null);
  }, [initialSummary]);

  useEffect(() => {
    if (summary.status !== "running" && summary.status !== "paused") return;
    const timer = window.setInterval(() => {
      void api
        .getVariantCallingStageSummary(workspace.id)
        .then(setSummary)
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [summary.status, workspace.id]);

  const latestRun = summary.latestRun;
  const metrics = latestRun?.metrics ?? null;
  const status = summary.status;

  const runAction = useCallback(
    async (action: () => Promise<VariantCallingStageSummary>) => {
      setSubmitting(true);
      setActionError(null);
      setMissingTools(null);
      try {
        const next = await action();
        setSummary(next);
      } catch (err) {
        if (err instanceof MissingToolsError) {
          setMissingTools({ tools: err.tools, hints: err.hints });
        } else if (err instanceof InsufficientMemoryError) {
          setActionError(err.message);
        } else if (err instanceof StageNotActionableError) {
          setActionError(err.message);
        } else if (err instanceof Error) {
          setActionError(err.message);
        } else {
          setActionError("Unable to complete the action.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  if (status === "blocked") {
    return (
      <>
        <div className="cs-view-head">
          <div>
            <div className="cs-crumb">
              {workspace.displayName} / 03 Variant calling
            </div>
            <h1>Variant calling is locked for now.</h1>
          </div>
          <Chip kind="live">Stage 03 · Live</Chip>
        </div>
        <Callout tone="warm">
          <Dot style={{ color: "var(--warm)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              {summary.blockingReason ?? "Finish alignment cleanly first."}
            </div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              We&apos;ll unlock this step once the alignment run passes QC.
            </p>
          </div>
        </Callout>
      </>
    );
  }

  if (status === "scaffolded" || (!latestRun && status !== "running")) {
    return (
      <>
        <div className="cs-view-head">
          <div>
            <div className="cs-crumb">
              {workspace.displayName} / 03 Variant calling
            </div>
            <h1>Find the cancer-specific mutations.</h1>
          </div>
          <Chip kind="live">Stage 03 · Live</Chip>
        </div>
        <Card>
          <div
            style={{
              padding: "36px 32px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <Eyebrow>One click</Eyebrow>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 500,
                  margin: "6px 0 10px",
                  letterSpacing: "-0.02em",
                  color: "var(--ink)",
                }}
              >
                Compare the tumor to the healthy sample.
              </h2>
              <p
                style={{
                  fontSize: 16,
                  maxWidth: "54ch",
                  lineHeight: 1.7,
                  color: "var(--ink-2)",
                }}
              >
                We compare the tumor DNA to the healthy sample and pull out
                what&apos;s cancer-specific — ignoring the everyday variations
                your pet was born with.
              </p>
              <div style={{ marginTop: 18 }}>
                <Btn
                  data-testid="variant-calling-run-button"
                  disabled={submitting}
                  onClick={() => void runAction(() => api.runVariantCalling(workspace.id))}
                >
                  {submitting ? "Starting…" : "Find mutations"}
                </Btn>
              </div>
              {actionError ? (
                <p
                  className="cs-tiny"
                  style={{ marginTop: 10, color: "var(--danger)" }}
                >
                  {actionError}
                </p>
              ) : null}
              {missingTools ? (
                <div className="cs-tiny" style={{ marginTop: 10 }}>
                  Install {missingTools.tools.join(" and ")} first.
                </div>
              ) : null}
            </div>
            <Helix size={180} rungs={18} hue={tweaks.accentHue} speed={24} />
          </div>
        </Card>
      </>
    );
  }

  if (status === "running") {
    const pct = latestRun
      ? latestRun.totalShards > 0
        ? latestRun.completedShards / latestRun.totalShards
        : latestRun.progress
      : 0;
    return (
      <>
        <div className="cs-view-head">
          <div>
            <div className="cs-crumb">
              {workspace.displayName} / 03 Variant calling
            </div>
            <h1>Searching the cancer sample for mutations…</h1>
          </div>
          <Chip kind="live">Stage 03 · Live</Chip>
        </div>
        <Card>
          <div style={{ padding: "36px 32px", textAlign: "center" }}>
            <Helix size={220} rungs={20} hue={tweaks.accentHue} speed={16} />
            <div style={{ marginTop: 20 }}>
              <div
                className="cs-progress"
                style={{ maxWidth: 420, margin: "0 auto", height: 10 }}
              >
                <div
                  className="cs-progress-fill"
                  style={{ width: `${Math.max(3, Math.round(pct * 100))}%` }}
                />
              </div>
              <p className="cs-tiny" style={{ marginTop: 14 }}>
                {latestRun && latestRun.totalShards > 0
                  ? `${latestRun.completedShards} / ${latestRun.totalShards} chromosomes done`
                  : "Preparing the reference…"}
              </p>
            </div>
            {latestRun ? (
              <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
                <Btn
                  variant="ghost"
                  disabled={submitting}
                  onClick={() =>
                    void runAction(() =>
                      api.pauseVariantCalling(workspace.id, latestRun.id)
                    )
                  }
                  data-testid="variant-calling-pause-button"
                >
                  ⏸ Pause
                </Btn>
                <Btn
                  variant="ghost"
                  disabled={submitting}
                  onClick={() =>
                    void runAction(() =>
                      api.cancelVariantCalling(workspace.id, latestRun.id)
                    )
                  }
                  style={{ color: "var(--danger)" }}
                >
                  Cancel &amp; discard
                </Btn>
              </div>
            ) : null}
          </div>
        </Card>
      </>
    );
  }

  if (status === "paused" && latestRun) {
    return (
      <>
        <div className="cs-view-head">
          <div>
            <div className="cs-crumb">
              {workspace.displayName} / 03 Variant calling
            </div>
            <h1>Paused. Your progress is saved.</h1>
          </div>
          <Chip kind="live">Stage 03 · Live</Chip>
        </div>
        <Callout>
          <Dot style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {latestRun.totalShards > 0
                ? `Paused at ${latestRun.completedShards} / ${latestRun.totalShards} chromosomes.`
                : "Paused."}
            </div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              Resume picks up from the next chromosome. Discard wipes the
              progress and starts fresh.
            </p>
          </div>
          <Btn
            disabled={submitting}
            onClick={() =>
              void runAction(() => api.resumeVariantCalling(workspace.id, latestRun.id))
            }
            data-testid="variant-calling-resume-button"
          >
            Resume search
          </Btn>
        </Callout>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        <div className="cs-view-head">
          <div>
            <div className="cs-crumb">
              {workspace.displayName} / 03 Variant calling
            </div>
            <h1>The search didn&apos;t finish.</h1>
          </div>
          <Chip kind="live">Stage 03 · Live</Chip>
        </div>
        <Callout tone="warm">
          <Dot style={{ color: "var(--warm)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              The search failed.
            </div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              {latestRun?.error ?? "Try again, or check the command log in expert mode."}
            </p>
          </div>
          <Btn
            disabled={submitting}
            onClick={() => void runAction(() => api.rerunVariantCalling(workspace.id))}
          >
            Search again
          </Btn>
        </Callout>
      </>
    );
  }

  const totalVariants = metrics?.totalVariants ?? 0;
  const passCount = metrics?.passCount ?? 0;

  return (
    <>
      <div className="cs-view-head">
        <div>
          <div className="cs-crumb">
            {workspace.displayName} / 03 Variant calling
          </div>
          <h1>
            {passCount.toLocaleString()} cancer-specific mutations.
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
            These are the changes that appear in the tumor but not in the healthy
            sample. We kept the high-confidence ones and grouped the rest into
            plain-language buckets so you can see what was set aside and why.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <Chip kind="live">Stage 03 · Live</Chip>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              color: "var(--muted)",
            }}
          >
            {latestRun?.accelerationMode === "gpu_parabricks"
              ? "Parabricks · GPU"
              : "GATK Mutect2"}
            {metrics?.referenceLabel ? ` · ${metrics.referenceLabel}` : null}
          </div>
        </div>
      </div>

      {metrics && totalVariants > 0 ? (
        <>
          <Karyogram
            chromosomes={metrics.perChromosome}
            topVariants={metrics.topVariants}
            referenceLabel={metrics.referenceLabel}
          />

          <div style={{ marginTop: 20 }}>
            <MetricsRibbon metrics={metrics} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 20,
              marginTop: 20,
            }}
          >
            <FilterBreakdown
              entries={metrics.filterBreakdown}
              totalVariants={metrics.totalVariants}
            />
            <VafDistribution
              bins={metrics.vafHistogram}
              meanVaf={metrics.meanVaf}
              medianVaf={metrics.medianVaf}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <TopVariantsTable variants={metrics.topVariants} />
          </div>
        </>
      ) : (
        <Card style={{ padding: "28px 24px", fontSize: 14 }}>
          The search finished without finding any mutations. Open the technical
          details below and check the alignment quality for coverage gaps.
        </Card>
      )}

      {tweaks.expertMode && latestRun?.commandLog.length ? (
        <Card style={{ marginTop: 20 }}>
          <CardHead eyebrow="Expert · Mutect2 command" title="Command log" />
          <pre
            style={{
              margin: 0,
              padding: "16px 22px",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              lineHeight: 1.7,
              color: "var(--muted)",
              background: "var(--surface-sunk)",
              borderBottomLeftRadius: "var(--radius-cs-lg)",
              borderBottomRightRadius: "var(--radius-cs-lg)",
              overflow: "auto",
              maxHeight: 320,
            }}
          >
            {latestRun.commandLog.join("\n")}
          </pre>
        </Card>
      ) : null}

      <div
        style={{
          marginTop: 24,
          padding: "18px 22px",
          borderRadius: "var(--radius-cs)",
          border: "1px dashed var(--line-strong)",
          background: "var(--surface-sunk)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Eyebrow>Next</Eyebrow>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
            Annotation (Ensembl VEP) reads what each mutation means.
          </span>
          <span className="cs-tiny" style={{ fontSize: 12.5 }}>
            It checks each mutation against what scientists already know — which
            gene it&apos;s in, what it changes, and whether that gene matters in
            cancer.
          </span>
        </div>
        <Link
          href={`/workspaces/${workspace.id}/annotation`}
          className="cs-btn cs-btn-ghost"
        >
          Open annotation →
        </Link>
      </div>
    </>
  );
}
