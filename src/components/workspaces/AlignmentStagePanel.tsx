"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  LoaderCircle,
  Play,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import type {
  AlignmentLaneMetrics,
  AlignmentStageSummary,
  AssayType,
  Workspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  formatAssayType,
  formatBytes,
  formatDateTime,
  formatLaneLabel,
  formatReferencePreset,
  getAlignmentStatusCopy,
  getQcVerdictLabel,
} from "@/lib/workspace-utils";

interface AlignmentStagePanelProps {
  workspace: Workspace;
  summary: AlignmentStageSummary;
  onWorkspaceChange: (workspace: Workspace) => void;
  onSummaryChange: (summary: AlignmentStageSummary) => void;
}

const assayOptions: Array<{ value: AssayType; label: string; note: string }> = [
  {
    value: "wgs",
    label: "WGS",
    note: "Whole-genome sequencing for broad somatic coverage.",
  },
  {
    value: "wes",
    label: "WES",
    note: "Whole-exome sequencing for coding-region focused cases.",
  },
];

const metricDefinitions = [
  {
    key: "mappedPercent",
    label: "Mapped",
    format: (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`),
  },
  {
    key: "properlyPairedPercent",
    label: "Properly paired",
    format: (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`),
  },
  {
    key: "duplicatePercent",
    label: "Duplicates",
    format: (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`),
  },
  {
    key: "meanInsertSize",
    label: "Mean insert",
    format: (value: number | null) => (value == null ? "—" : `${value.toFixed(0)} bp`),
  },
] as const;

function toneClass(status: AlignmentStageSummary["status"]) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "running") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "ready") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-black/10 bg-white/80 text-slate-600";
}

function metricValue(
  metrics: AlignmentLaneMetrics | null,
  key: (typeof metricDefinitions)[number]["key"]
) {
  if (!metrics) {
    return null;
  }
  return metrics[key] ?? null;
}

function runtimePhaseLabel(phase?: string | null) {
  if (phase === "preparing_reference") {
    return "Preparing reference bundle";
  }
  if (phase === "aligning") {
    return "Aligning reads";
  }
  if (phase === "finalizing") {
    return "Finalizing artifacts";
  }
  return null;
}

export default function AlignmentStagePanel({
  workspace,
  summary,
  onWorkspaceChange,
  onSummaryChange,
}: AlignmentStagePanelProps) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const statusCopy = getAlignmentStatusCopy(summary);
  const canRun =
    summary.status === "ready" ||
    summary.status === "completed" ||
    summary.status === "failed";
  const assayType = workspace.analysisProfile.assayType ?? null;
  const latestRun = summary.latestRun;

  async function handleAssaySelect(nextAssayType: AssayType) {
    if (assayType === nextAssayType || isSavingProfile) {
      return;
    }

    setError(null);
    setIsSavingProfile(true);
    try {
      const updatedWorkspace = await api.updateWorkspaceAnalysisProfile(workspace.id, {
        assayType: nextAssayType,
        referencePreset: workspace.analysisProfile.referencePreset,
        referenceOverride: workspace.analysisProfile.referenceOverride,
      });
      onWorkspaceChange(updatedWorkspace);
      onSummaryChange(await api.getAlignmentStageSummary(workspace.id));
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update the assay profile."
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleRun() {
    if (!canRun || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const nextSummary = latestRun
        ? await api.rerunAlignment(workspace.id)
        : await api.runAlignment(workspace.id);
      onSummaryChange(nextSummary);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Unable to start alignment."
      );
    } finally {
      setIsSubmitting(false);
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
    <div className="space-y-5" data-testid="alignment-stage-panel">
      <Card className="border-black/5 bg-white/75 shadow-sm shadow-black/5">
        <CardHeader className="gap-4 border-b border-black/6 pb-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl tracking-tight">
                Alignment and QC
              </CardTitle>
              <CardDescription className="max-w-2xl text-[15px] leading-6 text-slate-600">
                Turn the normalized tumor and normal FASTQ pairs into reference-aligned BAMs,
                then check the core quality signals before variant calling.
              </CardDescription>
            </div>

            <div
              data-testid="alignment-stage-status-strip"
              data-state={summary.status}
              className={cn(
                "grid min-w-[320px] gap-2 rounded-3xl border p-4",
                toneClass(summary.status)
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em]">
                  Alignment status
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-current/15 bg-white/70 font-mono text-[10px] uppercase tracking-[0.2em]",
                    summary.status === "running" && "animate-pulse"
                  )}
                >
                  {statusCopy.label}
                </Badge>
              </div>

              <div className="grid gap-1 text-sm text-current/90 sm:grid-cols-3">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-current/70">
                    Reference
                  </div>
                  <div className="font-medium">
                    {formatReferencePreset(workspace.analysisProfile.referencePreset)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-current/70">
                    Assay
                  </div>
                  <div className="font-medium">{formatAssayType(assayType)}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-current/70">
                    Variant calling
                  </div>
                  <div className="font-medium">
                    {summary.readyForVariantCalling ? "Unlocked" : "Waiting on alignment"}
                  </div>
                </div>
              </div>

              {summary.status === "running" && latestRun ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-current/80">
                    <span>{runtimePhaseLabel(latestRun.runtimePhase) ?? "Run in progress"}</span>
                    <span>{Math.round(latestRun.progress * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full bg-current/80 transition-[width] duration-500"
                      style={{ width: `${Math.round(latestRun.progress * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {summary.status === "ready" && !summary.blockingReason ? (
                <div className="text-sm text-current/85">
                  Reference bundle will be prepared automatically on the first run if it is
                  missing locally.
                </div>
              ) : null}

              {summary.blockingReason ? (
                <div className="flex items-start gap-2 text-sm leading-5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{summary.blockingReason}</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Assay profile
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {assayOptions.map((option) => {
                  const selected = assayType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-testid={`alignment-assay-${option.value}`}
                      onClick={() => void handleAssaySelect(option.value)}
                      disabled={isSavingProfile || summary.status === "running"}
                      className={cn(
                        "rounded-[24px] border px-4 py-4 text-left transition",
                        selected
                          ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.12)]"
                          : "border-black/8 bg-white/80 text-slate-700 hover:border-black/15"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-lg font-semibold">{option.label}</span>
                        {selected ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-current/75">{option.note}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/8 bg-slate-50/75 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Action
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                One run generates aligned BAMs, indexes, and the QC files needed for the next stage.
              </p>
              <Button
                type="button"
                className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
                disabled={!canRun || isSubmitting || isSavingProfile}
                onClick={() => void handleRun()}
                data-testid="alignment-run-button"
              >
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : latestRun ? (
                  <RotateCcw className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {summary.status === "running"
                  ? "Alignment running"
                  : latestRun
                    ? "Rerun alignment"
                    : "Run alignment"}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-black/5 bg-white/75 shadow-sm shadow-black/5">
        <CardHeader className="border-b border-black/6 pb-4">
          <CardTitle className="text-lg">Tumor vs normal QC</CardTitle>
          <CardDescription>
            Four metrics that make it easy to sanity-check the alignment before variant calling.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {(["tumor", "normal"] as const).map((sampleLane) => {
              const metrics = summary.laneMetrics[sampleLane];
              return (
                <div
                  key={sampleLane}
                  className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,248,247,0.92))] p-4"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-black/6 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatLaneLabel(sampleLane)}
                      </div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {metrics?.totalReads
                          ? `${metrics.totalReads.toLocaleString()} reads`
                          : "Metrics pending"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "size-3 rounded-full",
                        sampleLane === "tumor"
                          ? "bg-[color:var(--lane-tumor)]"
                          : "bg-[color:var(--lane-normal)]"
                      )}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {metricDefinitions.map((definition) => (
                      <div
                        key={definition.key}
                        className="rounded-2xl border border-black/6 bg-white/80 px-3 py-3"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                          {definition.label}
                        </div>
                        <div className="mt-2 font-mono text-xl text-slate-900">
                          {definition.format(
                            metricValue(metrics, definition.key)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <details
        className="group rounded-[28px] border border-black/6 bg-white/75 p-5 shadow-sm shadow-black/5"
        data-testid="alignment-technical-panel"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Technical details</div>
            <div className="text-sm text-slate-500">
              Commands, timestamps, QC verdict, and downloadable artifacts.
            </div>
          </div>
          <Badge variant="outline" className="border-black/10 bg-white/80">
            {latestRun?.qcVerdict ? getQcVerdictLabel(latestRun.qcVerdict) : "Pending"}
          </Badge>
        </summary>

        <div className="mt-5 space-y-5 border-t border-black/6 pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-black/6 bg-white/80 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Latest run
              </div>
              <div className="mt-2 text-sm font-medium text-slate-900">
                {latestRun ? formatDateTime(latestRun.updatedAt) : "Not started"}
              </div>
            </div>
            <div className="rounded-2xl border border-black/6 bg-white/80 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Reference label
              </div>
              <div className="mt-2 text-sm font-medium text-slate-900">
                {latestRun?.referenceLabel ??
                  formatReferencePreset(workspace.analysisProfile.referencePreset)}
              </div>
            </div>
            <div className="rounded-2xl border border-black/6 bg-white/80 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                QC verdict
              </div>
              <div className="mt-2 text-sm font-medium text-slate-900">
                {latestRun?.qcVerdict ? getQcVerdictLabel(latestRun.qcVerdict) : "Pending"}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Exact commands
              </div>
              <div className="overflow-x-auto rounded-[24px] border border-black/6 bg-slate-950 px-4 py-4 text-xs text-slate-100">
                <pre className="whitespace-pre-wrap font-mono leading-6">
                  {latestRun?.commandLog.length
                    ? latestRun.commandLog.join("\n")
                    : "Command log will appear here after the first run."}
                </pre>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Artifacts
              </div>
              <div className="space-y-2">
                {summary.artifacts.length ? (
                  summary.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-black/6 bg-white/85 px-4 py-3 text-sm transition hover:border-black/12 hover:bg-white"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900">
                          {artifact.filename}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {artifact.sampleLane
                            ? `${formatLaneLabel(artifact.sampleLane)} · ${artifact.artifactKind}`
                            : artifact.artifactKind}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="font-mono text-xs text-slate-500">
                          {formatBytes(artifact.sizeBytes)}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full px-3"
                          onClick={() =>
                            void handleOpenArtifact(
                              artifact.localPath,
                              artifact.downloadPath
                            )
                          }
                        >
                          <FolderOpen className="size-3.5" />
                          Open
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-white/70 px-4 py-4 text-sm text-slate-500">
                    BAM, BAI, flagstat, idxstats, and stats files will appear here after alignment finishes.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
