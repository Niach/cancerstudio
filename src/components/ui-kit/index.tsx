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
    <p className="mvx-eyebrow" style={style}>
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
    <span className="mvx-mono-label" style={style}>
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
    <span className={`mvx-chip mvx-chip-${kind}`} style={style}>
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
    "mvx-card",
    pad ? "mvx-card-pad" : "",
    sunk ? "mvx-card-sunk" : "",
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
    <div className="mvx-card-head">
      <div>
        {eyebrow ? (
          <div style={{ marginBottom: 6 }}>
            <MonoLabel>{eyebrow}</MonoLabel>
          </div>
        ) : null}
        <h3>{title}</h3>
        {subtitle ? (
          <p className="mvx-tiny" style={{ margin: "2px 0 0" }}>
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
    "mvx-btn",
    variant === "primary" ? "mvx-btn-primary" : "mvx-btn-ghost",
    size === "sm" ? "mvx-btn-sm" : "",
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
  const cls = `mvx-callout ${tone === "warm" ? "mvx-callout-warm" : ""} ${className}`;
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

// ── Dot ───────────────────────────────────────────────────────────
export function Dot({ style }: { style?: CSSProperties }) {
  return <span className="mvx-dot" style={style} />;
}

// ── Spinner ───────────────────────────────────────────────────────
export function Spinner(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="mvx-spinner" {...props} />;
}
