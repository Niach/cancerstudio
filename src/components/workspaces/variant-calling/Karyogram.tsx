"use client";

import { useMemo } from "react";

import type {
  ChromosomeMetricsEntry,
  TopVariantEntry,
} from "@/lib/types";

interface KaryogramProps {
  chromosomes: ChromosomeMetricsEntry[];
  topVariants: TopVariantEntry[];
}

const HUMAN_CHROMOSOME_ORDER = [
  "1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","X","Y",
];

const TRACK_HEIGHT = 14;
const TRACK_SPACING = 6;
const LABEL_WIDTH = 44;
const RIGHT_GUTTER = 62;
const PADDING_Y = 24;

function stripChrPrefix(name: string) {
  return name.toLowerCase().startsWith("chr") ? name.slice(3) : name;
}

function normalizeChromosomeLabel(name: string) {
  const stripped = stripChrPrefix(name);
  return stripped.toUpperCase();
}

function chromosomeSortIndex(label: string) {
  const stripped = stripChrPrefix(label);
  const numeric = Number.parseInt(stripped, 10);
  if (!Number.isNaN(numeric)) return numeric;
  const upper = stripped.toUpperCase();
  if (upper === "X") return 1000;
  if (upper === "Y") return 1001;
  if (upper === "M" || upper === "MT") return 1002;
  return 2000;
}

