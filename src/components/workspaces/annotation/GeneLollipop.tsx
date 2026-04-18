"use client";

import { useMemo, useState } from "react";

import type { AnnotationImpactTier, GeneFocus } from "@/lib/types";

interface GeneLollipopProps {
  focus: GeneFocus;
}

const IMPACT_FILL: Record<AnnotationImpactTier, string> = {
  HIGH: "#e11d48",
  MODERATE: "#d97706",
  LOW: "#0284c7",
  MODIFIER: "#78716c",
};

const IMPACT_STICK: Record<AnnotationImpactTier, number> = {
  HIGH: 52,
  MODERATE: 40,
  LOW: 28,
  MODIFIER: 18,
};

const CHART_HEIGHT = 220;
const TRACK_Y = CHART_HEIGHT - 42;
const PADDING_X = 32;

function plainConsequence(raw: string | null | undefined) {
  if (!raw) return null;
  return raw.split("&")[0].replace(/_/g, " ");
}

export default function GeneLollipop({ focus }: GeneLollipopProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { proteinLength, pointVariants, chartWidth, inferredLength } = useMemo(() => {
    const explicit = focus.proteinLength ?? 0;
    const maxPos = focus.variants.reduce((acc, v) => {
      if (v.proteinPosition != null) return Math.max(acc, v.proteinPosition);
      return acc;
    }, 0);
    const inferred = !explicit || explicit < maxPos;
    // Choose a sensible display length. If VEP gave us a protein length, use it.
    // Otherwise infer from the furthest mutation, rounded up for headroom.
    let length = explicit;
    if (!length) {
      length = Math.max(100, Math.ceil((maxPos * 1.1) / 50) * 50);
    }
    const width = 640;
    const points = focus.variants.map((v, index) => {
      const pos = v.proteinPosition ?? Math.round(length / 2);
      const x = PADDING_X + ((pos / length) * (width - PADDING_X * 2));
      return {
        ...v,
        index,
        x,
        stick: IMPACT_STICK[v.impact] ?? 24,
        fill: IMPACT_FILL[v.impact] ?? "#78716c",
      };
    });
    return {
      proteinLength: length,
      pointVariants: points,
      chartWidth: width,
      inferredLength: inferred,
    };
  }, [focus]);

  const hovered = hoverIndex != null ? pointVariants[hoverIndex] : null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Mutation map
          </div>
          <h4 className="mt-0.5 font-display text-[20px] font-light text-stone-900">
            <span className="font-semibold tracking-wide">{focus.symbol}</span>{" "}
            <span className="text-stone-500">·</span>{" "}
            <span className="text-[15px] text-stone-500">
              {focus.variants.length} mutation{focus.variants.length === 1 ? "" : "s"} along the protein
            </span>
          </h4>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
            protein length
          </div>
          <div className="font-mono text-[13px] text-stone-700">
            {proteinLength} aa{inferredLength ? " (approx)" : ""}
          </div>
        </div>
      </div>

      {focus.role ? (
        <div className="mt-1 text-[12px] text-stone-500">
          Role: <span className="text-stone-700">{focus.role}</span>
        </div>
      ) : null}

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
          className="h-[220px] w-full"
          role="img"
          aria-label={`Lollipop map of ${focus.variants.length} mutations along ${focus.symbol}`}
        >
          {/* Track */}
          <rect
            x={PADDING_X - 4}
            y={TRACK_Y - 6}
            rx={6}
            ry={6}
            width={chartWidth - (PADDING_X - 4) * 2}
            height={12}
            fill="#f5f5f4"
          />
          <rect
            x={PADDING_X - 4}
            y={TRACK_Y - 6}
            rx={6}
            ry={6}
            width={chartWidth - (PADDING_X - 4) * 2}
            height={12}
            fill="url(#track-gradient)"
            opacity={0.55}
          />
          <defs>
            <linearGradient id="track-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#a8a29e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#a8a29e" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Tick marks at 0 / 25 / 50 / 75 / 100 percent */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const x = PADDING_X + pct * (chartWidth - PADDING_X * 2);
            return (
              <g key={pct}>
                <line
                  x1={x}
                  x2={x}
                  y1={TRACK_Y - 12}
                  y2={TRACK_Y + 12}
                  stroke="#d6d3d1"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={TRACK_Y + 26}
                  textAnchor="middle"
                  className="fill-stone-400 font-mono"
                  fontSize={10}
                >
                  {Math.round(pct * proteinLength)}
                </text>
              </g>
            );
          })}

          {/* N / C labels */}
          <text
            x={PADDING_X - 8}
            y={TRACK_Y + 3}
            textAnchor="end"
            className="fill-stone-400 font-mono"
            fontSize={10}
          >
            N
          </text>
          <text
            x={chartWidth - PADDING_X + 8}
            y={TRACK_Y + 3}
            textAnchor="start"
            className="fill-stone-400 font-mono"
            fontSize={10}
          >
            C
          </text>

          {/* Lollipops */}
          {pointVariants.map((variant) => {
            const topY = TRACK_Y - variant.stick;
            const isHovered = hoverIndex === variant.index;
            const radius = isHovered ? 7 : 5;
            return (
              <g
                key={variant.index}
                onMouseEnter={() => setHoverIndex(variant.index)}
                onMouseLeave={() => setHoverIndex(null)}
                className="cursor-pointer"
              >
                <line
                  x1={variant.x}
                  x2={variant.x}
                  y1={TRACK_Y - 6}
                  y2={topY}
                  stroke={variant.fill}
                  strokeWidth={isHovered ? 2 : 1.5}
                  opacity={0.7}
                />
                <circle
                  cx={variant.x}
                  cy={topY}
                  r={radius}
                  fill={variant.fill}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-700 shadow-md shadow-black/5"
            style={{
              left: `calc(${(hovered.x / chartWidth) * 100}% - 120px)`,
              top: 6,
              width: 240,
            }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
              position {hovered.proteinPosition ?? "?"}
            </div>
            <div className="mt-0.5 font-mono text-[12px] text-stone-800">
              {hovered.hgvsp?.split(":").pop() || plainConsequence(hovered.consequence) || "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-stone-500">
              {plainConsequence(hovered.consequence)} ·{" "}
              {hovered.tumorVaf != null
                ? `${(hovered.tumorVaf * 100).toFixed(1)}% VAF`
                : "no VAF"}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-stone-500">
        {(["HIGH", "MODERATE", "LOW", "MODIFIER"] as AnnotationImpactTier[]).map((tier) => (
          <div key={tier} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: IMPACT_FILL[tier] }}
            />
            <span className="font-mono tracking-[0.08em]">{tier.toLowerCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
