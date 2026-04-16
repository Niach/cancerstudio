"use client";

import { ChevronRight, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";

import { AlignmentComputeSettings } from "@/components/workspaces/alignment/AlignmentComputeSettings";
import type {
  AlignmentRun,
  AlignmentStageSummary,
  ChunkProgressState,
  SampleLane,
  SystemMemoryResponse,
  Workspace,
} from "@/lib/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatBytes,
  formatDateTime,
  formatLaneLabel,
  formatReferencePreset,
  getQcVerdictLabel,
} from "@/lib/workspace-utils";

const LANES: SampleLane[] = ["tumor", "normal"];

const PHASE_LABELS: Record<ChunkProgressState["phase"], string> = {
  splitting: "Splitting",
  aligning: "Aligning",
  merging: "Merging",
};

const PHASE_TONES: Record<ChunkProgressState["phase"], string> = {
  splitting: "bg-stone-100 text-stone-600",
  aligning: "bg-amber-50 text-amber-700",
  merging: "bg-emerald-50 text-emerald-700",
};

export function AlignmentAdvancedDetails({
  workspace,
  summary,
  latestRun,
  isRunning,
  onOpenArtifact,
}: {
  workspace: Workspace;
  summary: AlignmentStageSummary;
  latestRun?: AlignmentRun | null;
  isRunning: boolean;
  onOpenArtifact: (localPath?: string | null, downloadPath?: string) => Promise<void> | void;
}) {
  return (
    <details
      className="group rounded-2xl border border-stone-200 bg-white"
      data-testid="alignment-technical-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] text-stone-600 transition-colors hover:text-stone-900">
        <span className="font-medium text-stone-900">Advanced details</span>
        <ChevronRight className="size-3 shrink-0 text-stone-400 transition-transform duration-200 group-open:rotate-90" />
      </summary>

      <div className="space-y-4 border-t border-stone-100 px-5 py-4 text-[13px]">
        {isRunning && latestRun ? (
          <section className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-4">
            <div>
              <div className="text-[13px] font-medium text-stone-900">
                Live diagnostics
              </div>
              <p className="mt-1 text-[12px] leading-5 text-stone-500">
                These signals help if you want to inspect memory usage, chunk activity,
                and the latest commands while a long run is in progress.
              </p>
            </div>
            <MemoryHairline />
            <ChunkProgressStrips run={latestRun} />
            <CommandTailStrip lines={latestRun.recentLogTail} />
          </section>
        ) : null}

        <AlignmentComputeSettings disabled={isRunning} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
              Latest run
            </div>
            <div className="mt-0.5 text-stone-800">
              {latestRun ? formatDateTime(latestRun.updatedAt) : "Not started"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
              Reference
            </div>
            <div className="mt-0.5 text-stone-800">
              {latestRun?.referenceLabel ??
                formatReferencePreset(workspace.analysisProfile.referencePreset)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
              QC verdict
            </div>
            <div className="mt-0.5 text-stone-800">
              {latestRun?.qcVerdict ? getQcVerdictLabel(latestRun.qcVerdict) : "Pending"}
            </div>
          </div>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
            Commands
          </div>
          <pre className="mt-1.5 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 font-mono text-[11px] leading-5 whitespace-pre-wrap text-stone-700">
            {latestRun?.commandLog.length
              ? latestRun.commandLog.join("\n")
              : "Command log will appear here after the first run."}
          </pre>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
            Output files
          </div>
          {summary.artifacts.length ? (
            <ul className="mt-1.5 space-y-1">
              {summary.artifacts.map((artifact) => (
                <li
                  key={artifact.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-800">
                      {artifact.filename}
                    </div>
                    <div className="font-mono text-[10px] text-stone-400">
                      {artifact.sampleLane
                        ? `${formatLaneLabel(artifact.sampleLane)} · ${artifact.artifactKind}`
                        : artifact.artifactKind}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-stone-400">
                      {formatBytes(artifact.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void onOpenArtifact(artifact.localPath, artifact.downloadPath)
                      }
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                    >
                      <FolderOpen className="size-3" />
                      Open
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[12px] text-stone-400">
              BAM, BAI, flagstat, idxstats, and stats files will appear here after alignment finishes.
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

function MemoryHairline() {
  const [memory, setMemory] = useState<SystemMemoryResponse | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchMemory = () => {
      void api
        .getSystemMemory()
        .then((response) => {
          if (!cancelled) setMemory(response);
        })
        .catch(() => {});
    };

    fetchMemory();
    const timer = window.setInterval(fetchMemory, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!memory || memory.availableBytes == null || memory.totalBytes == null) {
    return null;
  }

  const usedBytes = memory.totalBytes - memory.availableBytes;
  const usedRatio = Math.min(1, Math.max(0, usedBytes / memory.totalBytes));
  const availabilityRatio = memory.availableBytes / memory.thresholdBytes;

  const tone =
    availabilityRatio < 1
      ? "rose"
      : availabilityRatio < 1.5
        ? "amber"
        : "stone";

  const fillClass =
    tone === "rose"
      ? "bg-rose-500/80"
      : tone === "amber"
        ? "bg-amber-500/80"
        : "bg-stone-400/60";

  const readoutClass =
    tone === "rose"
      ? "text-rose-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-stone-500";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-stone-100 transition-all duration-200",
          isHovered ? "h-[3px]" : "h-px"
        )}
      >
        <div
          className={cn("h-full transition-all duration-500", fillClass)}
          style={{ width: `${usedRatio * 100}%` }}
        />
      </div>
      {isHovered ? (
        <div
          className={cn(
            "mt-0.5 text-right font-mono text-[10px] tabular-nums tracking-[0.08em]",
            readoutClass
          )}
        >
          {(usedBytes / 1024 ** 3).toFixed(1)} / {(memory.totalBytes / 1024 ** 3).toFixed(1)} GiB
        </div>
      ) : null}
    </div>
  );
}

function ChunkProgressStrips({ run }: { run: AlignmentRun }) {
  const states = run.chunkProgress ?? {};

  return (
    <div className="space-y-1.5">
      {LANES.map((lane) => {
        const state = states[lane];
        return (
          <ChunkProgressStrip
            key={lane}
            lane={lane}
            state={state ?? null}
            expectedTotal={run.expectedTotalPerLane?.[lane] ?? null}
            runStatus={run.status}
          />
        );
      })}
    </div>
  );
}

function ChunkProgressStrip({
  lane,
  state,
  expectedTotal,
  runStatus,
}: {
  lane: SampleLane;
  state: ChunkProgressState | null;
  expectedTotal: number | null;
  runStatus: AlignmentRun["status"];
}) {
  const total = state?.totalChunks ?? 0;
  const completed = state?.completedChunks ?? 0;
  const active = state?.activeChunks ?? 0;
  const phase = state?.phase ?? null;
  const isSplittingPlaceholder =
    runStatus === "running" && total === 0 && (phase === null || phase === "splitting");

  const cells = total > 0 ? total : 24;
  const completedClamped = Math.min(completed, cells);
  const activeStart = completedClamped;
  const activeEnd = Math.min(cells, completedClamped + active);

  return (
    <div className="flex items-center gap-2.5" data-lane={lane}>
      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
        {lane}
      </span>
      {phase ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]",
            PHASE_TONES[phase]
          )}
        >
          {PHASE_LABELS[phase]}
        </span>
      ) : isSplittingPlaceholder ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]",
            PHASE_TONES.splitting
          )}
        >
          {PHASE_LABELS.splitting}
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center rounded-full bg-stone-100 px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-400">
          Waiting
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-[2px]">
          {Array.from({ length: cells }).map((_, index) => {
            if (isSplittingPlaceholder) {
              return (
                <span
                  key={index}
                  className="h-1.5 flex-1 animate-pulse rounded-[1px] bg-stone-200"
                />
              );
            }
            let tint = "bg-stone-200";
            if (index < completedClamped) tint = "bg-emerald-500";
            else if (index >= activeStart && index < activeEnd) tint = "bg-amber-400";
            return (
              <span
                key={index}
                className={cn("h-1.5 flex-1 rounded-[1px] transition-colors", tint)}
              />
            );
          })}
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-stone-500">
          {total > 0
            ? `${completed}/${total}`
            : isSplittingPlaceholder && expectedTotal
              ? `~${expectedTotal}`
              : "—"}
        </span>
      </div>
    </div>
  );
}

function CommandTailStrip({ lines }: { lines: string[] }) {
  if (!lines || lines.length === 0) return null;
  return (
    <div
      className="space-y-0.5 rounded-md bg-stone-50 px-2 py-1.5 font-mono text-[10px] leading-4 text-stone-500"
      data-testid="alignment-command-tail"
    >
      {lines.map((line, index) => (
        <div key={index} className="truncate" title={line}>
          {line}
        </div>
      ))}
    </div>
  );
}
