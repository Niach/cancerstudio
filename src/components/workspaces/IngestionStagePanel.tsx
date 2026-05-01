"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Btn,
  Callout,
  Card,
  CardHead,
  Chip,
  Dot,
  MonoLabel,
} from "@/components/ui-kit";
import { useTweaks } from "@/components/dev/TweaksProvider";
import { api, MissingToolsError } from "@/lib/api";
import type {
  IngestionLaneSummary,
  IngestionLanePreview,
  SampleLane,
  Workspace,
  WorkspaceFile,
} from "@/lib/types";
import {
  formatBytes,
  formatLaneLabel,
  formatReferencePresetCodename,
} from "@/lib/workspace-utils";

import InboxPicker from "./ingestion/InboxPicker";
import {
  LANES,
  emptyPreviewState,
  formatEta,
  formatProgressPhase,
  formatThroughput,
  sourceFilesForLane,
  type PreviewState,
} from "./ingestion/lane-utils";

interface IngestionStagePanelProps {
  workspace: Workspace;
  onWorkspaceChange: (workspace: Workspace) => void;
}

export default function IngestionStagePanel({
  workspace,
  onWorkspaceChange,
}: IngestionStagePanelProps) {
  const { tweaks } = useTweaks();

  const [submittingLane, setSubmittingLane] = useState<SampleLane | null>(null);
  const [laneErrors, setLaneErrors] = useState<Record<SampleLane, string | null>>({
    tumor: null,
    normal: null,
  });
  const [previewStates, setPreviewStates] = useState<Record<SampleLane, PreviewState>>({
    tumor: emptyPreviewState(),
    normal: emptyPreviewState(),
  });
  const [missingTools, setMissingTools] = useState<MissingToolsError | null>(null);
  const [pickerLane, setPickerLane] = useState<SampleLane | null>(null);

  const ready = workspace.ingestion.readyForAlignment;

  useEffect(() => {
    if (!LANES.some((lane) => workspace.ingestion.lanes[lane].status === "normalizing")) {
      return;
    }
    const timer = window.setInterval(() => {
      void api.getWorkspace(workspace.id).then(onWorkspaceChange).catch(() => {});
    }, 2200);
    return () => window.clearInterval(timer);
  }, [onWorkspaceChange, workspace.id, workspace.ingestion]);

  useEffect(() => {
    setPreviewStates((current) => {
      const next = { ...current };
      let changed = false;
      for (const lane of LANES) {
        const summary = workspace.ingestion.lanes[lane];
        const existing = current[lane];
        if (!summary.readyForAlignment) {
          if (existing.phase !== "idle" || existing.data || existing.error) {
            next[lane] = emptyPreviewState();
            changed = true;
          }
          continue;
        }
        if (existing.data && existing.data.batchId !== summary.activeBatchId) {
          next[lane] = emptyPreviewState();
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [workspace.ingestion]);

  const loadLanePreview = useCallback(
    async (sampleLane: SampleLane) => {
      setPreviewStates((current) => ({
        ...current,
        [sampleLane]: { phase: "loading", data: null, error: null },
      }));
      try {
        const preview = await api.getIngestionLanePreview(workspace.id, sampleLane);
        setPreviewStates((current) => ({
          ...current,
          [sampleLane]: { phase: "ready", data: preview, error: null },
        }));
      } catch (err) {
        setPreviewStates((current) => ({
          ...current,
          [sampleLane]: {
            phase: "failed",
            data: null,
            error: err instanceof Error ? err.message : "Unable to load the preview.",
          },
        }));
      }
    },
    [workspace.id]
  );

  useEffect(() => {
    for (const lane of LANES) {
      if (!workspace.ingestion.lanes[lane].readyForAlignment) continue;
      if (previewStates[lane].phase !== "idle") continue;
      void loadLanePreview(lane);
    }
  }, [loadLanePreview, previewStates, workspace.ingestion]);

  async function registerPaths(sampleLane: SampleLane, paths: string[]) {
    if (!paths.length) return;
    setSubmittingLane(sampleLane);
    setLaneErrors((c) => ({ ...c, [sampleLane]: null }));
    setMissingTools(null);
    try {
      const updated = await api.registerLocalLaneFiles(workspace.id, {
        sampleLane,
        paths,
      });
      onWorkspaceChange(updated);
      setPreviewStates((c) => ({ ...c, [sampleLane]: emptyPreviewState() }));
    } catch (err) {
      if (err instanceof MissingToolsError) {
        setMissingTools(err);
      } else {
        setLaneErrors((c) => ({
          ...c,
          [sampleLane]:
            err instanceof Error ? err.message : "Unable to register files.",
        }));
      }
    } finally {
      setSubmittingLane(null);
    }
  }

  async function handlePickerConfirm(paths: string[]) {
    if (!pickerLane) return;
    const lane = pickerLane;
    setPickerLane(null);
    await registerPaths(lane, paths);
  }

  const referenceCode = formatReferencePresetCodename(
    workspace.analysisProfile.referencePreset
  );

  return (
    <>
      <div className="mvx-view-head">
        <div>
          <div className="mvx-crumb">
            {workspace.displayName} / 01 Ingestion
          </div>
          <h1>The tumor sample and the healthy sample.</h1>
          <p
            style={{
              maxWidth: "58ch",
              marginTop: 12,
              fontSize: 16.5,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              margin: "12px 0 0",
            }}
          >
            Drop in two sets of DNA files: one from the tumor, one from healthy
            tissue. We check them, show a quick preview, and get everything ready
            for the next step. No renaming or reformatting on your end.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <Chip kind="live">Stage 01 · Live</Chip>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {referenceCode}
          </div>
        </div>
      </div>

      {ready ? (
        <Callout style={{ marginBottom: 22 }}>
          <div style={{ marginTop: 2 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "var(--accent)",
                boxShadow: "0 0 10px var(--accent)",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
              Both samples look good. You&apos;re ready for the next step.
            </div>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 14.5,
                lineHeight: 1.6,
                color: "var(--muted)",
              }}
            >
              Click <em>Align reads</em> to match the DNA to the reference
              genome.
            </p>
          </div>
          <Link
            href={`/workspaces/${workspace.id}/alignment`}
            className="mvx-btn mvx-btn-primary"
            data-testid="ingestion-continue-link"
          >
            Align reads →
          </Link>
        </Callout>
      ) : (
        <Callout tone="warm" style={{ marginBottom: 22 }}>
          <div style={{ marginTop: 2 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "var(--warm)",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)" }}>
              Add both samples to get started.
            </div>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 14.5,
                color: "var(--muted)",
              }}
            >
              One tumor sample, one healthy sample — paired FASTQ or a single
              BAM/CRAM each. We do the rest.
            </p>
          </div>
        </Callout>
      )}

      {missingTools ? <MissingToolsCallout error={missingTools} /> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
        }}
      >
        {LANES.map((lane) => {
          const summary = workspace.ingestion.lanes[lane];
          const files = sourceFilesForLane(workspace, lane);
          return (
            <LaneCard
              key={lane}
              lane={lane}
              summary={summary}
              files={files}
              preview={previewStates[lane]}
              onPick={() => setPickerLane(lane)}
              onRetryPreview={() => void loadLanePreview(lane)}
              submitting={submittingLane === lane}
              error={laneErrors[lane]}
              expertMode={tweaks.expertMode}
            />
          );
        })}
      </div>

      {tweaks.expertMode ? (
        <Card style={{ marginTop: 20 }}>
          <CardHead
            eyebrow="Expert · canonical pipeline"
            title="Normalization command trace"
          />
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
            }}
          >
            {`$ samtools collate -Oun128 INPUT.bam collate.tmp \\
    | samtools fastq -1 sample.canonical.R1.fq.gz \\
                    -2 sample.canonical.R2.fq.gz \\
                    -0 /dev/null -s /dev/null -n -
[canonical]  wrote canonical FASTQ pair
[canonical]  ready for alignment ✓`}
          </pre>
        </Card>
      ) : null}

      <InboxPicker
        open={pickerLane !== null}
        laneLabel={pickerLane ? formatLaneLabel(pickerLane).toLowerCase() : ""}
        onClose={() => setPickerLane(null)}
        onConfirm={(paths) => void handlePickerConfirm(paths)}
      />
    </>
  );
}

function LaneCard({
  lane,
  summary,
  files,
  preview,
  onPick,
  onRetryPreview,
  submitting,
  error,
  expertMode,
}: {
  lane: SampleLane;
  summary: IngestionLaneSummary;
  files: WorkspaceFile[];
  preview: PreviewState;
  onPick: () => void;
  onRetryPreview: () => void;
  submitting: boolean;
  error: string | null;
  expertMode: boolean;
}) {
  const accent = lane === "tumor" ? "tumor" : "normal";
  const ready = summary.readyForAlignment;
  const status = summary.status;
  const progressPercent = Math.max(0, Math.min(100, summary.progress?.percent ?? 0));
  const progressWidth = Math.max(2, Math.round(progressPercent));
  const statusLabel =
    status === "ready"
      ? "Ready"
      : status === "normalizing"
        ? "Preparing"
        : status === "uploading" || status === "uploaded"
          ? "Queued"
          : status === "failed"
            ? "Needs attention"
            : "Awaiting files";

  return (
    <div className={`mvx-lane-card mvx-lane-accent-${accent}`}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <MonoLabel style={{ whiteSpace: "nowrap" }}>
            {lane === "tumor" ? "Sample · tumor" : "Sample · healthy"}
          </MonoLabel>
          <h3
            style={{
              margin: "2px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
            }}
          >
            {lane === "tumor" ? "Tumor" : "Matched normal"}
          </h3>
          <p className="mvx-tiny" style={{ margin: 0, fontSize: 13.5 }}>
            {lane === "tumor"
              ? "Biopsy — the cancer."
              : "Healthy reference — what to compare against."}
          </p>
        </div>
        <span
          className="mvx-chip"
          style={{
            background: ready
              ? "color-mix(in oklch, var(--lane) 14%, transparent)"
              : status === "failed"
                ? "color-mix(in oklch, var(--danger) 12%, transparent)"
                : "color-mix(in oklch, var(--warm) 12%, transparent)",
            color: ready
              ? "color-mix(in oklch, var(--lane) 50%, var(--ink))"
              : status === "failed"
                ? "var(--danger)"
                : "var(--warm)",
          }}
        >
          {statusLabel}
        </span>
      </div>

      {files.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surface-sunk)",
                border: "1px solid var(--line)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.14em",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "color-mix(in oklch, var(--ink) 6%, transparent)",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {f.format}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-2)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.filename}
              >
                {f.filename}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                {f.readPair}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                {formatBytes(f.sizeBytes)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "28px 16px",
            textAlign: "center",
            border: "1.5px dashed color-mix(in oklch, var(--lane) 60%, transparent)",
            borderRadius: "var(--radius-cs)",
            background: "color-mix(in oklch, var(--lane-soft) 60%, transparent)",
            marginBottom: 16,
          }}
        >
          <div
            className="mvx-tiny"
            style={{ fontSize: 13.5, marginBottom: 12 }}
          >
            No files yet. Pick your {lane === "tumor" ? "tumor" : "healthy"}{" "}
            sample files.
          </div>
          <Btn size="sm" onClick={onPick} disabled={submitting}>
            {submitting ? "Registering…" : "Pick files →"}
          </Btn>
        </div>
      )}

      {files.length > 0 ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 12,
          }}
        >
          <Btn size="sm" variant="ghost" onClick={onPick} disabled={submitting}>
            {submitting ? "Registering…" : "Replace files"}
          </Btn>
        </div>
      ) : null}

      {summary.progress && summary.status === "normalizing" ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "var(--surface-sunk)",
            border: "1px solid var(--line)",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <MonoLabel>{formatProgressPhase(summary.progress.phase)}</MonoLabel>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--muted)",
              }}
            >
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="mvx-progress" style={{ height: 6 }}>
            <div
              className="mvx-progress-fill"
              style={{
                width: `${progressWidth}%`,
              }}
            />
          </div>
          <div
            className="mvx-tiny"
            style={{
              marginTop: 8,
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <span>{formatThroughput(summary.progress.throughputBytesPerSec) ?? "—"}</span>
            <span>{formatEta(summary.progress.etaSeconds) ?? "—"}</span>
          </div>
        </div>
      ) : null}

      {preview.phase === "ready" && preview.data ? (
        <ReadPreview preview={preview.data} expertMode={expertMode} />
      ) : preview.phase === "loading" ? (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--surface-sunk)",
            borderRadius: 12,
            border: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="mvx-spinner" />
          <span className="mvx-tiny">Loading read preview…</span>
        </div>
      ) : preview.phase === "failed" ? (
        <div
          style={{
            padding: "12px 14px",
            border: "1px solid var(--line)",
            background: "var(--surface-sunk)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Dot style={{ color: "var(--warm)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
              Preview unavailable.
            </div>
            <div className="mvx-tiny" style={{ fontSize: 12 }}>
              {preview.error}
            </div>
          </div>
          <Btn size="sm" variant="ghost" onClick={onRetryPreview}>
            Retry
          </Btn>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12.5,
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ReadPreview({
  preview,
  expertMode,
}: {
  preview: IngestionLanePreview;
  expertMode: boolean;
}) {
  const stats = preview.stats;
  const firstRead =
    preview.reads.R1?.[0] ??
    preview.reads.R2?.[0] ??
    preview.reads.SE?.[0] ??
    null;
  return (
    <div
      style={{
        background: "var(--surface-sunk)",
        borderRadius: 12,
        padding: "12px 14px",
        border: "1px solid var(--line)",
      }}
    >
      <MonoLabel>
        Read preview · {stats.sampledReadCount.toLocaleString()} reads sampled
      </MonoLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          marginTop: 10,
        }}
      >
        <PreviewStat
          label="Avg length"
          value={`${stats.averageReadLength} bp`}
        />
        <PreviewStat label="GC" value={`${stats.sampledGcPercent.toFixed(1)}%`} />
        <PreviewStat
          label="Q30"
          value={
            firstRead ? `${firstRead.meanQuality.toFixed(1)}` : "—"
          }
        />
      </div>
      {expertMode && firstRead ? (
        <pre
          style={{
            marginTop: 12,
            marginBottom: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            lineHeight: 1.6,
            color: "var(--muted-2)",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
          }}
        >
          {`${firstRead.header}\n${firstRead.sequence.slice(0, 64)}…\n+\n${firstRead.quality.slice(0, 64)}…`}
        </pre>
      ) : null}
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          color: "var(--muted-2)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          fontWeight: 500,
          color: "var(--ink)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MissingToolsCallout({ error }: { error: MissingToolsError }) {
  return (
    <Callout tone="warm" style={{ marginBottom: 16 }}>
      <Dot style={{ color: "var(--warm)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
          {error.tools.length === 1
            ? `${error.tools[0]} is not installed locally.`
            : `These tools are not installed locally: ${error.tools.join(", ")}.`}
        </div>
        <p className="mvx-tiny" style={{ margin: "4px 0 8px" }}>
          Install them and reload, then try again.
        </p>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {error.hints.map((hint, i) => (
            <li
              key={i}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-2)",
                background: "var(--surface-sunk)",
                border: "1px solid var(--line)",
                padding: "4px 8px",
                borderRadius: 4,
              }}
            >
              {hint}
            </li>
          ))}
        </ul>
      </div>
    </Callout>
  );
}
