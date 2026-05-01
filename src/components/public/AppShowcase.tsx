"use client";

import { useEffect, useRef, useState } from "react";

import AlignmentStagePanel from "@/components/workspaces/AlignmentStagePanel";
import AnnotationStagePanel from "@/components/workspaces/AnnotationStagePanel";
import ConstructDesignStagePanel from "@/components/workspaces/ConstructDesignStagePanel";
import ConstructOutputStagePanel from "@/components/workspaces/ConstructOutputStagePanel";
import EpitopeSelectionStagePanel from "@/components/workspaces/EpitopeSelectionStagePanel";
import IngestionStagePanel from "@/components/workspaces/IngestionStagePanel";
import NeoantigenPredictionStagePanel from "@/components/workspaces/NeoantigenPredictionStagePanel";
import VariantCallingStagePanel from "@/components/workspaces/VariantCallingStagePanel";
import ReviewPanel from "@/components/public/showcase/mocks/ReviewPanel";
import {
  DEMO_ALIGNMENT_SUMMARY,
  DEMO_ANNOTATION_SUMMARY,
  DEMO_CONSTRUCT_OUTPUT_SUMMARY,
  DEMO_CONSTRUCT_SUMMARY,
  DEMO_EPITOPE_SUMMARY,
  DEMO_NEOANTIGEN_SUMMARY,
  DEMO_VARIANT_CALLING_SUMMARY,
  DEMO_WORKSPACE,
} from "@/lib/demo-fixtures";
import type { PipelineStageId } from "@/lib/types";

interface ShowcaseStage {
  id: PipelineStageId;
  n: string;
  label: string;
  sub: string;
  crumb: string;
}

const STAGES: ShowcaseStage[] = [
  { id: "ingestion",             n: "01", label: "Ingest",     sub: "2 × FASTQ",      crumb: "Intake" },
  { id: "alignment",             n: "02", label: "Align",      sub: "strobealign",    crumb: "Read alignment" },
  { id: "variant-calling",       n: "03", label: "Variants",   sub: "Mutect2",        crumb: "Variant calling" },
  { id: "annotation",            n: "04", label: "Annotate",   sub: "VEP · COSMIC",   crumb: "Functional annotation" },
  { id: "neoantigen-prediction", n: "05", label: "Neoantigen", sub: "pVACseq",        crumb: "Neoantigen prediction" },
  { id: "epitope-selection",     n: "06", label: "Epitopes",   sub: "NetMHCpan",      crumb: "MHC curation" },
  { id: "construct-design",      n: "07", label: "Construct",  sub: "mRNA assembly",  crumb: "mRNA design" },
  { id: "construct-output",      n: "08", label: "Output",     sub: "FASTA + report", crumb: "Deliverables" },
  { id: "ai-review",             n: "09", label: "Review",     sub: "Claude audit",   crumb: "Final review" },
];

const NOOP = () => {};

function StageContent({ stageId }: { stageId: PipelineStageId }) {
  switch (stageId) {
    case "ingestion":
      return <IngestionStagePanel workspace={DEMO_WORKSPACE} onWorkspaceChange={NOOP} />;
    case "alignment":
      return <AlignmentStagePanel workspace={DEMO_WORKSPACE} summary={DEMO_ALIGNMENT_SUMMARY} onWorkspaceChange={NOOP} onSummaryChange={NOOP} />;
    case "variant-calling":
      return <VariantCallingStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_VARIANT_CALLING_SUMMARY} />;
    case "annotation":
      return <AnnotationStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_ANNOTATION_SUMMARY} />;
    case "neoantigen-prediction":
      return <NeoantigenPredictionStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_NEOANTIGEN_SUMMARY} />;
    case "epitope-selection":
      return <EpitopeSelectionStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_EPITOPE_SUMMARY} />;
    case "construct-design":
      return <ConstructDesignStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_CONSTRUCT_SUMMARY} />;
    case "construct-output":
      return <ConstructOutputStagePanel workspace={DEMO_WORKSPACE} initialSummary={DEMO_CONSTRUCT_OUTPUT_SUMMARY} />;
    case "ai-review":
      return (
        <div style={{ padding: 24 }}>
          <ReviewPanel />
        </div>
      );
    default:
      return null;
  }
}

export default function AppShowcase() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing || interacting) return;
    timer.current = setTimeout(() => {
      setActive(a => (a + 1) % STAGES.length);
    }, 7200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, playing, interacting]);

  const stage = STAGES[active];

  const pick = (i: number) => {
    setActive(i);
    setPlaying(false);
  };

  return (
    <section className="block app-showcase" id="app-showcase">
      <div className="inner">
        <div className="section-label">The app</div>
        <div className="showcase-head">
          <h2 className="big">
            The studio runs <em className="acgt-C">on your machine</em>.
          </h2>
          <p className="subhead">
            Eight stages, twelve hours, one vaccine. No cloud, no data leaves your lab —
            step through every stage below, or let it play.
          </p>
        </div>

        <div className="mvx-showcase">
          <div className="mvx-window">
            <div className="mvx-chrome">
              <div className="mvx-dots"><span /><span /><span /></div>
              <div className="mvx-url">
                <span className="mvx-url-lock">●</span>
                localhost:3000 <span className="mvx-url-sub">— mutavax / {stage.crumb}</span>
              </div>
              <div className="mvx-chrome-meta">v0.6</div>
            </div>

            <div
              className="mvx-viewport"
              onMouseEnter={() => setInteracting(true)}
              onMouseLeave={() => setInteracting(false)}
            >
              <div className="mvx-showcase-layout">
                <nav className="mvx-showcase-rail">
                  {STAGES.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className={"mvx-showcase-pill" + (i === active ? " on" : "")}
                      onClick={() => pick(i)}
                    >
                      <span className="mvx-showcase-n">{s.n}</span>
                      <span>
                        <span className="mvx-showcase-lbl">{s.label}</span>
                        <span className="mvx-showcase-sub">{s.sub}</span>
                      </span>
                    </button>
                  ))}
                </nav>
                <div className="mvx-showcase-main" key={stage.id}>
                  <div className="mvx-theme mvx-showcase-scope">
                    <StageContent stageId={stage.id} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mvx-footbar">
              <div className="mvx-foot-left">
                <span className="mvx-foot-dot" /> Demo fixture · stage {stage.n} · {stage.label}
              </div>
              <div className="mvx-foot-right">Click a stage in the sidebar to jump ↗</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
