"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import type {
  VariantCallingArtifact,
  VariantCallingStageSummary,
  Workspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatBytes, formatDateTime } from "@/lib/workspace-utils";

interface VariantCallingStagePanelProps {
  workspace: Workspace;
  initialSummary: VariantCallingStageSummary;
}

type BannerState = "blocked" | "ready" | "running" | "completed" | "failed";

function bannerStateOf(summary: VariantCallingStageSummary): BannerState {
  if (summary.status === "blocked") return "blocked";
  if (summary.status === "running") return "running";
  if (summary.status === "completed") return "completed";
  if (summary.status === "failed") return "failed";
  return "ready";
}

const PILL_TONES: Record<BannerState, { label: string; bg: string; dot: string }> = {
  blocked: { label: "Locked", bg: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
  ready: { label: "Ready", bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  running: { label: "Running", bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  completed: { label: "Complete", bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  failed: { label: "Failed", bg: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};

function bannerMessage(state: BannerState, workspaceName: string, blockingReason?: string | null) {
  switch (state) {
    case "blocked":
      return blockingReason ?? "Finish alignment before calling variants.";
    case "ready":
      return `Ready to call somatic variants on ${workspaceName}.`;
    case "running":
      return "Variant calling is running…";
    case "completed":
      return "Variant calling finished. Somatic VCF is ready.";
    case "failed":
      return "Variant calling failed. Check the details below.";
  }
}

function runtimePhaseLabel(phase?: string | null) {
  if (phase === "preparing_reference") return "Preparing reference";
  if (phase === "calling") return "Calling variants";
  if (phase === "filtering") return "Filtering calls";
  if (phase === "finalizing") return "Finalizing files";
  return "Working";
}

function artifactKindLabel(kind: VariantCallingArtifact["artifactKind"]) {
  if (kind === "vcf") return "Somatic VCF";
  if (kind === "tbi") return "VCF index";
  return "Mutect2 stats";
}

export default function VariantCallingStagePanel({
  workspace,
  initialSummary,
}: VariantCallingStagePanelProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (summary.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => {
      void api
        .getVariantCallingStageSummary(workspace.id)
        .then(setSummary)
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [summary.status, workspace.id]);

  const bannerState = bannerStateOf(summary);
  const pill = PILL_TONES[bannerState];
  const latestRun = summary.latestRun;
  const isRunning = summary.status === "running";
  const canRun = summary.status === "ready" || summary.status === "failed" || summary.status === "completed";

  const handleRun = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const next =
        summary.status === "completed"
          ? await api.rerunVariantCalling(workspace.id)
          : await api.runVariantCalling(workspace.id);
      setSummary(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start variant calling");
    } finally {
      setIsSubmitting(false);
    }
  }, [summary.status, workspace.id]);

  const handleOpenArtifact = useCallback(
    async (artifact: VariantCallingArtifact) => {
      const desktop = getDesktopBridge();
      const localPath = artifact.localPath ?? null;
      if (!desktop || !localPath) {
        window.location.href = api.resolveDownloadUrl(artifact.downloadPath);
        return;
      }
      await desktop.openPath(localPath);
    },
    []
  );

  return (
    <div className="space-y-3" data-testid="variant-calling-stage-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 pb-2">
        <p className="text-sm text-stone-600">
          {bannerMessage(bannerState, workspace.displayName, summary.blockingReason)}
        </p>
        <span
          data-testid="variant-calling-stage-status-strip"
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
            <h3 className="text-[15px] font-semibold text-stone-900">Somatic variant calling</h3>
            <p className="mt-0.5 text-[13px] text-stone-500">
              Runs GATK Mutect2 on the aligned tumor and normal BAMs, then
              filters calls to produce a somatic VCF. This stage is scaffolded;
              the Mutect2 orchestration itself is still work in progress.
            </p>
          </div>

          {bannerState === "blocked" ? (
            <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[13px] text-stone-600">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-stone-400" />
              <span>{summary.blockingReason ?? "Locked — finish alignment first."}</span>
            </div>
          ) : null}

          <div className="border-t border-stone-100 pt-4">
            {isRunning && latestRun ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-[13px] text-stone-700">
                  <div className="flex items-center gap-2">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    {runtimePhaseLabel(latestRun.runtimePhase)}
                  </div>
                  <span className="font-mono text-[11px] text-stone-500">
                    {Math.round(latestRun.progress * 100)}%
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-emerald-500/70 transition-[width] duration-500"
                    style={{
                      width: `${Math.max(3, Math.round(latestRun.progress * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : bannerState !== "blocked" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-stone-500">
                  Writes <span className="font-mono text-[12px]">somatic.vcf.gz</span>{" "}
                  + index + Mutect2 stats. Runs on the existing tumor/normal BAMs.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-stone-900 px-4 text-white hover:bg-stone-800"
                  disabled={!canRun || isSubmitting}
                  onClick={() => void handleRun()}
                  data-testid="variant-calling-run-button"
                >
                  {isSubmitting ? (
                    <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                  ) : latestRun ? (
                    <RotateCcw className="mr-1.5 size-3.5" />
                  ) : (
                    <Play className="mr-1.5 size-3.5" />
                  )}
                  {latestRun ? "Run again" : "Start variant calling"}
                </Button>
              </div>
            ) : null}
          </div>

          {latestRun?.error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{latestRun.error}</span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <details className="group rounded-2xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] text-stone-600 transition-colors hover:text-stone-900">
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3 transition-transform duration-200 group-open:rotate-90" />
            <span className="font-medium text-stone-900">Technical details</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
            run info · artifacts · commands
          </span>
        </summary>

        <div className="space-y-4 border-t border-stone-100 px-5 py-4">
          {latestRun ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                  Started
                </div>
                <div className="mt-0.5 text-[13px] text-stone-900">
                  {latestRun.startedAt ? formatDateTime(latestRun.startedAt) : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                  Completed
                </div>
                <div className="mt-0.5 text-[13px] text-stone-900">
                  {latestRun.completedAt ? formatDateTime(latestRun.completedAt) : "—"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                  Status
                </div>
                <div className="mt-0.5 text-[13px] text-stone-900">
                  {latestRun.status}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-stone-500">
              No runs yet. Starting variant calling will populate this section.
            </p>
          )}

          {latestRun && latestRun.commandLog.length > 0 ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                Command log
              </div>
              <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[11px] leading-5 text-stone-700">
                {latestRun.commandLog.join("\n")}
              </pre>
            </div>
          ) : null}

          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
              Output files
            </div>
            {summary.artifacts.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {summary.artifacts.map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-stone-900">
                        {artifact.filename}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                        <span>{artifactKindLabel(artifact.artifactKind)}</span>
                        <span className="text-stone-300">·</span>
                        <span>{formatBytes(artifact.sizeBytes)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleOpenArtifact(artifact)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1 text-[11px] text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                    >
                      <FolderOpen className="size-3" />
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[13px] text-stone-500">
                VCF and stats files will appear here after variant calling finishes.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
