"use client";

import type { CSSProperties } from "react";

import { Card, Eyebrow } from "@/components/ui-kit";
import type { EpitopeCandidate, EpitopeSafetyFlag, MhcClass } from "@/lib/types";

import { CLASS_COLOR, RISK_COLOR } from "./colors";

const SLOT_COUNT = 8;

interface CassettePanelProps {
  picked: EpitopeCandidate[];
  safety: Record<string, EpitopeSafetyFlag>;
  hoverId: string | null;
  onRemove: (id: string) => void;
  onReset: () => void;
  onClear: () => void;
  setHoverId: (id: string | null) => void;
}

export default function CassettePanel({
  picked,
  safety,
  hoverId,
  onRemove,
  onReset,
  onClear,
  setHoverId,
}: CassettePanelProps) {
  const entries: (EpitopeCandidate | null)[] = Array.from(
    { length: SLOT_COUNT },
    (_, i) => picked[i] ?? null,
  );
  const filled = picked.length;
  const totalAA = picked.reduce((a, p) => a + p.length + 3, 0);
  const hasCritical = picked.some((p) => safety[p.id]?.risk === "critical");
  const uniqueGenes = new Set(picked.map((p) => p.gene)).size;
  const uniqueAlleles = new Set(picked.map((p) => p.alleleId)).size;
  const safetyFlagged = picked.filter((p) => safety[p.id]).length;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "18px 22px 10px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <Eyebrow>The cassette</Eyebrow>
          <h3
            style={{
              margin: "6px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 22,
              letterSpacing: "-0.02em",
            }}
          >
            {filled} of {SLOT_COUNT} slots filled
          </h3>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.5,
              maxWidth: "54ch",
            }}
          >
            Click a peptide below to add or remove it. Auto-pick seeds a
            reasonable starting shortlist.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onReset}
            className="mvx-btn mvx-btn-ghost mvx-btn-sm"
            style={{ height: 32, minHeight: 32, fontSize: 12 }}
          >
            Auto-pick
          </button>
          <button
            type="button"
            onClick={onClear}
            className="mvx-btn mvx-btn-ghost mvx-btn-sm"
            style={{ height: 32, minHeight: 32, fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ padding: "10px 22px 12px" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "stretch",
            gap: 0,
            background: "var(--surface-sunk)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: "12px 14px",
            overflow: "hidden",
          }}
        >
          <CapBlock side="left" label="5'" sub="sp" />
          {entries.map((p, i) => (
            <SlotFragment
              key={i}
              idx={i}
              p={p}
              prev={entries[i - 1] ?? null}
              safety={safety}
              hoverId={hoverId}
              onRemove={onRemove}
              setHoverId={setHoverId}
            />
          ))}
          <CapBlock side="right" label="3'" sub="pA" />
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--muted-2)",
            letterSpacing: "0.08em",
          }}
        >
          <span>5′ cap → signal peptide → peptides → stop → 3′ poly-A</span>
          <span style={{ whiteSpace: "nowrap" }}>
            {totalAA} aa with linkers
          </span>
        </div>
      </div>

      <div
        style={{
          padding: "12px 22px 16px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          borderTop: "1px solid var(--line)",
          background: "var(--surface-strong)",
        }}
      >
        <CassetteStat
          label="Peptides"
          value={filled}
          tone={filled >= 6 && filled <= 8 ? "ok" : "warn"}
        />
        <CassetteStat
          label="Unique genes"
          value={uniqueGenes}
          tone={uniqueGenes >= 5 ? "ok" : "warn"}
        />
        <CassetteStat
          label="Alleles covered"
          value={uniqueAlleles}
          tone={uniqueAlleles >= 3 ? "ok" : "warn"}
        />
        <CassetteStat
          label="Safety flags"
          value={safetyFlagged}
          tone={hasCritical ? "crit" : safetyFlagged ? "warn" : "ok"}
        />
      </div>
    </Card>
  );
}

