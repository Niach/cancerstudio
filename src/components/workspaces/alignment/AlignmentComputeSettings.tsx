"use client";

import { Cpu, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type {
  AlignmentSettings,
  AlignmentSettingsPatch,
  SystemResourcesResponse,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function formatReadsLabel(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M reads`;
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K reads`;
  return `${value} reads`;
}

function formatGiBShort(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  return `${(bytes / 1024 ** 3).toFixed(0)} GiB`;
}

function formatTiBShort(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

function parseMemoryToGiB(value: string): number | null {
  const match = value.trim().match(/^(\d+)([KMGT]?)$/);
  if (!match) return null;
  const magnitude = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "K":
      return magnitude / (1024 * 1024);
    case "M":
      return magnitude / 1024;
    case "G":
    case "":
      return magnitude;
    case "T":
      return magnitude * 1024;
    default:
      return null;
  }
}

export function AlignmentComputeSettings({ disabled }: { disabled: boolean }) {
  const [resources, setResources] = useState<SystemResourcesResponse | null>(null);
  const [settings, setSettings] = useState<AlignmentSettings | null>(null);
  const [draft, setDraft] = useState<AlignmentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [resourcesResponse, settingsResponse] = await Promise.all([
        api.getSystemResources(),
        api.getAlignmentSettings(),
      ]);
      setResources(resourcesResponse);
      setSettings(settingsResponse);
      setDraft(settingsResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isDirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      settings.alignerThreads !== draft.alignerThreads ||
      settings.samtoolsThreads !== draft.samtoolsThreads ||
      settings.samtoolsSortThreads !== draft.samtoolsSortThreads ||
      settings.samtoolsSortMemory !== draft.samtoolsSortMemory ||
      settings.chunkReads !== draft.chunkReads ||
      settings.chunkParallelism !== draft.chunkParallelism
    );
  }, [settings, draft]);

  const isOverrideFromDefaults = useMemo(() => {
    if (!settings) return false;
    const defaults = settings.defaults;
    return (
      settings.alignerThreads !== defaults.alignerThreads ||
      settings.samtoolsThreads !== defaults.samtoolsThreads ||
      settings.samtoolsSortThreads !== defaults.samtoolsSortThreads ||
      settings.samtoolsSortMemory !== defaults.samtoolsSortMemory ||
      settings.chunkReads !== defaults.chunkReads ||
      settings.chunkParallelism !== defaults.chunkParallelism
    );
  }, [settings]);

  const updateField = useCallback(
    <K extends keyof AlignmentSettings>(key: K, value: AlignmentSettings[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const patch: AlignmentSettingsPatch = {
        alignerThreads: draft.alignerThreads,
        samtoolsThreads: draft.samtoolsThreads,
        samtoolsSortThreads: draft.samtoolsSortThreads,
        samtoolsSortMemory: draft.samtoolsSortMemory,
        chunkReads: draft.chunkReads,
        chunkParallelism: draft.chunkParallelism,
      };
      const updated = await api.updateAlignmentSettings(patch);
      setSettings(updated);
      setDraft(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const reset = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAlignmentSettings({ reset: true });
      setSettings(updated);
      setDraft(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset settings");
    } finally {
      setSaving(false);
    }
  }, []);

  const cpuCount = resources?.cpuCount ?? null;
  const totalMemGiB = resources?.totalMemoryBytes
    ? resources.totalMemoryBytes / 1024 ** 3
    : null;
  const availMemGiB = resources?.availableMemoryBytes
    ? resources.availableMemoryBytes / 1024 ** 3
    : null;

  const estimate = useMemo(() => {
    if (!draft) return null;
    const sortMemGiB = parseMemoryToGiB(draft.samtoolsSortMemory) ?? 2;
    const alignerBytesPerChunk = 8;
    const sortBytesPerChunk = draft.samtoolsSortThreads * sortMemGiB;
    const perChunk = alignerBytesPerChunk + sortBytesPerChunk;
    const userspace = 18;
    return draft.chunkParallelism * perChunk + userspace;
  }, [draft]);

  const estimateTone = useMemo(() => {
    if (estimate == null) return "stone";
    if (availMemGiB != null && estimate > availMemGiB) return "rose";
    if (totalMemGiB != null && estimate > totalMemGiB * 0.85) return "amber";
    return "stone";
  }, [estimate, availMemGiB, totalMemGiB]);

  const totalThreads = draft
    ? draft.alignerThreads * draft.chunkParallelism
    : null;
  const threadWarning =
    cpuCount != null && totalThreads != null && totalThreads > cpuCount;

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-3.5 text-stone-500" />
          <div>
            <div className="text-[13px] font-medium text-stone-900">
              Compute settings
            </div>
            <p className="text-[12px] text-stone-500">
              Optional expert controls. The defaults are the safest place to start.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
          <span>{cpuCount != null ? `${cpuCount} cores` : "—"}</span>
          <span className="text-stone-300">·</span>
          <span>{formatGiBShort(resources?.totalMemoryBytes)} ram</span>
          <span className="text-stone-300">·</span>
          <span>{formatTiBShort(resources?.appDataDiskFreeBytes)} free</span>
        </div>
      </div>

      {draft ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <ComputeField
              label="Chunk size"
              hint="Smaller chunks mean more overlap, but more merge work."
              defaultValue={formatReadsLabel(draft.defaults.chunkReads)}
            >
              <input
                type="number"
                min={1_000_000}
                max={200_000_000}
                step={1_000_000}
                value={draft.chunkReads}
                disabled={disabled || saving}
                onChange={(event) =>
                  updateField("chunkReads", Number(event.target.value))
                }
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[12px] tabular-nums text-stone-900 focus:border-emerald-400 focus:outline-none disabled:opacity-50"
              />
              <span className="mt-0.5 font-mono text-[10px] text-stone-400">
                {formatReadsLabel(draft.chunkReads)}
              </span>
            </ComputeField>

            <ComputeField
              label="Parallel chunks"
              hint="Two chunks is a safe default on a 64 GiB desktop."
              defaultValue={`${draft.defaults.chunkParallelism}`}
            >
              <input
                type="number"
                min={1}
                max={8}
                step={1}
                value={draft.chunkParallelism}
                disabled={disabled || saving}
                onChange={(event) =>
                  updateField("chunkParallelism", Number(event.target.value))
                }
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[12px] tabular-nums text-stone-900 focus:border-emerald-400 focus:outline-none disabled:opacity-50"
              />
            </ComputeField>

            <ComputeField
              label="Aligner threads per chunk"
              hint="Threads passed to strobealign for each active chunk."
              defaultValue={`${draft.defaults.alignerThreads}`}
            >
              <input
                type="number"
                min={1}
                max={256}
                step={1}
                value={draft.alignerThreads}
                disabled={disabled || saving}
                onChange={(event) =>
                  updateField("alignerThreads", Number(event.target.value))
                }
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[12px] tabular-nums text-stone-900 focus:border-emerald-400 focus:outline-none disabled:opacity-50"
              />
              {threadWarning ? (
                <span className="mt-0.5 font-mono text-[10px] text-amber-600">
                  {totalThreads} total threads &gt; {cpuCount} cores
                </span>
              ) : null}
            </ComputeField>

            <ComputeField
              label="Sort memory per thread"
              hint="samtools sort -m, for example 512M or 2G."
              defaultValue={draft.defaults.samtoolsSortMemory}
            >
              <input
                type="text"
                value={draft.samtoolsSortMemory}
                disabled={disabled || saving}
                onChange={(event) =>
                  updateField("samtoolsSortMemory", event.target.value)
                }
                className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-mono text-[12px] tabular-nums text-stone-900 focus:border-emerald-400 focus:outline-none disabled:opacity-50"
              />
            </ComputeField>
          </div>

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[12px]",
              estimateTone === "rose"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : estimateTone === "amber"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-stone-200 bg-white text-stone-600"
            )}
          >
            <div>
              <span className="font-medium">Expected peak RAM </span>
              <span className="font-mono tabular-nums">
                ~{estimate?.toFixed(0)} GiB
              </span>
              {totalMemGiB != null ? (
                <span className="text-stone-500"> of {totalMemGiB.toFixed(0)} GiB total</span>
              ) : null}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500">
              {draft.chunkParallelism} × (strobealign + sort) + userspace
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={disabled || saving || !isOverrideFromDefaults}
              className="text-[12px] font-medium text-stone-500 transition hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset to defaults
            </button>
            <Button
              type="button"
              size="sm"
              disabled={disabled || saving || !isDirty}
              onClick={() => void save()}
              className="rounded-full bg-stone-900 px-4 text-white hover:bg-stone-800"
            >
              {saving ? (
                <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-stone-500">
          <LoaderCircle className="size-3 animate-spin" /> Loading…
        </div>
      )}
    </section>
  );
}

function ComputeField({
  label,
  hint,
  defaultValue,
  children,
}: {
  label: string;
  hint: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
          {label}
        </span>
        <span className="font-mono text-[10px] text-stone-400">
          default {defaultValue}
        </span>
      </div>
      {children}
      <span className="text-[11px] leading-4 text-stone-500">{hint}</span>
    </div>
  );
}
