"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";

import { AlignmentAdvancedDetails } from "@/components/workspaces/alignment/AlignmentAdvancedDetails";
import { Button } from "@/components/ui/button";
import { api, InsufficientMemoryError, MissingToolsError } from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import type {
  AlignmentLaneMetrics,
  AlignmentRun,
  AlignmentStageSummary,
  Workspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { getQcVerdictLabel } from "@/lib/workspace-utils";

interface AlignmentStagePanelProps {
  workspace: Workspace;
  summary: AlignmentStageSummary;
  onWorkspaceChange: (workspace: Workspace) => void;
  onSummaryChange: (summary: AlignmentStageSummary) => void;
}

const METRIC_DEFINITIONS = [
  {
    key: "mappedPercent",
    label: "Mapped",
    format: (value: number | null) =>
      value == null ? "—" : `${value.toFixed(1)}%`,
  },
  {
    key: "properlyPairedPercent",
    label: "Properly paired",
    format: (value: number | null) =>
      value == null ? "—" : `${value.toFixed(1)}%`,
  },
  {
    key: "duplicatePercent",
    label: "Duplicates",
    format: (value: number | null) =>
      value == null ? "—" : `${value.toFixed(1)}%`,
  },
  {
    key: "meanInsertSize",
    label: "Mean insert",
    format: (value: number | null) =>
      value == null ? "—" : `${value.toFixed(0)} bp`,
  },
] as const;

type BannerState =
  | "waiting"
  | "running"
  | "passed"
  | "warning"
  | "failed"
  | "cancelled"
  | "paused";

function bannerStateOf(summary: AlignmentStageSummary): BannerState {
  if (summary.status === "completed") {
    if (summary.latestRun?.qcVerdict === "fail") return "failed";
    if (summary.latestRun?.qcVerdict === "warn") return "warning";
    return "passed";
  }
  if (summary.status === "running") return "running";
  if (summary.status === "paused") return "paused";
  if (summary.status === "failed") return "failed";
  if (summary.latestRun?.status === "cancelled") return "cancelled";
  return "waiting";
}

const PILL_TONES: Record<BannerState, { label: string; bg: string; dot: string }> = {
  waiting: { label: "Waiting", bg: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
  running: { label: "Running", bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  passed: { label: "Passed", bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  warning: { label: "Warnings", bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  failed: { label: "Failed", bg: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  cancelled: { label: "Stopped", bg: "bg-stone-100 text-stone-600", dot: "bg-stone-500" },
  paused: { label: "Paused", bg: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
};

function bannerMessage(state: BannerState, hasRun: boolean, blockingReason?: string | null) {
  switch (state) {
    case "passed":
      return "Alignment finished. Quality looks good.";
    case "warning":
      return "Alignment finished, but the quality warnings need review.";
    case "failed":
      return "Alignment needs attention before you continue.";
    case "running":
      return "Alignment is running on this computer.";
    case "cancelled":
      return "Alignment was stopped. You can start a fresh run whenever you're ready.";
    case "paused":
      return blockingReason || "Alignment is paused. Resume when you want to keep going.";
    default:
      return hasRun
        ? "You can run alignment again at any time."
        : "Ready to start alignment.";
  }
}

function metricValue(
  metrics: AlignmentLaneMetrics | null,
  key: (typeof METRIC_DEFINITIONS)[number]["key"]
) {
  if (!metrics) return null;
  return metrics[key] ?? null;
}

function runtimePhaseLabel(phase?: string | null) {
  if (phase === "preparing_reference") return "Preparing the reference";
  if (phase === "aligning") return "Aligning the reads";
  if (phase === "finalizing") return "Finalizing the files";
  return "Working";
}

function formatElapsed(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m elapsed`;
  if (m > 0) return `${m}m ${s}s elapsed`;
  return `${s}s elapsed`;
}

function ElapsedTimer({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (!isFinite(started)) return null;
  const elapsedSeconds = (now - started) / 1000;

  return (
    <span className="font-mono text-[11px] tabular-nums text-stone-500">
      {formatElapsed(elapsedSeconds)}
    </span>
  );
}

function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return "<1m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

function EtaDisplay({
  etaSeconds,
  startedAt,
}: {
  etaSeconds?: number | null;
  startedAt?: string | null;
}) {
  const now = useNowTick(5000);
  const elapsedMs = startedAt ? now - Date.parse(startedAt) : 0;
  const warming = !startedAt || elapsedMs < 60_000 || etaSeconds == null;
  const formatted = warming ? "estimating ETA…" : `~${formatEta(etaSeconds)} left`;
  if (!formatted) return null;

  return (
    <span className="font-mono text-[11px] tabular-nums text-stone-400">
      {formatted}
    </span>
  );
}

function HeartbeatIndicator({ lastActivityAt }: { lastActivityAt?: string | null }) {
  const now = useNowTick(5000);
  if (!lastActivityAt) return null;

  const elapsed = (now - Date.parse(lastActivityAt)) / 1000;
  if (!isFinite(elapsed) || elapsed <= 90) return null;

  const label = elapsed > 300 ? "No activity" : "Slow";
  const tone = elapsed > 300 ? "bg-rose-500" : "bg-amber-500";
  return (
    <span
      title={`Last activity ${Math.round(elapsed)}s ago`}
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500"
    >
      <span className={cn("size-1.5 rounded-full", tone)} />
      {label}
    </span>
  );
}

function StallCallout({ lastActivityAt }: { lastActivityAt?: string | null }) {
  const now = useNowTick(10_000);
  if (!lastActivityAt) return null;

  const elapsed = (now - Date.parse(lastActivityAt)) / 1000;
  if (!isFinite(elapsed) || elapsed <= 300) return null;

  const m = Math.floor(elapsed / 60);
  const s = Math.floor(elapsed % 60);
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
      data-testid="alignment-stall-callout"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <div className="font-medium">The run may be stalled</div>
        <p className="mt-0.5 text-rose-600">
          We have not seen activity in {m}m {s}s. Check the advanced details, pause the
          run, or cancel and restart if it looks stuck.
        </p>
      </div>
    </div>
  );
}

function PhaseSubBars({ run }: { run: AlignmentRun }) {
  const { referencePrep, aligning, finalizing } = run.progressComponents;
  const tumorState = run.chunkProgress?.tumor ?? null;
  const normalState = run.chunkProgress?.normal ?? null;
  const tumorCompleted = tumorState?.completedChunks ?? 0;
  const tumorTotal = tumorState?.totalChunks || run.expectedTotalPerLane?.tumor || 0;
  const normalCompleted = normalState?.completedChunks ?? 0;
  const normalTotal =
    normalState?.totalChunks || run.expectedTotalPerLane?.normal || 0;

  const alignLabel =
    tumorTotal || normalTotal
      ? `${tumorCompleted}/${tumorTotal || "?"} tumor · ${normalCompleted}/${normalTotal || "?"} healthy`
      : "preparing chunks";

  const items: Array<{
    label: string;
    value: number;
    detail: string;
    active: boolean;
  }> = [
    {
      label: "Reference prep",
      value: referencePrep,
      detail: referencePrep >= 1 ? "done" : "in progress",
      active: run.runtimePhase === "preparing_reference",
    },
    {
      label: "Aligning chunks",
      value: aligning,
      detail: alignLabel,
      active: run.runtimePhase === "aligning",
    },
    {
      label: "Finalizing",
      value: finalizing,
      detail: "preparing your aligned files",
      active: run.runtimePhase === "finalizing",
    },
  ];

  return (
    <div className="space-y-1.5 pt-1">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2.5"
          data-phase={item.label.toLowerCase().split(" ")[0]}
        >
          <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            {item.label}
          </span>
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                item.active ? "bg-emerald-500/70" : "bg-stone-300"
              )}
              style={{ width: `${Math.max(2, Math.round(item.value * 100))}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
            {item.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function NextStepCallout({
  workspace,
  summary,
}: {
  workspace: Workspace;
  summary: AlignmentStageSummary;
}) {
  let tone = "border-stone-200 bg-stone-50 text-stone-700";
  let title = "Next step";
  let body =
    "A clean QC pass keeps the workflow moving. Quality warnings keep the next step visible, but blocked.";

  if (!workspace.ingestion.readyForAlignment) {
    body = "Add both the tumor and healthy sample files before alignment can start.";
  } else if (summary.status === "running") {
    tone = "border-amber-200 bg-amber-50 text-amber-800";
    body = "The next step stays blocked until this run finishes and the QC result is a pass.";
  } else if (summary.status === "paused") {
    tone = "border-indigo-200 bg-indigo-50 text-indigo-800";
    body = "Resume alignment to keep going from the saved progress on disk.";
  } else if (summary.status === "failed") {
    tone = "border-rose-200 bg-rose-50 text-rose-800";
    body = "This run needs another try before the workflow can move forward.";
  } else if (summary.readyForVariantCalling) {
    tone = "border-emerald-200 bg-emerald-50 text-emerald-800";
    title = "Ready for the next step";
    body = "Alignment passed QC. You can move on and search for mutations now.";
  } else if (summary.qcVerdict === "warn" || summary.blockingReason) {
    tone = "border-amber-200 bg-amber-50 text-amber-800";
    title = "Review needed";
    body =
      summary.blockingReason ??
      "Alignment finished with warnings, so the next step stays blocked for now.";
  }

  return (
    <div className={cn("rounded-xl border px-4 py-3 text-[13px]", tone)}>
      <div className="font-medium">{title}</div>
      <p className="mt-1 leading-6">{body}</p>
    </div>
  );
}

export default function AlignmentStagePanel({
  workspace,
  summary,
  onSummaryChange,
}: AlignmentStagePanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingTools, setMissingTools] = useState<MissingToolsError | null>(null);
  const [memoryError, setMemoryError] = useState<InsufficientMemoryError | null>(null);
  const [showQuality, setShowQuality] = useState(false);

  useEffect(() => {
    if (summary.status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      void api
        .getAlignmentStageSummary(workspace.id)
        .then(onSummaryChange)
        .catch(() => {});
    }, 2000);

    return () => window.clearInterval(timer);
  }, [onSummaryChange, summary.status, workspace.id]);

  const latestRunStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = summary.latestRun?.status ?? null;
    const prevStatus = latestRunStatusRef.current;
    latestRunStatusRef.current = currentStatus;

    if (prevStatus !== "running" || !currentStatus) return;
    if (!["completed", "failed", "cancelled"].includes(currentStatus)) return;

    const startedAt = summary.latestRun?.startedAt;
    if (!startedAt) return;
    const elapsedSeconds = (Date.now() - Date.parse(startedAt)) / 1000;
    if (!isFinite(elapsedSeconds) || elapsedSeconds < 1800) return;

    const desktop = getDesktopBridge();
    if (!desktop?.notify) return;

    const titleByStatus: Record<string, string> = {
      completed: "Alignment finished",
      failed: "Alignment failed",
      cancelled: "Alignment stopped",
    };
    void desktop
      .notify({
        title: titleByStatus[currentStatus] ?? "Alignment update",
        body: `${workspace.displayName} — ${formatElapsed(elapsedSeconds)}`,
      })
      .catch(() => {});
  }, [summary.latestRun?.status, summary.latestRun?.startedAt, workspace.displayName]);

  const bannerState = bannerStateOf(summary);
  const pill = PILL_TONES[bannerState];
  const latestRun = summary.latestRun;
  const isRunning = summary.status === "running";
  const isPaused = summary.status === "paused";
  const canRun =
    summary.status === "ready" ||
    summary.status === "completed" ||
    summary.status === "failed";

  async function handleRun() {
    if (!canRun || isSubmitting) {
      return;
    }

    setError(null);
    setMissingTools(null);
    setMemoryError(null);
    setIsSubmitting(true);
    try {
      const nextSummary = latestRun
        ? await api.rerunAlignment(workspace.id)
        : await api.runAlignment(workspace.id);
      onSummaryChange(nextSummary);
    } catch (runError) {
      if (runError instanceof MissingToolsError) {
        setMissingTools(runError);
      } else if (runError instanceof InsufficientMemoryError) {
        setMemoryError(runError);
      } else {
        setError(
          runError instanceof Error ? runError.message : "Unable to start alignment."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!latestRun || isCancelling) return;
    if (summary.status !== "running" && summary.status !== "paused") return;

    const confirmMessage =
      summary.status === "paused"
        ? "Discard the paused alignment? All saved chunk progress on disk will be deleted."
        : "Cancel the alignment and discard progress? All per-chunk work will be deleted.";
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsCancelling(true);
    setError(null);
    try {
      const nextSummary = await api.cancelAlignment(workspace.id, latestRun.id);
      onSummaryChange(nextSummary);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel alignment."
      );
    } finally {
      setIsCancelling(false);
    }
  }

  async function handlePause() {
    if (!latestRun || isPausing) return;
    if (summary.status !== "running") return;

    if (
      !window.confirm(
        "Pause alignment and keep the saved progress on disk so you can resume later?"
      )
    ) {
      return;
    }

    setIsPausing(true);
    setError(null);
    try {
      const nextSummary = await api.pauseAlignment(workspace.id, latestRun.id);
      onSummaryChange(nextSummary);
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : "Unable to pause alignment."
      );
    } finally {
      setIsPausing(false);
    }
  }

  async function handleResume() {
    if (!latestRun || isResuming) return;
    if (summary.status !== "paused") return;

    setIsResuming(true);
    setError(null);
    try {
      const nextSummary = await api.resumeAlignment(workspace.id, latestRun.id);
      onSummaryChange(nextSummary);
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "Unable to resume alignment."
      );
    } finally {
      setIsResuming(false);
    }
  }

  async function handleOpenArtifact(
    localPath?: string | null,
    downloadPath?: string
  ) {
    if (!localPath && !downloadPath) {
      return;
    }

    const desktop = getDesktopBridge();
    if (!desktop) {
      if (downloadPath) {
        window.open(api.resolveDownloadUrl(downloadPath), "_blank");
      }
      return;
    }
    if (localPath) {
      await desktop.openPath(localPath);
    }
  }

  return (
    <div className="space-y-3" data-testid="alignment-stage-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 pb-2">
        <p className="text-sm text-stone-600">
          {bannerMessage(bannerState, Boolean(latestRun), summary.blockingReason)}
        </p>
        <span
          data-testid="alignment-stage-status-strip"
          data-state={summary.status}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]",
            pill.bg
          )}
        >
          <span className={cn("inline-block size-1.5 rounded-full", pill.dot)} />
          {pill.label}
        </span>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white">
        <div className="space-y-5 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-stone-900">Alignment</h3>
            <p className="mt-1 text-[13px] leading-6 text-stone-500">
              This step creates the aligned tumor and healthy sample files used by the
              next stage. Small files may finish quickly, while whole-genome runs can
              take hours on a desktop machine.
            </p>
          </div>

          <NextStepCallout workspace={workspace} summary={summary} />

          <div className="border-t border-stone-100 pt-4">
            {isRunning && latestRun ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[13px] text-stone-700">
                      <LoaderCircle className="size-3.5 animate-spin" />
                      <span>{runtimePhaseLabel(latestRun.runtimePhase)}</span>
                      <HeartbeatIndicator lastActivityAt={latestRun.lastActivityAt} />
                    </div>
                    <p className="max-w-2xl text-[12px] leading-5 text-stone-500">
                      Alignment is running locally. You can pause to keep your progress,
                      or cancel if you want to start over with a clean run.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePause()}
                      disabled={isPausing || isCancelling}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 px-3 py-1 text-[12px] font-medium text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="alignment-pause-button"
                    >
                      {isPausing ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        <Pause className="size-3" />
                      )}
                      {isPausing ? "Pausing…" : "Pause & keep progress"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCancel()}
                      disabled={isPausing || isCancelling}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="alignment-cancel-button"
                    >
                      {isCancelling ? (
                        <LoaderCircle className="size-3 animate-spin" />
                      ) : (
                        <Square className="size-3" />
                      )}
                      {isCancelling ? "Cancelling…" : "Cancel & discard"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-[13px] text-stone-700">
                  <span className="font-mono text-[11px] text-stone-500">
                    {Math.round(latestRun.progress * 100)}%
                  </span>
                  <div className="flex items-center gap-2.5">
                    <ElapsedTimer startedAt={latestRun.startedAt} />
                    <EtaDisplay
                      etaSeconds={latestRun.etaSeconds}
                      startedAt={latestRun.startedAt}
                    />
                  </div>
                </div>

                <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-500"
                    style={{
                      width: `${Math.max(3, Math.round(latestRun.progress * 100))}%`,
                    }}
                  />
                </div>

                <PhaseSubBars run={latestRun} />
                <StallCallout lastActivityAt={latestRun.lastActivityAt} />
              </div>
            ) : isPaused && latestRun ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] text-stone-700">
                    Alignment is paused and the saved chunk progress is still on disk.
                  </p>
                  <p className="mt-1 text-[12px] text-stone-500">
                    Resume continues from the saved work. Discard removes that progress
                    and starts fresh.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={isCancelling || isResuming}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 px-3 py-1 text-[12px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="alignment-discard-button"
                  >
                    {isCancelling ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    Discard & restart
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-500"
                    disabled={isResuming || isCancelling}
                    onClick={() => void handleResume()}
                    data-testid="alignment-resume-button"
                  >
                    {isResuming ? (
                      <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 size-3.5" />
                    )}
                    Resume alignment
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-2xl">
                  <p className="text-[13px] text-stone-700">
                    Start alignment when you are ready.
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-stone-500">
                    This creates the BAM and quality files needed for the next step.
                    Small files may finish quickly, while whole-genome runs can take
                    hours.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-stone-900 px-4 text-white hover:bg-stone-800"
                  disabled={!canRun || isSubmitting}
                  onClick={() => void handleRun()}
                  data-testid="alignment-run-button"
                >
                  {isSubmitting ? (
                    <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                  ) : latestRun ? (
                    <RotateCcw className="mr-1.5 size-3.5" />
                  ) : (
                    <Play className="mr-1.5 size-3.5" />
                  )}
                  {latestRun ? "Run again" : "Start alignment"}
                </Button>
              </div>
            )}
          </div>

          {summary.blockingReason ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{summary.blockingReason}</span>
            </div>
          ) : null}

          {missingTools ? <MissingToolsCallout error={missingTools} /> : null}
          {memoryError ? <InsufficientMemoryCallout error={memoryError} /> : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      {latestRun && !isRunning && !isPaused ? (
        <section className="rounded-2xl border border-stone-200 bg-white">
          <div className="space-y-3 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-stone-900">
                  Alignment quality
                </h3>
                <p className="mt-0.5 text-[13px] text-stone-500">
                  Quick sanity check before the next step.
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]",
                  pill.bg
                )}
              >
                <span className={cn("inline-block size-1.5 rounded-full", pill.dot)} />
                {latestRun.qcVerdict ? getQcVerdictLabel(latestRun.qcVerdict) : "Pending"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowQuality((value) => !value)}
              aria-expanded={showQuality}
              className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500 transition hover:text-stone-800"
            >
              <span
                className={cn(
                  "inline-block size-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform duration-200",
                  showQuality && "rotate-90"
                )}
              />
              {showQuality ? "Hide quality details" : "Show quality details"}
            </button>

            {showQuality ? (
              <div className="grid gap-3 border-t border-stone-100 pt-3 sm:grid-cols-2">
                {(["normal", "tumor"] as const).map((sampleLane) => {
                  const metrics = summary.laneMetrics[sampleLane];
                  return (
                    <div
                      key={sampleLane}
                      className="rounded-lg border border-stone-200 bg-stone-50/40 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium text-stone-800">
                          {sampleLane === "normal" ? "Healthy sample" : "Tumor sample"}
                        </span>
                        <span className="font-mono text-[10px] tracking-[0.14em] text-stone-400">
                          {metrics?.totalReads
                            ? `${metrics.totalReads.toLocaleString()} reads`
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                        {METRIC_DEFINITIONS.map((definition) => (
                          <div
                            key={definition.key}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-stone-500">{definition.label}</span>
                            <span className="font-mono text-stone-800">
                              {definition.format(metricValue(metrics, definition.key))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <AlignmentAdvancedDetails
        workspace={workspace}
        summary={summary}
        latestRun={latestRun}
        isRunning={isRunning}
        onOpenArtifact={handleOpenArtifact}
      />
    </div>
  );
}

function MissingToolsCallout({ error }: { error: MissingToolsError }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-900">
      <div className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div>
          {error.tools.length === 1
            ? `${error.tools[0]} is not installed locally.`
            : `These tools are not installed locally: ${error.tools.join(", ")}.`}
        </div>
      </div>
      <p className="mt-1.5 pl-5 text-amber-800">
        Install them and reload, then try again.
      </p>
      <ul className="mt-2 space-y-1 pl-5">
        {error.hints.map((hint, index) => (
          <li
            key={index}
            className="overflow-x-auto rounded border border-amber-200/70 bg-white/70 px-2 py-1 font-mono text-[11px] leading-5 text-stone-700"
          >
            {hint}
          </li>
        ))}
      </ul>
      <p className="mt-2 pl-5 text-[12px] text-amber-700">
        {"See README / System requirements for the full install guide."}
      </p>
    </div>
  );
}

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

function InsufficientMemoryCallout({
  error,
}: {
  error: InsufficientMemoryError;
}) {
  const availableLabel =
    error.availableBytes != null
      ? `${(error.availableBytes / 1024 ** 3).toFixed(1)} GB`
      : "unknown";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-900">
      <div className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div>Not enough free memory for reference indexing.</div>
      </div>
      <p className="mt-1.5 pl-5 text-amber-800">
        strobealign builds the human genome index once on first run and peaks at
        around {formatGiB(error.requiredBytes)} of RAM. Right now only{" "}
        <span className="font-mono text-[12px]">{availableLabel}</span> is
        available.
      </p>
      <p className="mt-2 pl-5 text-amber-800">Two ways to unblock:</p>
      <ol className="mt-1 list-decimal space-y-1 pl-9 text-amber-800">
        <li>
          Close the browser, IDE, and any heavy apps, then click{" "}
          <strong>Run again</strong>.
        </li>
        <li>
          Or run the standalone indexer in a clean terminal:
          <div className="mt-1 overflow-x-auto rounded border border-amber-200/70 bg-white/70 px-2 py-1 font-mono text-[11px] leading-5 text-stone-700">
            bash scripts/prepare-reference.sh
          </div>
        </li>
      </ol>
      <p className="mt-2 pl-5 text-[12px] text-amber-700">
        The download and partial indices are already on disk. Only the final
        genome.fa.r150.sti file still needs to be built.
      </p>
    </div>
  );
}
