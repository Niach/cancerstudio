"use client";

import { useMemo } from "react";

import type { AnnotationConsequenceEntry } from "@/lib/types";

interface ConsequenceDonutProps {
  entries: AnnotationConsequenceEntry[];
  showRawTerms?: boolean;
}

const PALETTE = [
  "#059669", // emerald
  "#0284c7", // sky
  "#d97706", // amber
  "#7c3aed", // violet
  "#db2777", // pink
  "#0d9488", // teal
  "#b91c1c", // red
  "#4338ca", // indigo
  "#65a30d", // lime
  "#6b7280", // gray
];

function formatNumber(value: number) {
  return value.toLocaleString();
}

export default function ConsequenceDonut({
  entries,
  showRawTerms = false,
}: ConsequenceDonutProps) {
  const { total, slices, other } = useMemo(() => {
    const sum = entries.reduce((acc, e) => acc + e.count, 0);
    const top = entries.slice(0, 8);
    const rest = entries.slice(8);
    const restSum = rest.reduce((acc, e) => acc + e.count, 0);
    const segs: {
      entry: AnnotationConsequenceEntry;
      color: string;
      start: number;
      end: number;
      percent: number;
    }[] = [];
    let cursor = 0;
    for (let i = 0; i < top.length; i += 1) {
      const entry = top[i];
      const pct = sum > 0 ? entry.count / sum : 0;
      const start = cursor;
      const end = cursor + pct;
      segs.push({
        entry,
        color: PALETTE[i % PALETTE.length],
        start,
        end,
        percent: pct,
      });
      cursor = end;
    }
    if (restSum > 0 && sum > 0) {
      const pct = restSum / sum;
      segs.push({
        entry: {
          term: "other",
          label: "Other consequence categories",
          count: restSum,
        },
        color: "#a8a29e",
        start: cursor,
        end: cursor + pct,
        percent: pct,
      });
    }
    return { total: sum, slices: segs, other: rest };
  }, [entries]);

  const size = 160;
  const radius = size / 2 - 10;
  const innerRadius = radius * 0.6;
  const center = size / 2;

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-5 text-sm text-stone-500">
        No consequence breakdown available.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
        What changed
      </div>
      <h4 className="mt-0.5 font-display text-[18px] font-light text-stone-900">
        Mutation consequence mix
      </h4>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40" role="img">
          {slices.map((slice, index) => {
            const path = donutSlicePath(
              center,
              center,
              radius,
              innerRadius,
              slice.start,
              slice.end
            );
            return <path key={index} d={path} fill={slice.color} opacity={0.9} />;
          })}
          <circle cx={center} cy={center} r={innerRadius - 2} fill="#fff" />
          <text
            x={center}
            y={center - 4}
            textAnchor="middle"
            className="fill-stone-500 font-mono"
            fontSize={9}
          >
            total
          </text>
          <text
            x={center}
            y={center + 14}
            textAnchor="middle"
            className="fill-stone-900 font-display"
            fontSize={22}
          >
            {formatNumber(total)}
          </text>
        </svg>

        <ul className="space-y-1.5 text-[12px]">
          {slices.map((slice, index) => (
            <li
              key={index}
              className="flex items-center gap-2"
              title={showRawTerms ? slice.entry.term : slice.entry.label}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <span className="flex-1 truncate text-stone-700">
                {showRawTerms ? slice.entry.term : slice.entry.label}
              </span>
              <span
                className="font-mono text-[11px] text-stone-500"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatNumber(slice.entry.count)}
                <span className="ml-2 text-stone-400">
                  {Math.round(slice.percent * 100)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {other.length > 0 ? (
        <div className="mt-3 font-mono text-[10px] text-stone-400">
          {other.length} smaller categor{other.length === 1 ? "y" : "ies"} grouped as “other”.
        </div>
      ) : null}
    </div>
  );
}

function donutSlicePath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  startPct: number,
  endPct: number
) {
  const start = pct2xy(cx, cy, outer, startPct);
  const end = pct2xy(cx, cy, outer, endPct);
  const startInner = pct2xy(cx, cy, inner, endPct);
  const endInner = pct2xy(cx, cy, inner, startPct);
  const large = endPct - startPct > 0.5 ? 1 : 0;
  if (endPct - startPct >= 0.999) {
    // Full circle — draw as two half-arcs
    const mid = pct2xy(cx, cy, outer, (startPct + endPct) / 2);
    const midInner = pct2xy(cx, cy, inner, (startPct + endPct) / 2);
    return [
      `M ${start.x} ${start.y}`,
      `A ${outer} ${outer} 0 1 1 ${mid.x} ${mid.y}`,
      `A ${outer} ${outer} 0 1 1 ${end.x} ${end.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${inner} ${inner} 0 1 0 ${midInner.x} ${midInner.y}`,
      `A ${inner} ${inner} 0 1 0 ${endInner.x} ${endInner.y}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${start.x} ${start.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${end.x} ${end.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function pct2xy(cx: number, cy: number, r: number, pct: number) {
  // Start at the top (12 o'clock), sweep clockwise.
  const angle = pct * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}
