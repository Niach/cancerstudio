"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FolderOpen, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { getDesktopBridge, isDesktopRuntime } from "@/lib/desktop";
import type {
  IngestionLanePreview,
  SampleLane,
  Workspace,
  WorkspaceFile,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface IngestionStagePanelProps {
  workspace: Workspace;
  onWorkspaceChange: (workspace: Workspace) => void;
}

const LANES: SampleLane[] = ["tumor", "normal"];

type PreviewState = {
  phase: "idle" | "loading" | "ready" | "failed";
  data: IngestionLanePreview | null;
  error: string | null;
};

function emptyPreviewState(): PreviewState {
  return { phase: "idle", data: null, error: null };
}

function laneLabel(lane: SampleLane) {
  return lane === "tumor" ? "Tumor" : "Normal";
}

function laneAccent(lane: SampleLane) {
  return lane === "tumor"
    ? "bg-[rgba(180,97,58,0.12)] text-[rgb(132,69,40)]"
    : "bg-[rgba(82,144,132,0.14)] text-[rgb(54,102,93)]";
}

function filePathForDisplay(file: WorkspaceFile) {
  return file.sourcePath ?? file.managedPath ?? file.filename;
}

function sourceFilesForLane(workspace: Workspace, lane: SampleLane) {
  const activeBatchId = workspace.ingestion.lanes[lane].activeBatchId;
  return workspace.files.filter(
    (file) =>
      file.sampleLane === lane &&
      file.fileRole === "source" &&
      file.batchId === activeBatchId
  );
}

function previewSummary(preview: IngestionLanePreview | null) {
  if (!preview) {
    return null;
  }
  return [
    `${preview.stats.sampledReadCount} reads sampled`,
    `${preview.stats.averageReadLength.toFixed(0)} bp avg length`,
    `${preview.stats.sampledGcPercent.toFixed(1)}% GC`,
  ];
}

export default function IngestionStagePanel({
  workspace,
  onWorkspaceChange,
}: IngestionStagePanelProps) {
  const [submittingLane, setSubmittingLane] = useState<SampleLane | null>(null);
  const [laneErrors, setLaneErrors] = useState<Record<SampleLane, string | null>>({
    tumor: null,
    normal: null,
  });
  const [manualPaths, setManualPaths] = useState<Record<SampleLane, string>>({
    tumor: "",
    normal: "",
  });
  const [previewStates, setPreviewStates] = useState<Record<SampleLane, PreviewState>>({
    tumor: emptyPreviewState(),
    normal: emptyPreviewState(),
  });
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!LANES.some((lane) => workspace.ingestion.lanes[lane].status === "normalizing")) {
      return;
    }

    const timer = window.setInterval(() => {
      void api
        .getWorkspace(workspace.id)
        .then(onWorkspaceChange)
        .catch(() => {});
    }, 2200);

    return () => window.clearInterval(timer);
  }, [onWorkspaceChange, workspace.id, workspace.ingestion]);

  useEffect(() => {
    for (const lane of LANES) {
      const summary = workspace.ingestion.lanes[lane];
      if (!summary.readyForAlignment) {
        continue;
      }
      if (previewStates[lane].phase !== "idle") {
        continue;
      }

      setPreviewStates((current) => ({
        ...current,
        [lane]: { phase: "loading", data: null, error: null },
      }));

      void api
        .getIngestionLanePreview(workspace.id, lane)
        .then((preview) => {
          setPreviewStates((current) => ({
            ...current,
            [lane]: { phase: "ready", data: preview, error: null },
          }));
        })
        .catch((error) => {
          setPreviewStates((current) => ({
            ...current,
            [lane]: {
              phase: "failed",
              data: null,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to load the preview.",
            },
          }));
        });
    }
  }, [previewStates, workspace.id, workspace.ingestion]);

  const alignmentState = workspace.ingestion.readyForAlignment ? "unlocked" : "locked";
  const desktopAvailable = useMemo(() => isDesktopRuntime(), []);

  async function registerPaths(sampleLane: SampleLane, paths: string[]) {
    if (!paths.length) {
      return;
    }

    setSubmittingLane(sampleLane);
    setLaneErrors((current) => ({ ...current, [sampleLane]: null }));
    try {
      const updatedWorkspace = await api.registerLocalLaneFiles(workspace.id, {
        sampleLane,
        paths,
      });
      onWorkspaceChange(updatedWorkspace);
      setPreviewStates((current) => ({
        ...current,
        [sampleLane]: emptyPreviewState(),
      }));
      setManualPaths((current) => ({ ...current, [sampleLane]: "" }));
    } catch (error) {
      setLaneErrors((current) => ({
        ...current,
        [sampleLane]:
          error instanceof Error ? error.message : "Unable to register files.",
      }));
    } finally {
      setSubmittingLane(null);
    }
  }

  async function handlePick(sampleLane: SampleLane) {
    const desktop = getDesktopBridge();
    if (!desktop) {
      setLaneErrors((current) => ({
        ...current,
        [sampleLane]:
          "Desktop file picking is unavailable here. Paste absolute paths below instead.",
      }));
      return;
    }
    const selected = await desktop.pickSequencingFiles();
    await registerPaths(
      sampleLane,
      selected.map((file) => file.path)
    );
  }

  async function handleManualSubmit(sampleLane: SampleLane) {
    const paths = manualPaths[sampleLane]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await registerPaths(sampleLane, paths);
  }

  async function handleReset() {
    if (!window.confirm("Reset ingestion and remove local derived outputs for this workspace?")) {
      return;
    }

    setIsResetting(true);
    try {
      const updatedWorkspace = await api.resetWorkspaceIngestion(workspace.id);
      onWorkspaceChange(updatedWorkspace);
      setPreviewStates({
        tumor: emptyPreviewState(),
        normal: emptyPreviewState(),
      });
      setManualPaths({ tumor: "", normal: "" });
      setLaneErrors({ tumor: null, normal: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to reset ingestion.";
      setLaneErrors({ tumor: message, normal: message });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-black/6 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(247,244,237,0.94))] p-6 shadow-[0_24px_70px_-40px_rgba(35,42,33,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500">
              Desktop intake
            </div>
            <h3 className="text-3xl font-semibold tracking-tight text-stone-900">
              Reference the source files in place. Keep the heavy outputs managed for you.
            </h3>
            <p className="text-[15px] leading-7 text-stone-600">
              Pick the tumor and normal sequencing files from disk. Cancerstudio reads the
              originals where they already live, then writes canonical FASTQs into its own
              workspace so alignment can stay reproducible without another upload step.
            </p>
          </div>

          <div className="min-w-[280px] rounded-[24px] border border-black/8 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-stone-500">
                Alignment gate
              </div>
              <Badge
                variant="outline"
                data-testid="alignment-status-indicator"
                data-state={alignmentState}
                className={cn(
                  "border-black/10 bg-stone-50 font-mono text-[10px] tracking-[0.2em] uppercase",
                  alignmentState === "unlocked"
                    ? "text-emerald-700"
                    : "text-stone-500"
                )}
              >
                {alignmentState}
              </Badge>
            </div>
            <div className="mt-3 text-sm leading-6 text-stone-600">
              {workspace.ingestion.readyForAlignment
                ? "Tumor and normal canonical FASTQs are ready. Alignment can run now."
                : "Both lanes need canonical paired FASTQ outputs before alignment unlocks."}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-black/10 bg-white text-stone-600">
                {desktopAvailable ? "Electron picker ready" : "Manual path mode"}
              </Badge>
              <Badge variant="outline" className="border-black/10 bg-white text-stone-600">
                Reference in place
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {LANES.map((lane) => {
          const laneSummary = workspace.ingestion.lanes[lane];
          const preview = previewStates[lane];
          const files = sourceFilesForLane(workspace, lane);
          const previewTokens = previewSummary(preview.data);
          const isBusy = submittingLane === lane;

          return (
            <section
              key={lane}
              data-testid={`${lane}-lane-panel`}
              data-summary-status={laneSummary.status}
              className="rounded-[28px] border border-black/6 bg-white/80 p-5 shadow-[0_16px_50px_-38px_rgba(26,33,26,0.45)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.24em]",
                        laneAccent(lane)
                      )}
                    >
                      {laneLabel(lane)}
                    </div>
                    <Badge variant="outline" className="border-black/10 bg-white text-stone-600">
                      {laneSummary.status}
                    </Badge>
                  </div>
                  <h4 className="text-xl font-semibold text-stone-900">
                    {lane === "tumor"
                      ? "Cancer specimen inputs"
                      : "Matched normal inputs"}
                  </h4>
                  <p className="text-sm leading-6 text-stone-600">
                    Accepted formats: paired FASTQ, BAM, or CRAM. The original files stay in
                    place; normalization outputs are written into the workspace cache.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handlePick(lane)}
                    disabled={isBusy}
                    data-testid={`${lane}-pick-files`}
                    className="rounded-full bg-stone-900 px-4 text-white hover:bg-stone-800"
                  >
                    {isBusy ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                    ) : (
                      <FolderOpen className="mr-2 size-4" />
                    )}
                    Choose files
                  </Button>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {files.length ? (
                  files.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-2xl border border-black/6 bg-[rgba(248,245,239,0.8)] px-4 py-3"
                    >
                      <div className="truncate text-sm font-medium text-stone-800">
                        {file.filename}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-stone-500">
                        {filePathForDisplay(file)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-[rgba(248,245,239,0.65)] px-4 py-6 text-sm text-stone-500">
                    No files registered for this lane yet.
                  </div>
                )}
              </div>

              <details className="mt-5 rounded-2xl border border-black/6 bg-[rgba(250,248,244,0.82)]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-stone-700">
                  Manual absolute-path entry
                </summary>
                <div className="border-t border-black/6 px-4 py-4">
                  <textarea
                    data-testid={`${lane}-manual-paths`}
                    value={manualPaths[lane]}
                    onChange={(event) =>
                      setManualPaths((current) => ({
                        ...current,
                        [lane]: event.target.value,
                      }))
                    }
                    placeholder={`/absolute/path/${lane}_R1.fastq.gz\n/absolute/path/${lane}_R2.fastq.gz`}
                    className="min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none ring-0 placeholder:text-stone-400 focus:border-stone-400"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void handleManualSubmit(lane)}
                    >
                      Register paths
                    </Button>
                  </div>
                </div>
              </details>

              {laneErrors[lane] ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {laneErrors[lane]}
                </div>
              ) : null}

              {laneSummary.blockingIssues.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="size-4" />
                    Needs attention
                  </div>
                  <ul className="mt-2 space-y-1 text-[13px] leading-6">
                    {laneSummary.blockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {previewTokens ? (
                <div
                  data-testid={`${lane}-preview-panel`}
                  data-phase={preview.phase}
                  className="mt-4 rounded-2xl border border-black/6 bg-[rgba(245,244,240,0.9)] px-4 py-4"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                    Canonical preview
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewTokens.map((token) => (
                      <Badge
                        key={token}
                        variant="outline"
                        className="border-black/8 bg-white text-stone-600"
                      >
                        {token}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : preview.phase === "loading" ? (
                <div
                  data-testid={`${lane}-preview-panel`}
                  data-phase="loading"
                  className="mt-4 flex items-center gap-2 rounded-2xl border border-black/6 bg-[rgba(245,244,240,0.9)] px-4 py-4 text-sm text-stone-600"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading canonical preview
                </div>
              ) : preview.phase === "failed" ? (
                <div
                  data-testid={`${lane}-preview-panel`}
                  data-phase="failed"
                  className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
                >
                  {preview.error}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleReset()}
          disabled={isResetting}
          className="rounded-full"
        >
          {isResetting ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 size-4" />
          )}
          Reset ingestion
        </Button>
      </div>
    </div>
  );
}
