"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  CloudDownload,
  FileText,
  FolderOpen,
  LockKeyhole,
  Pause,
  Play,
  RotateCw,
  Sparkles,
  Square,
} from "lucide-react";

import AnnotatedVariantsTable from "@/components/workspaces/annotation/AnnotatedVariantsTable";
import CancerGeneHits from "@/components/workspaces/annotation/CancerGeneHits";
import ConsequenceDonut from "@/components/workspaces/annotation/ConsequenceDonut";
import GeneLollipop from "@/components/workspaces/annotation/GeneLollipop";
import ImpactSummary from "@/components/workspaces/annotation/ImpactSummary";

import {
  api,
  InsufficientMemoryError,
  MissingToolsError,
  StageNotActionableError,
} from "@/lib/api";
import { getDesktopBridge } from "@/lib/desktop";
import type {
  AnnotationArtifact,
  AnnotationRuntimePhase,
  AnnotationStageSummary,
  GeneFocus,
  Workspace,
} from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/workspace-utils";
import { cn } from "@/lib/utils";

interface AnnotationStagePanelProps {
  workspace: Workspace;
  initialSummary: AnnotationStageSummary;
}

type BannerState =
  | "blocked"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed";

function bannerStateOf(summary: AnnotationStageSummary): BannerState {
  if (summary.status === "blocked") return "blocked";
  if (summary.status === "running") return "running";
  if (summary.status === "paused") return "paused";
  if (summary.status === "completed") return "completed";
  if (summary.status === "failed") return "failed";
  return "ready";
}