export default function Karyogram({ chromosomes, topVariants }: KaryogramProps) {
  const { tracks, maxLength, totalVariants, totalPass, maxCount } = useMemo(() => {
    const byLabel = new Map<string, ChromosomeMetricsEntry>();
    for (const entry of chromosomes) {
      byLabel.set(stripChrPrefix(entry.chromosome).toUpperCase(), entry);
    }

    // Prefer the human ordering for the canonical assemblies, but fall back to
    // whatever the backend returned if a non-human reference is in play.
    const ordered = (() => {
      const humanOrdered: ChromosomeMetricsEntry[] = [];
      const seen = new Set<string>();
      for (const label of HUMAN_CHROMOSOME_ORDER) {
        const entry = byLabel.get(label);
        if (entry) {
          humanOrdered.push(entry);
          seen.add(label);
        }
      }
      const extras = chromosomes
        .filter((entry) => !seen.has(stripChrPrefix(entry.chromosome).toUpperCase()))
        .sort((a, b) => chromosomeSortIndex(a.chromosome) - chromosomeSortIndex(b.chromosome));
      return [...humanOrdered, ...extras];
    })();

    const primary = ordered.slice(0, 48);
    const longest = primary.reduce(
      (acc, entry) => Math.max(acc, entry.length > 0 ? entry.length : 1),
      1
    );
    const totalCount = primary.reduce((acc, entry) => acc + entry.total, 0);
    const passCount = primary.reduce((acc, entry) => acc + entry.passCount, 0);
    const maxPerTrack = primary.reduce((acc, entry) => Math.max(acc, entry.total), 1);

    return {
      tracks: primary,
      maxLength: longest,
      totalVariants: totalCount,
      totalPass: passCount,
      maxCount: maxPerTrack,
    };
  }, [chromosomes]);

  const variantsByChromosome = useMemo(() => {
    const map = new Map<string, TopVariantEntry[]>();
    for (const variant of topVariants) {
      const key = stripChrPrefix(variant.chromosome).toUpperCase();
      const existing = map.get(key);
      if (existing) {
        existing.push(variant);
      } else {
        map.set(key, [variant]);
      }
    }
    return map;
  }, [topVariants]);

  if (!tracks.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 text-sm text-slate-400">
        No chromosomes observed in the filtered VCF.
      </div>
    );
  }

  const contentWidth = 960;
  const trackInnerWidth = contentWidth - LABEL_WIDTH - RIGHT_GUTTER;
  const totalHeight = PADDING_Y * 2 + tracks.length * (TRACK_HEIGHT + TRACK_SPACING);

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-white/5 bg-[radial-gradient(circle_at_top_right,_rgba(52,211,153,0.08),_transparent_45%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.08),_transparent_50%),linear-gradient(180deg,_#070a16_0%,_#0b1124_100%)] shadow-[0_40px_80px_-40px_rgba(8,11,24,0.8)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 pt-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-emerald-300/70">
            Somatic karyogram
          </div>
          <h3 className="mt-2 font-display text-[28px] leading-none font-light text-slate-50">
            {totalVariants.toLocaleString()}
            <span className="ml-2 text-[15px] font-normal text-slate-400">
              variant call{totalVariants === 1 ? "" : "s"}
            </span>
          </h3>
          <p className="mt-1 text-[12px] text-slate-400">
            <span className="text-emerald-300">{totalPass.toLocaleString()} PASS</span>
            <span className="mx-2 text-slate-700">·</span>
            {(totalVariants - totalPass).toLocaleString()} filtered
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.22em] text-slate-400">
          <Legend swatchClassName="bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]">
            PASS SNV
          </Legend>
          <Legend swatchClassName="bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.7)]">
            PASS indel
          </Legend>
          <Legend swatchClassName="bg-amber-400/70">Filtered</Legend>
        </div>
      </div>

      <div className="relative px-6 pt-5 pb-6">
        <svg
          viewBox={`0 0 ${contentWidth} ${totalHeight}`}
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="karyo-lane" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#1f2a44" stopOpacity="0.9" />
              <stop offset="1" stopColor="#253355" stopOpacity="0.6" />
            </linearGradient>
            <radialGradient id="karyo-pass-snv" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#6ee7b7" stopOpacity="1" />
              <stop offset="0.6" stopColor="#34d399" stopOpacity="0.95" />
              <stop offset="1" stopColor="#059669" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="karyo-pass-indel" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#7dd3fc" stopOpacity="1" />
              <stop offset="0.6" stopColor="#38bdf8" stopOpacity="0.95" />
              <stop offset="1" stopColor="#0284c7" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="karyo-filtered" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#fbbf24" stopOpacity="0.9" />
              <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
          </defs>

          {tracks.map((track, index) => {
            const yTop = PADDING_Y + index * (TRACK_HEIGHT + TRACK_SPACING);
            const trackWidth = track.length > 0
              ? (track.length / maxLength) * trackInnerWidth
              : trackInnerWidth * 0.12;

            const labelX = LABEL_WIDTH - 12;
            const trackX = LABEL_WIDTH;
            const trackCenterY = yTop + TRACK_HEIGHT / 2;

            const labelKey = stripChrPrefix(track.chromosome).toUpperCase();
            const variantsHere = variantsByChromosome.get(labelKey) ?? [];
            const densityIntensity = track.total > 0
              ? Math.min(1, track.total / Math.max(4, maxCount))
              : 0;

            return (
              <g key={track.chromosome}>
                <text
                  x={labelX}
                  y={trackCenterY + 3}
                  textAnchor="end"
                  className="fill-slate-400"
                  fontFamily="var(--font-mono), monospace"
                  fontSize={9}
                  letterSpacing="0.14em"
                >
                  {normalizeChromosomeLabel(track.chromosome)}
                </text>

                <rect
                  x={trackX}
                  y={yTop}
                  width={trackWidth}
                  height={TRACK_HEIGHT}
                  rx={TRACK_HEIGHT / 2}
                  fill="url(#karyo-lane)"
                  stroke="rgba(148,163,184,0.12)"
                  strokeWidth={0.75}
                />

                {/* density wash — a subtle gradient inside the track proportional to variant density */}
                {track.total > 0 ? (
                  <rect
                    x={trackX}
                    y={yTop}
                    width={trackWidth}
                    height={TRACK_HEIGHT}
                    rx={TRACK_HEIGHT / 2}
                    fill="rgba(52,211,153,0.08)"
                    opacity={densityIntensity}
                  />
                ) : null}

                {/* Density dots for every chromosome that has variants — seeded from per_chromosome counts */}
                {track.total > 0 ? (
                  <DensityDots
                    total={track.total}
                    passCount={track.passCount}
                    snvCount={track.snvCount}
                    trackX={trackX}
                    trackWidth={trackWidth}
                    trackCenterY={trackCenterY}
                    seed={track.chromosome}
                  />
                ) : null}

                {/* Precise top-variant markers on top of the density dots */}
                {variantsHere.slice(0, 18).map((variant) => {
                  if (!track.length || variant.position < 0) return null;
                  const relative = Math.min(1, Math.max(0, variant.position / track.length));
                  const cx = trackX + relative * trackWidth;
                  const isIndel = variant.variantType !== "snv";
                  const radius = variant.isPass
                    ? 2.6 + Math.min(1.6, (variant.tumorVaf ?? 0.2) * 2.4)
                    : 1.6;
                  const fillId = variant.isPass
                    ? isIndel
                      ? "url(#karyo-pass-indel)"
                      : "url(#karyo-pass-snv)"
                    : "url(#karyo-filtered)";
                  return (
                    <g key={`${variant.chromosome}-${variant.position}-${variant.alt}`}>
                      <circle
                        cx={cx}
                        cy={trackCenterY}
                        r={radius + 2.4}
                        fill={fillId}
                        opacity={variant.isPass ? 0.55 : 0.35}
                      />
                      <circle
                        cx={cx}
                        cy={trackCenterY}
                        r={radius}
                        fill={
                          variant.isPass
                            ? isIndel
                              ? "#7dd3fc"
                              : "#6ee7b7"
                            : "#fbbf24"
                        }
                        opacity={variant.isPass ? 0.95 : 0.6}
                      />
                    </g>
                  );
                })}

                <text
                  x={trackX + trackWidth + 10}
                  y={trackCenterY + 3}
                  className="fill-slate-500"
                  fontFamily="var(--font-mono), monospace"
                  fontSize={9}
                  letterSpacing="0.12em"
                >
                  {track.total > 0 ? track.total.toLocaleString() : "—"}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
          <span className="font-mono uppercase tracking-[0.22em] text-slate-400">
            Chromosome length →
          </span>
          <span className="font-mono tracking-[0.16em] text-slate-500">
            scale 1px ≈ {Math.round(maxLength / Math.max(1, contentWidth - LABEL_WIDTH - RIGHT_GUTTER)).toLocaleString()} bp
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({
  children,
  swatchClassName,
}: {
  children: React.ReactNode;
  swatchClassName: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${swatchClassName}`} />
      <span>{children}</span>
    </span>
  );
}

/**
 * DensityDots — generate a deterministic cloud of variant positions for a
 * chromosome based on its total count, pass count, and SNV/indel mix. The
 * karyogram only gets exact positions for the top-variant subset we send
 * down, so the wider cloud gives a truthful-at-a-glance density read
 * without pretending every dot is mapped precisely.
 */
function DensityDots({
  total,
  passCount,
  snvCount,
  trackX,
  trackWidth,
  trackCenterY,
  seed,
}: {
  total: number;
  passCount: number;
  snvCount: number;
  trackX: number;
  trackWidth: number;
  trackCenterY: number;
  seed: string;
}) {
  const dots = useMemo(() => {
    const cap = Math.min(160, Math.max(8, Math.round(Math.sqrt(total) * 8)));
    const rng = mulberry32(hashString(seed));
    const output: Array<{
      cx: number;
      r: number;
      fill: string;
      opacity: number;
    }> = [];
    const passShare = total > 0 ? passCount / total : 0;
    const snvShare = total > 0 ? snvCount / total : 1;
    for (let i = 0; i < cap; i += 1) {
      const cx = trackX + rng() * trackWidth;
      const isPass = rng() < passShare;
      const isSnv = rng() < snvShare;
      const r = isPass ? 1.15 + rng() * 0.7 : 0.9 + rng() * 0.5;
      const opacity = isPass ? 0.55 + rng() * 0.3 : 0.25 + rng() * 0.15;
      const fill = isPass
        ? isSnv
          ? "#34d399"
          : "#38bdf8"
        : "#f59e0b";
      output.push({ cx, r, fill, opacity });
    }
    return output;
  }, [total, passCount, snvCount, trackX, trackWidth, seed]);

  return (
    <g>
      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.cx}
          cy={trackCenterY}
          r={dot.r}
          fill={dot.fill}
          opacity={dot.opacity}
        />
      ))}
    </g>
  );
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
