"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AnnotatedVariantsTable from "@/components/workspaces/annotation/AnnotatedVariantsTable";
import CancerGeneHits from "@/components/workspaces/annotation/CancerGeneHits";
import ConsequenceDonut from "@/components/workspaces/annotation/ConsequenceDonut";
import GeneLollipop from "@/components/workspaces/annotation/GeneLollipop";
import ImpactSummary from "@/components/workspaces/annotation/ImpactSummary";
import Helix from "@/components/helix/Helix";
import {
  Btn,
  Callout,
  Card,
  CardHead,
  Chip,
  Dot,
  Eyebrow,
  MonoLabel,
  Tnum,
} from "@/components/ui-kit";
import { useTweaks } from "@/components/dev/TweaksProvider";
import {
  api,
  InsufficientMemoryError,
  MissingToolsError,
  StageNotActionableError,
} from "@/lib/api";
import type {
  AnnotationStageSummary,
  GeneFocus,
  Workspace,
} from "@/lib/types";

interface AnnotationStagePanelProps {
  workspace: Workspace;
  initialSummary: AnnotationStageSummary;
}

export default function AnnotationStagePanel({
  workspace,
  initialSummary,
}: AnnotationStagePanelProps) {
  const { tweaks } = useTweaks();
  const [summary, setSummary] = useState(initialSummary);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, setMissingTools] = useState<{ tools: string[]; hints: string[] } | null>(
    null
  );
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
    if (summary.status !== "running" && summary.status !== "paused") return;
    const timer = window.setInterval(() => {
      void api.getAnnotationStageSummary(workspace.id).then(setSummary).catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [summary.status, workspace.id]);

  const latestRun = summary.latestRun;
  const metrics = latestRun?.metrics ?? null;
  const status = summary.status;

  const activeFocus: GeneFocus | null = useMemo(() => {
    if (!metrics?.topGeneFocus) return null;
    if (focusedGene && focusedGene !== metrics.topGeneFocus.symbol) {
      const hit = metrics.cancerGeneHits.find((h) => h.symbol === focusedGene);
      if (hit) {
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
        if (variants.length > 0) {
          return {
            symbol: hit.symbol,
            role: hit.role,
            transcriptId: null,
            proteinLength: null,
            variants,
          };
        }
      }
    }
    return metrics.topGeneFocus;
  }, [metrics, focusedGene]);

  const runAction = useCallback(
    async (action: () => Promise<AnnotationStageSummary>, { resetFocus }: { resetFocus?: boolean } = {}) => {
      setSubmitting(true);
      setActionError(null);
      setMissingTools(null);
      try {
        const next = await action();
        setSummary(next);
        if (resetFocus) setFocusedGene(null);
      } catch (err) {
        if (err instanceof MissingToolsError) {
          setMissingTools({ tools: err.tools, hints: err.hints });
        } else if (err instanceof InsufficientMemoryError) {
          setActionError(err.message);
        } else if (err instanceof StageNotActionableError) {
          setActionError(err.message);
        } else if (err instanceof Error) {
          setActionError(err.message);
        } else {
          setActionError("Unable to complete the action.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const header = (
    <div className="cs-view-head">
      <div>
        <div className="cs-crumb">{workspace.displayName} / 04 Annotation</div>
        <h1 style={{ textWrap: "pretty" }}>Read what the mutations mean.</h1>
        <p
          style={{
            maxWidth: "62ch",
            marginTop: 12,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: "var(--ink-2)",
          }}
        >
          We check each mutation against what scientists already know — which
          gene it&apos;s in, whether it changes the protein, and whether that
          gene is on the list of genes that matter in cancer.
        </p>
      </div>
      <div style={{ textAlign: "right", minWidth: 180 }}>
        <Chip kind="live">Stage 04 · Live</Chip>
        {metrics?.vepRelease ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12.5,
              fontFamily: "var(--font-mono)",
              color: "var(--muted)",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
            }}
          >
            Ensembl VEP · release {metrics.vepRelease}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (status === "blocked") {
    return (
      <>
        {header}
        <Callout tone="warm">
          <Dot style={{ color: "var(--warm)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              {summary.blockingReason ?? "Finish variant calling first."}
            </div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              Annotation unlocks once the mutation search is done.
            </p>
          </div>
        </Callout>
      </>
    );
  }

  if (status === "scaffolded" || (!latestRun && status !== "running")) {
    return (
      <>
        {header}
        <Card>
          <div
            style={{
              padding: "36px 32px",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 24,
              alignItems: "center",
            }}
          >
            <div>
              <Eyebrow>Next step</Eyebrow>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 500,
                  margin: "6px 0 10px",
                  letterSpacing: "-0.02em",
                  color: "var(--ink)",
                }}
              >
                Match each mutation to what&apos;s known.
              </h2>
              <p
                style={{
                  fontSize: 16,
                  maxWidth: "54ch",
                  lineHeight: 1.7,
                  color: "var(--ink-2)",
                }}
              >
                We run Ensembl VEP against a curated gene-knowledge database.
                When it finishes, you get a plain-language readout of every
                mutation — which gene, what changed, how severe.
              </p>
              <div style={{ marginTop: 18 }}>
                <Btn
                  data-testid="annotation-run-button"
                  disabled={submitting}
                  onClick={() => void runAction(() => api.runAnnotation(workspace.id))}
                >
                  {submitting ? "Starting…" : "Annotate mutations"}
                </Btn>
              </div>
              {actionError ? (
                <p className="cs-tiny" style={{ marginTop: 10, color: "var(--danger)" }}>
                  {actionError}
                </p>
              ) : null}
            </div>
            <Helix size={180} rungs={18} hue={tweaks.accentHue} speed={26} />
          </div>
        </Card>
      </>
    );
  }

  if (status === "running" && latestRun) {
    return (
      <>
        {header}
        <Card>
          <div style={{ padding: "36px 32px", textAlign: "center" }}>
            <Helix size={220} rungs={20} hue={tweaks.accentHue} speed={18} />
            <div style={{ marginTop: 20 }}>
              {latestRun.cachePending ? (
                <div
                  className="cs-tiny"
                  style={{ marginBottom: 10, color: "var(--ink-2)" }}
                >
                  Downloading the gene-knowledge database
                  {latestRun.cacheSpeciesLabel
                    ? ` for ${latestRun.cacheSpeciesLabel}`
                    : ""}
                  … (one-time)
                </div>
              ) : null}
              <div
                className="cs-progress"
                style={{ maxWidth: 420, margin: "0 auto", height: 10 }}
              >
                <div
                  className="cs-progress-fill"
                  style={{
                    width: `${Math.max(3, Math.round(latestRun.progress * 100))}%`,
                  }}
                />
              </div>
              <p className="cs-tiny" style={{ marginTop: 14 }}>
                Matching mutations to genes · {Math.round(latestRun.progress * 100)}%
              </p>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (status === "paused" && latestRun) {
    return (
      <>
        {header}
        <Callout>
          <Dot style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Paused.</div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              Resume to pick it back up from annotating.
            </p>
          </div>
          <Btn
            disabled={submitting}
            onClick={() =>
              void runAction(() => api.resumeAnnotation(workspace.id, latestRun.id))
            }
          >
            Resume
          </Btn>
        </Callout>
      </>
    );
  }

  if (status === "failed") {
    return (
      <>
        {header}
        <Callout tone="warm">
          <Dot style={{ color: "var(--warm)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>
              Annotation failed.
            </div>
            <p className="cs-tiny" style={{ margin: "4px 0 0" }}>
              {latestRun?.error ?? "Try again, or check the command log in expert mode."}
            </p>
          </div>
          <Btn
            disabled={submitting}
            onClick={() =>
              void runAction(() => api.rerunAnnotation(workspace.id), { resetFocus: true })
            }
          >
            Annotate again
          </Btn>
        </Callout>
      </>
    );
  }

  if (!metrics || metrics.annotatedVariants === 0) {
    return (
      <>
        {header}
        <Card style={{ padding: "28px 24px", fontSize: 14 }}>
          The annotator finished, but no mutations made it through. Open the
          technical details below and check the VEP warnings file.
        </Card>
      </>
    );
  }

  return (
    <>
      {header}

      {/* Completion headline */}
      <div
        className="cs-callout"
        style={{
          marginBottom: 22,
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            flexShrink: 0,
            background: "color-mix(in oklch, var(--accent) 18%, transparent)",
            border: "1px solid color-mix(in oklch, var(--accent) 38%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 20,
            color: "var(--accent-ink)",
          }}
        >
          ★
        </div>
        <div style={{ flex: 1 }}>
          <Eyebrow>
            Annotated
            {metrics.speciesLabel ? ` · ${metrics.speciesLabel}` : ""}
          </Eyebrow>
          <h2
            style={{
              margin: "6px 0 6px",
              fontFamily: "var(--font-display)",
              fontWeight: 400,
              fontSize: 26,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              textWrap: "pretty",
              color: "var(--ink)",
            }}
          >
            We read{" "}
            <Tnum>{metrics.annotatedVariants.toLocaleString()}</Tnum> mutation
            {metrics.annotatedVariants === 1 ? "" : "s"} in your pet&apos;s tumor.{" "}
            {metrics.cancerGeneHits.length === 0 ? (
              <span style={{ color: "var(--muted)" }}>
                None of them landed in the curated cancer-gene list for this run.
              </span>
            ) : (
              <>
                <span style={{ color: "var(--accent-ink)", fontWeight: 500 }}>
                  <Tnum>{metrics.cancerGeneVariantCount}</Tnum>
                </span>{" "}
                fell in{" "}
                <span style={{ color: "var(--accent-ink)", fontWeight: 500 }}>
                  <Tnum>{metrics.cancerGeneHits.length}</Tnum>
                </span>{" "}
                gene{metrics.cancerGeneHits.length === 1 ? "" : "s"} linked to
                cancer before.
              </>
            )}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--muted)",
            }}
          >
            Of {metrics.totalVariants.toLocaleString()} called variants,{" "}
            {metrics.annotatedVariants.toLocaleString()} fell in a transcript we
            could map.
          </p>
        </div>
      </div>

      <ImpactSummary metrics={metrics} />

      <CancerGeneHits
        hits={metrics.cancerGeneHits}
        selectedSymbol={focusedGene ?? metrics.topGeneFocus?.symbol ?? null}
        onSelect={setFocusedGene}
      />

      {activeFocus && activeFocus.variants.length > 0 ? (
        <GeneLollipop focus={activeFocus} />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 16,
          marginTop: 16,
        }}
      >
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

      {tweaks.expertMode && latestRun?.commandLog.length ? (
        <Card style={{ marginTop: 20 }}>
          <CardHead
            eyebrow="Expert · VEP command"
            title="Command log"
          />
          <pre
            style={{
              margin: 0,
              padding: "16px 22px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.7,
              color: "var(--muted)",
              background: "var(--surface-sunk)",
              borderBottomLeftRadius: "var(--radius-cs-lg)",
              borderBottomRightRadius: "var(--radius-cs-lg)",
              overflow: "auto",
              maxHeight: 320,
            }}
          >
            {latestRun.commandLog.join("\n")}
          </pre>
        </Card>
      ) : null}

      <div
        style={{
          marginTop: 22,
          padding: "18px 22px",
          borderRadius: "var(--radius-cs-lg)",
          border: "1px dashed var(--line-strong)",
          background: "var(--surface-sunk)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Eyebrow>Next</Eyebrow>
          <div
            style={{
              marginTop: 6,
              fontSize: 15,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            Neoantigen prediction (pVACseq · NetMHCpan) is the next planned
            stage.
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13.5,
              color: "var(--muted)",
            }}
          >
            It uses the annotated VCF above to shortlist tumor-specific protein
            pieces your pet&apos;s immune system could actually see. Not shipped
            yet.
          </p>
        </div>
      </div>
    </>
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
    <Card>
      <div style={{ padding: "18px 22px 8px" }}>
        <Eyebrow>What we matched against</Eyebrow>
        <h3
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          Your pet&apos;s mutations vs. the reference knowledge
        </h3>
      </div>
      <div style={{ padding: "12px 22px 22px" }}>
        <DefRow
          label="Species / assembly"
          value={speciesLabel ?? referenceLabel ?? "—"}
        />
        <DefRow
          label="Annotator"
          value={`Ensembl VEP${vepRelease ? ` · release ${vepRelease}` : ""}`}
        />
        <DefRow label="Cancer-gene list" value="Curated from published driver lists" />
        <DefRow
          label="Cancer-gene hit rate"
          value={`${cancerPct.toFixed(2)}% of annotated variants`}
          last
        />
      </div>
    </Card>
  );
}

function DefRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 16,
        padding: "8px 0",
        borderBottom: last ? "none" : "1px solid var(--line)",
        fontSize: 13.5,
        alignItems: "baseline",
      }}
    >
      <MonoLabel style={{ whiteSpace: "nowrap" }}>{label}</MonoLabel>
      <span
        style={{
          color: "var(--ink-2)",
          textAlign: "right",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
