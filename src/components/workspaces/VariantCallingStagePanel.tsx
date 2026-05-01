"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import FilterBreakdown from "@/components/workspaces/variant-calling/FilterBreakdown";
import Karyogram from "@/components/workspaces/variant-calling/Karyogram";
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
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">
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
            <p className="mvx-tiny" style={{ margin: "4px 0 0" }}>
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
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">
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
                  className="mvx-tiny"
                  style={{ marginTop: 10, color: "var(--danger)" }}
                >
                  {actionError}
                </p>
              ) : null}
              {missingTools ? (
                <div className="mvx-tiny" style={{ marginTop: 10 }}>
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
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">
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
                className="mvx-progress"
                style={{ maxWidth: 420, margin: "0 auto", height: 10 }}
              >
                <div
                  className="mvx-progress-fill"
                  style={{ width: `${Math.max(3, Math.round(pct * 100))}%` }}
                />
              </div>
              <p className="mvx-tiny" style={{ marginTop: 14 }}>
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
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">
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
            <p className="mvx-tiny" style={{ margin: "4px 0 0" }}>
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
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">
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
            <p className="mvx-tiny" style={{ margin: "4px 0 0" }}>
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
  const snvCount = metrics?.snvCount ?? 0;
  const indelCount = metrics?.indelCount ?? 0;

  return (
    <>
      <div className="mvx-view-head">
        <div>
          <div className="mvx-crumb">
            {workspace.displayName} / 03 Variant calling
          </div>
          <h1>The tumor&apos;s mutation map.</h1>
          <p
            style={{
              maxWidth: "62ch",
              marginTop: 12,
              fontSize: 16.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
            }}
          >
            We compared tumor and normal position by position.{" "}
            {passCount.toLocaleString()} high-confidence mutations passed filters
            out of {totalVariants.toLocaleString()} candidates.
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
              ? "Parabricks · tumor-normal"
              : "Mutect2 · tumor-normal"}
            {metrics?.referenceLabel ? ` · ${metrics.referenceLabel}` : null}
          </div>
          {metrics ? (
            <div
              style={{
                marginTop: 3,
                fontSize: 11.5,
                fontFamily: "var(--font-mono)",
                color: "var(--muted-2)",
              }}
            >
              {metrics.ponLabel
                ? `Panel-of-normals: ${metrics.ponLabel}`
                : `No panel-of-normals available for ${workspace.species}`}
            </div>
          ) : null}
        </div>
      </div>

      {metrics && totalVariants > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <MetricCard
              label="Total candidates"
              value={totalVariants.toLocaleString()}
            />
            <MetricCard
              label="PASS variants"
              value={passCount.toLocaleString()}
              accent
            />
            <MetricCard
              label="SNVs / Indels"
              value={`${snvCount.toLocaleString()} / ${indelCount.toLocaleString()}`}
            />
            <MetricCard
              label="Ti/Tv"
              value={
                metrics.tiTvRatio != null ? metrics.tiTvRatio.toFixed(2) : "—"
              }
            />
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Karyogram
              chromosomes={metrics.perChromosome}
              referenceLabel={metrics.referenceLabel}
              hue={tweaks.accentHue}
            />
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.3fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <VafDistribution
              bins={metrics.vafHistogram}
              meanVaf={metrics.meanVaf}
              medianVaf={metrics.medianVaf}
            />
            <FilterBreakdown
              entries={metrics.filterBreakdown}
              totalVariants={metrics.totalVariants}
            />
          </div>

          <TopVariantsTable variants={metrics.topVariants} />
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
              borderBottomLeftRadius: "var(--radius-mvx-lg)",
              borderBottomRightRadius: "var(--radius-mvx-lg)",
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
          borderRadius: "var(--radius-mvx-lg)",
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
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
            Annotate these variants against the{" "}
            {workspace.species === "human"
              ? "human"
              : workspace.species === "dog"
                ? "canine"
                : "feline"}{" "}
            cancer gene list.
          </span>
        </div>
        <Link
          href={`/workspaces/${workspace.id}/annotation`}
          className="mvx-btn mvx-btn-primary"
        >
          Open stage 04 →
        </Link>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: "var(--radius-mvx-lg)",
        background: accent
          ? "color-mix(in oklch, var(--accent) 8%, var(--surface-strong))"
          : "var(--surface-strong)",
        border:
          "1px solid " +
          (accent
            ? "color-mix(in oklch, var(--accent) 30%, var(--line))"
            : "var(--line)"),
      }}
    >
      <div className="mvx-mono-label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 400,
          marginTop: 6,
          letterSpacing: "-0.02em",
          color: accent ? "var(--accent-ink)" : "var(--ink)",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