const PILL_TONES: Record<BannerState, { label: string; bg: string; dot: string }> = {
  blocked: { label: "Locked", bg: "bg-stone-100 text-stone-500", dot: "bg-stone-400" },
  ready: { label: "Ready", bg: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  running: { label: "Running", bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  paused: { label: "Paused", bg: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  completed: { label: "Complete", bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  failed: { label: "Failed", bg: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
};

function artifactKindLabel(kind: AnnotationArtifact["artifactKind"]) {
  if (kind === "annotated_vcf") return "Annotated VCF";
  if (kind === "annotated_vcf_index") return "VCF index";
  if (kind === "vep_summary") return "VEP summary (HTML)";
  if (kind === "vep_warnings") return "VEP warnings";
  return kind;
}

export default function AnnotationStagePanel({
  workspace,
  initialSummary,
}: AnnotationStagePanelProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [actionError, setActionError] = useState<string | null>(null);
  const [missingTools, setMissingTools] = useState<{
    tools: string[];
    hints: string[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedGene, setFocusedGene] = useState<string | null>(null);
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
    if (summary.status !== "running" && summary.status !== "paused") {
      return;
    }
    const timer = window.setInterval(() => {
      void api
        .getAnnotationStageSummary(workspace.id)
        .then(setSummary)
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [summary.status, workspace.id]);

  const bannerState = bannerStateOf(summary);
  const pill = PILL_TONES[bannerState];
  const latestRun = summary.latestRun;
  const metrics = latestRun?.metrics ?? null;

  const activeFocus: GeneFocus | null = useMemo(() => {
    if (!metrics?.topGeneFocus) return null;
    if (focusedGene && focusedGene !== metrics.topGeneFocus.symbol) {
      const hit = metrics.cancerGeneHits.find((h) => h.symbol === focusedGene);
      if (hit) {
        // Synthesize a focus view from the matching hit's subset of top variants.
        const variants = metrics.topVariants
          .filter((v) => v.geneSymbol === focusedGene)
          .map((v) => ({
            chromosome: v.chromosome,
            position: v.position,
            proteinPosition: v.proteinPosition ?? null,
            hgvsp: v.hgvsp ?? null,
            hgvsc: v.hgvsc ?? null,
            consequence: v.consequence,
            impact: v.impact,
            tumorVaf: v.tumorVaf ?? null,
          }));
        if (variants.length === 0) return metrics.topGeneFocus;
        return {
          symbol: hit.symbol,
          role: hit.role,
          transcriptId: null,
          proteinLength: null,
          variants,
        };
      }
    }
    return metrics.topGeneFocus;
  }, [metrics, focusedGene]);

  const handleRun = useCallback(async () => {
    setActionError(null);
    setMissingTools(null);
    setIsSubmitting(true);
    try {
      const next = await api.runAnnotation(workspace.id);
      setSummary(next);
    } catch (error) {
      if (error instanceof MissingToolsError) {
        setMissingTools({ tools: error.tools, hints: error.hints });
      } else if (error instanceof InsufficientMemoryError) {
        setActionError(error.message);
      } else if (error instanceof StageNotActionableError) {
        setActionError(error.message);
      } else if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError("Unable to start annotation.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [workspace.id]);

  const handleRerun = useCallback(async () => {
    setActionError(null);
    setMissingTools(null);
    setIsSubmitting(true);
    try {
      const next = await api.rerunAnnotation(workspace.id);
      setSummary(next);
      setFocusedGene(null);
    } catch (error) {
      if (error instanceof MissingToolsError) {
        setMissingTools({ tools: error.tools, hints: error.hints });
      } else if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError("Unable to rerun annotation.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [workspace.id]);

  const handleCancel = useCallback(async () => {
    if (!latestRun) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const next = await api.cancelAnnotation(workspace.id, latestRun.id);
      setSummary(next);
    } catch (error) {
      if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError("Unable to stop the run.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [workspace.id, latestRun]);

  const handlePause = useCallback(async () => {
    if (!latestRun) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const next = await api.pauseAnnotation(workspace.id, latestRun.id);
      setSummary(next);
    } catch (error) {
      if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError("Unable to pause the run.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [workspace.id, latestRun]);

  const handleResume = useCallback(async () => {
    if (!latestRun) return;
    setActionError(null);
    setIsSubmitting(true);
    try {
      const next = await api.resumeAnnotation(workspace.id, latestRun.id);
      setSummary(next);
    } catch (error) {
      if (error instanceof Error) {
        setActionError(error.message);
      } else {
        setActionError("Unable to resume the run.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [workspace.id, latestRun]);

  const handleOpenArtifact = useCallback(
    async (artifact: AnnotationArtifact) => {
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

  const elapsedLabel = useMemo(() => {
    if (!latestRun?.startedAt) return null;
    const started = new Date(latestRun.startedAt).getTime();
    if (Number.isNaN(started)) return null;
    const referenceTime = latestRun.completedAt
      ? new Date(latestRun.completedAt).getTime()
      : Date.now();
    const elapsedMs = Math.max(0, referenceTime - started);
    const minutes = Math.floor(elapsedMs / 60_000);
    const seconds = Math.floor((elapsedMs % 60_000) / 1000);
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }, [latestRun?.startedAt, latestRun?.completedAt]);

  const showDescription =
    bannerState !== "running" &&
    bannerState !== "paused" &&
    bannerState !== "completed";

  return (
    <div className="space-y-3" data-testid="annotation-stage-panel">
      <section className="rounded-2xl border border-stone-200 bg-white">
        <div className="space-y-5 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-display text-[22px] leading-tight font-light text-stone-900">
                  Read what the mutations mean
                </h3>
                <span
                  data-testid="annotation-stage-status-strip"
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
              {showDescription ? (
                <p className="mt-2 text-[13px] leading-6 text-stone-500">
                  We check each mutation against what scientists already know —
                  which gene it&apos;s in, whether it changes the protein, and
                  whether that gene is on the list of genes that matter in cancer.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {bannerState === "ready" ? (
                <button
                  type="button"
                  data-testid="annotation-run-button"
                  disabled={isSubmitting}
                  onClick={handleRun}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play className="size-3" />
                  Annotate mutations
                </button>
              ) : null}
              {bannerState === "running" && latestRun ? (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handlePause}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Pause className="size-3" />
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Square className="size-3" />
                    Cancel & discard
                  </button>
                </>
              ) : null}
              {bannerState === "paused" && latestRun ? (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Square className="size-3" />
                    Discard & restart
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleResume}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Play className="size-3" />
                    Resume
                  </button>
                </>
              ) : null}
              {(bannerState === "completed" || bannerState === "failed") ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleRerun}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCw className="size-3" />
                  Annotate again
                </button>
              ) : null}
            </div>
          </div>

          {bannerState === "blocked" ? (
            <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-[13px] text-stone-600">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-stone-400" />
              <span>{summary.blockingReason ?? "Locked — finish the mutation search first."}</span>
            </div>
          ) : null}

          {missingTools ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-3.5" />
                Install {missingTools.tools.join(" and ")} to continue
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-amber-800">
                {missingTools.hints.map((hint, index) => (
                  <li key={index} className="font-mono text-[11px] leading-5">
                    {hint}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {actionError ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          ) : null}

          {bannerState === "running" && latestRun ? (
            <div className="space-y-2.5">
              {latestRun.cachePending ? (
                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-[13px] text-sky-900">
                  <CloudDownload className="mt-0.5 size-4 shrink-0 text-sky-700" />
                  <div>
                    <div className="font-medium">
                      Downloading the gene-knowledge database
                      {latestRun.cacheSpeciesLabel
                        ? ` for ${latestRun.cacheSpeciesLabel}`
                        : ""}
                    </div>
                    <p className="mt-1 leading-6 text-sky-900/80">
                      This one-time download is{" "}
                      {latestRun.cacheExpectedMegabytes
                        ? `about ${
                            latestRun.cacheExpectedMegabytes >= 1000
                              ? `${(latestRun.cacheExpectedMegabytes / 1000).toFixed(
                                  1
                                )} GB`
                              : `${latestRun.cacheExpectedMegabytes} MB`
                          }`
                        : "a few hundred megabytes"}
                      . Future annotations will start immediately.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
                <span>{phaseRunningLabel(latestRun.runtimePhase)}</span>
                <span className="flex items-center gap-2">
                  <span>{elapsedLabel}</span>
                  <span className="text-stone-300">·</span>
                  <span>{Math.round(latestRun.progress * 100)}%</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500 transition-[width] duration-500"
                  style={{
                    width: `${Math.max(3, Math.round(latestRun.progress * 100))}%`,
                  }}
                />
              </div>
              <PhaseTimeline currentPhase={latestRun.runtimePhase} />
            </div>
          ) : null}

          {bannerState === "paused" && latestRun ? (
            <div className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-[13px] text-indigo-900">
              <Pause className="mt-0.5 size-4 shrink-0 text-indigo-700" />
              <div>
                <div className="font-medium">Paused</div>
                <p className="mt-1 leading-6 text-indigo-900/80">
                  Annotation runs in one short phase. Resume to pick it back up
                  from annotating — discard wipes the run and starts fresh.
                </p>
              </div>
            </div>
          ) : null}

          {bannerState === "ready" && !latestRun ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[13px] text-emerald-900">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              <div>
                <div className="font-medium">Ready to annotate</div>
                <p className="mt-1 leading-6 text-emerald-800/90">
                  This runs on your computer using a curated gene-knowledge
                  database for your pet&apos;s species. When it finishes, you
                  get a plain-English readout of every mutation — which gene,
                  what changed, how severe.
                </p>
              </div>
            </div>
          ) : null}

          {latestRun?.error && bannerState === "failed" ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-3.5" />
                Annotation failed
              </div>
              <p className="mt-1 font-mono text-[11px] leading-5 text-rose-700">
                {latestRun.error}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {metrics && metrics.annotatedVariants > 0 ? (
        <>
          <CompletionHeadline
            annotated={metrics.annotatedVariants}
            total={metrics.totalVariants}
            cancerVariantCount={metrics.cancerGeneVariantCount}
            cancerGeneCount={metrics.cancerGeneHits.length}
            speciesLabel={metrics.speciesLabel}
          />

          <ImpactSummary metrics={metrics} />

          <CancerGeneHits
            hits={metrics.cancerGeneHits}
            selectedSymbol={focusedGene ?? metrics.topGeneFocus?.symbol ?? null}
            onSelect={setFocusedGene}
          />

          {activeFocus && activeFocus.variants.length > 0 ? (
            <GeneLollipop focus={activeFocus} />
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <ConsequenceDonut entries={metrics.byConsequence} />
            <ReferenceCard
              speciesLabel={metrics.speciesLabel ?? null}
              referenceLabel={metrics.referenceLabel ?? null}
              vepRelease={metrics.vepRelease ?? null}
              cancerHitsCount={metrics.cancerGeneHits.length}
              totalAnnotated={metrics.annotatedVariants}
            />
          </div>

          <AnnotatedVariantsTable variants={metrics.topVariants} />
        </>
      ) : null}

      {bannerState === "completed" &&
      (!metrics || metrics.annotatedVariants === 0) ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-6 text-[13px] text-stone-600">
          The annotator finished, but no mutations made it through. This is
          unusual on real data — open the technical details and check the
          VEP warnings file.
        </div>
      ) : null}

      <details className="group rounded-2xl border border-stone-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[13px] text-stone-600 transition-colors hover:text-stone-900">
          <div className="flex items-center gap-2">
            <ChevronRight className="size-3 transition-transform duration-200 group-open:rotate-90" />
            <span className="font-medium text-stone-900">Technical details</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
            Ensembl VEP · cache · commands · artifacts
          </span>
        </summary>

        <div className="space-y-4 border-t border-stone-100 px-5 py-4">
          {latestRun ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailCell
                label="Started"
                value={latestRun.startedAt ? formatDateTime(latestRun.startedAt) : "—"}
              />
              <DetailCell
                label="Completed"
                value={latestRun.completedAt ? formatDateTime(latestRun.completedAt) : "—"}
              />
              <DetailCell label="Status" value={latestRun.status} />
              {metrics?.referenceLabel ? (
                <DetailCell label="Reference" value={metrics.referenceLabel} />
              ) : null}
              {metrics?.speciesLabel ? (
                <DetailCell label="Species cache" value={metrics.speciesLabel} />
              ) : null}
              {metrics?.vepRelease ? (
                <DetailCell label="VEP release" value={metrics.vepRelease} />
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] text-stone-500">
              No runs yet. Start annotation from the control bar above — run info,
              command log, and artifacts will land here.
            </p>
          )}

          {latestRun && latestRun.commandLog.length > 0 ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
                Command log
              </div>
              <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg border border-stone-200 bg-stone-950 px-3 py-2 font-mono text-[11px] leading-5 text-emerald-200/90">
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
                      {artifact.artifactKind === "vep_summary" ? (
                        <FileText className="size-3" />
                      ) : (
                        <FolderOpen className="size-3" />
                      )}
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-[13px] text-stone-500">
                Annotation output files will appear here once a run completes.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2 text-[11px] text-stone-500">
            Annotator: Ensembl VEP · plugins: Frameshift, Wildtype, Downstream
            (pVACseq-ready) · cache stored at{" "}
            <span className="font-mono text-stone-700">/vep-cache</span> on the
            desktop data volume.
          </div>
        </div>
      </details>
    </div>
  );
}

function CompletionHeadline({
  annotated,
  total,
  cancerVariantCount,
  cancerGeneCount,
  speciesLabel,
}: {
  annotated: number;
  total: number;
  cancerVariantCount: number;
  cancerGeneCount: number;
  speciesLabel: string | null | undefined;
}) {
  const missingHeadline = cancerGeneCount === 0;
  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white px-5 py-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 size-4 shrink-0 text-emerald-600" />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-800/80">
            Annotated
          </div>
          <h3 className="mt-0.5 font-display text-[22px] leading-tight font-light text-stone-900">
            We read {annotated.toLocaleString()} mutation{annotated === 1 ? "" : "s"} in your pet&apos;s tumor.{" "}
            {missingHeadline ? (
              <span className="text-stone-500">
                None of them landed in the curated cancer-gene list for this run.
              </span>
            ) : (
              <span>
                <span className="font-semibold text-emerald-700">
                  {cancerVariantCount.toLocaleString()}
                </span>{" "}
                fell in{" "}
                <span className="font-semibold text-emerald-700">
                  {cancerGeneCount}
                </span>{" "}
                gene{cancerGeneCount === 1 ? "" : "s"} linked to cancer before.
              </span>
            )}
          </h3>
          <p className="mt-1 text-[12px] leading-6 text-stone-500">
            Annotated against {speciesLabel ?? "the local reference"}. Of{" "}
            {total.toLocaleString()} called variants, {annotated.toLocaleString()}{" "}
            fell in a transcript we could map.
          </p>
        </div>
      </div>
    </section>
  );
}

function ReferenceCard({
  speciesLabel,
  referenceLabel,
  vepRelease,
  cancerHitsCount,
  totalAnnotated,
}: {
  speciesLabel: string | null;
  referenceLabel: string | null;
  vepRelease: string | null;
  cancerHitsCount: number;
  totalAnnotated: number;
}) {
  const cancerPct =
    totalAnnotated > 0
      ? Math.round((cancerHitsCount / totalAnnotated) * 10_000) / 100
      : 0;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
        What we matched against
      </div>
      <h4 className="mt-0.5 font-display text-[18px] font-light text-stone-900">
        Your pet&apos;s mutations vs. the reference knowledge
      </h4>
      <dl className="mt-3 space-y-2 text-[12px] text-stone-600">
        <div className="flex justify-between gap-3 border-b border-stone-100 pb-1.5">
          <dt className="text-stone-500">Species / assembly</dt>
          <dd className="text-stone-800">{speciesLabel ?? referenceLabel ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-stone-100 pb-1.5">
          <dt className="text-stone-500">Annotator</dt>
          <dd className="text-stone-800">
            Ensembl VEP
            {vepRelease ? ` · release ${vepRelease}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-stone-100 pb-1.5">
          <dt className="text-stone-500">Cancer-gene list</dt>
          <dd className="text-stone-800">Curated from published driver lists</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stone-500">Cancer-gene hit rate</dt>
          <dd className="text-stone-800" style={{ fontVariantNumeric: "tabular-nums" }}>
            {cancerPct.toFixed(2)}% of annotated variants
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] text-stone-900">{value}</div>
    </div>
  );
}

function phaseRunningLabel(phase: AnnotationRuntimePhase | null | undefined): string {
  switch (phase) {
    case "installing_cache":
      return "Downloading gene-knowledge database";
    case "annotating":
      return "Matching mutations to genes";
    case "summarizing":
      return "Building your summary";
    case "finalizing":
      return "Wrapping up";
    default:
      return "Preparing";
  }
}

function PhaseTimeline({ currentPhase }: { currentPhase?: AnnotationRuntimePhase | null }) {
  const phases: Array<{ id: AnnotationRuntimePhase; label: string }> = [
    { id: "installing_cache", label: "Reference" },
    { id: "annotating", label: "Matching" },
    { id: "summarizing", label: "Summary" },
    { id: "finalizing", label: "Wrapping up" },
  ];
  const currentIndex = phases.findIndex((phase) => phase.id === currentPhase);
  return (
    <ol className="mt-2 grid grid-cols-4 gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-stone-500">
      {phases.map((phase, index) => {
        const isActive = index === currentIndex;
        const isDone = currentIndex >= 0 && index < currentIndex;
        return (
          <li
            key={phase.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1",
              isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : isDone
                  ? "border-stone-200 bg-white text-stone-600"
                  : "border-stone-100 bg-stone-50 text-stone-400"
            )}
          >
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                isActive
                  ? "bg-emerald-500 animate-pulse"
                  : isDone
                    ? "bg-stone-400"
                    : "bg-stone-300"
              )}
            />
            <span className="truncate">{phase.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