function SlotFragment({
  idx,
  p,
  prev,
  safety,
  hoverId,
  onRemove,
  setHoverId,
}: {
  idx: number;
  p: EpitopeCandidate | null;
  prev: EpitopeCandidate | null;
  safety: Record<string, EpitopeSafetyFlag>;
  hoverId: string | null;
  onRemove: (id: string) => void;
  setHoverId: (id: string | null) => void;
}) {
  return (
    <>
      {idx > 0 ? (
        <LinkerTick
          cls={prev?.class ?? null}
          nextCls={p?.class ?? null}
        />
      ) : null}
      <SlotBlock
        p={p}
        risk={p ? safety[p.id]?.risk ?? null : null}
        hover={Boolean(p && hoverId === p.id)}
        onRemove={p ? () => onRemove(p.id) : null}
        setHover={(hover) => setHoverId(hover && p ? p.id : null)}
      />
    </>
  );
}

function CapBlock({
  side,
  label,
  sub,
}: {
  side: "left" | "right";
  label: string;
  sub: string;
}) {
  const radius =
    side === "left" ? "10px 4px 4px 10px" : "4px 10px 10px 4px";
  return (
    <div
      style={{
        flex: "0 0 44px",
        borderRadius: radius,
        background: "color-mix(in oklch, var(--ink) 8%, transparent)",
        border: "1px solid var(--line-strong)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        padding: "8px 4px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ink-2)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "var(--muted-2)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function LinkerTick({
  cls,
  nextCls,
}: {
  cls: MhcClass | null;
  nextCls: MhcClass | null;
}) {
  if (!cls && !nextCls) {
    return (
      <div
        style={{
          flex: "0 0 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 1,
            height: 36,
            borderLeft: "1px dashed var(--line-strong)",
            opacity: 0.5,
          }}
        />
      </div>
    );
  }
  const useII = cls === "II" || nextCls === "II";
  const color = useII ? "#7c3aed" : "#0f766e";
  return (
    <div
      style={{
        flex: "0 0 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          opacity: 0.55,
        }}
      />
    </div>
  );
}

function SlotBlock({
  p,
  risk,
  onRemove,
  hover,
  setHover,
}: {
  p: EpitopeCandidate | null;
  risk: "critical" | "elevated" | "mild" | null;
  onRemove: (() => void) | null;
  hover: boolean;
  setHover: (hover: boolean) => void;
}) {
  if (!p) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 88,
          borderRadius: 10,
          border: "1.5px dashed var(--line-strong)",
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-2)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ opacity: 0.55, fontSize: 10 }}>empty</div>
      </div>
    );
  }
  const clsColor = CLASS_COLOR[p.class];
  const criticalBad = risk === "critical" || risk === "elevated";
  const containerStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    position: "relative",
    borderRadius: 10,
    background: `linear-gradient(180deg, color-mix(in oklch, ${clsColor} 10%, var(--surface-strong)), var(--surface-strong))`,
    border: `1.5px solid ${criticalBad ? "#dc2626" : `color-mix(in oklch, ${clsColor} 32%, transparent)`}`,
    padding: "12px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: hover ? "0 10px 30px -12px rgba(0,0,0,0.25)" : "none",
    transform: hover ? "translateY(-2px)" : "none",
    transition: "transform 140ms ease, box-shadow 140ms ease",
  };
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={containerStyle}
    >
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          title="Remove from cassette"
          style={{
            position: "absolute",
            top: 5,
            right: 5,
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "1px solid var(--line-strong)",
            background: "var(--surface-strong)",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 11,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}

      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 15,
          color: "var(--ink)",
          lineHeight: 1.1,
          paddingRight: 22,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {p.gene}
      </div>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 500,
          color: "var(--muted)",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {p.seq.length > 9 ? `${p.seq.slice(0, 8)}…` : p.seq}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 2,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: clsColor,
            letterSpacing: "0.12em",
            padding: "1px 5px",
            borderRadius: 3,
            background: `color-mix(in oklch, ${clsColor} 14%, transparent)`,
          }}
        >
          class {p.class}
        </span>
        {risk ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
              background: RISK_COLOR[risk].bg,
              color: RISK_COLOR[risk].fg,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            ⚠
          </span>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--muted-2)",
              letterSpacing: "0.08em",
            }}
          >
            {p.ic50Nm < 100 ? "• " : ""}
            {p.ic50Nm} nM
          </span>
        )}
      </div>
    </div>
  );
}

function CassetteStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "crit";
}) {
  const color =
    tone === "crit" ? "#dc2626" : tone === "warn" ? "#d97706" : "#0f766e";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          color: "var(--muted-2)",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 400,
            color,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
