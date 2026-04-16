"use client";

import type { VafHistogramBin } from "@/lib/types";

interface VafDistributionProps {
  bins: VafHistogramBin[];
  meanVaf?: number | null;
  medianVaf?: number | null;
}

export default function VafDistribution({
  bins,
  meanVaf,
  medianVaf,
}: VafDistributionProps) {
  if (!bins.length) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-5 text-sm text-stone-500">
        No VAF measurements available.
      </div>
    );
  }

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const width = 360;
  const height = 120;
  const barGap = 2;
  const barWidth = (width - barGap * (bins.length - 1)) / bins.length;

  return (
    <div className="rounded-2xl border border-stone-200 bg-gradient-to-br from-white to-stone-50 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Tumor VAF distribution
          </div>
          <h4 className="mt-1 font-display text-[18px] font-light text-stone-900">
            Allele frequency spectrum
          </h4>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
          {bins.length} bins
        </div>
      </div>

      <div className="mt-4">
        <svg
          viewBox={`0 0 ${width} ${height + 18}`}
          className="w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="vaf-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#34d399" stopOpacity="0.9" />
              <stop offset="1" stopColor="#10b981" stopOpacity="0.45" />
            </linearGradient>
          </defs>

          {bins.map((bin, index) => {
            const x = index * (barWidth + barGap);
            const ratio = bin.count / maxCount;
            const h = ratio * height;
            const y = height - h;
            return (
              <g key={index}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={1}
                  fill="url(#vaf-bar)"
                />
              </g>
            );
          })}

          {/* Mean & median markers */}
          {meanVaf != null ? (
            <line
              x1={meanVaf * width}
              x2={meanVaf * width}
              y1={0}
              y2={height}
              stroke="#0f172a"
              strokeDasharray="3 2"
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          ) : null}
          {medianVaf != null ? (
            <line
              x1={medianVaf * width}
              x2={medianVaf * width}
              y1={0}
              y2={height}
              stroke="#f43f5e"
              strokeWidth={1}
              strokeOpacity={0.8}
            />
          ) : null}

          {/* Axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <text
                x={tick * width}
                y={height + 12}
                fontSize={8}
                fontFamily="var(--font-mono), monospace"
                fill="#94a3b8"
                textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}
                letterSpacing="0.12em"
              >
                {tick.toFixed(2)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[1px] w-3 border-t border-dashed border-slate-800/60" />
          mean
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[1px] w-3 bg-rose-500" />
          median
        </span>
      </div>
    </div>
  );
}
