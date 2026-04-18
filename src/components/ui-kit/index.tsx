import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";

// ── Typographic primitives ────────────────────────────────────────
export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <p className="cs-eyebrow" style={style}>
      {children}
    </p>
  );
}

export function MonoLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className="cs-mono-label" style={style}>
      {children}
    </span>
  );
}

export function Tnum({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>
  );
}

// ── Chips ─────────────────────────────────────────────────────────
export type ChipKind = "live" | "planned" | "scaffold";

export function Chip({
  kind = "live",
  children,
  style,
}: {
  kind?: ChipKind;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span className={`cs-chip cs-chip-${kind}`} style={style}>
      {children}
    </span>
  );
}

// ── Cards ─────────────────────────────────────────────────────────
export function Card({
  children,
  pad,
  sunk,
  style,
  className = "",
}: {
  children: ReactNode;
  pad?: boolean;
  sunk?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const classes = [
    "cs-card",
    pad ? "cs-card-pad" : "",
    sunk ? "cs-card-sunk" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

export function CardHead({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="cs-card-head">
      <div>
        {eyebrow ? (
          <div style={{ marginBottom: 6 }}>
            <MonoLabel>{eyebrow}</MonoLabel>
          </div>
        ) : null}
        <h3>{title}</h3>
        {subtitle ? (
          <p className="cs-tiny" style={{ margin: "2px 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

// ── Buttons ───────────────────────────────────────────────────────
type BtnVariant = "primary" | "ghost";

export function Btn({
  variant = "primary",
  size,
  children,
  className = "",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: BtnVariant;
  size?: "sm";
  children: ReactNode;
}) {
  const classes = [
    "cs-btn",
    variant === "primary" ? "cs-btn-primary" : "cs-btn-ghost",
    size === "sm" ? "cs-btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

// ── Callout ───────────────────────────────────────────────────────
export function Callout({
  tone = "accent",
  children,
  style,
  className = "",
}: {
  tone?: "accent" | "warm";
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const cls = `cs-callout ${tone === "warm" ? "cs-callout-warm" : ""} ${className}`;
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

// ── Dot ───────────────────────────────────────────────────────────
export function Dot({ style }: { style?: CSSProperties }) {
  return <span className="cs-dot" style={style} />;
}

// ── Spinner ───────────────────────────────────────────────────────
export function Spinner(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="cs-spinner" {...props} />;
}
