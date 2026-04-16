import type {
  AlignmentStageSummary,
  PipelineStage,
  PipelineStageId,
  VariantCallingStageSummary,
  Workspace,
} from "@/lib/types";
import { LATER_RESEARCH_STAGES, PIPELINE_STAGES, PRIMARY_PIPELINE_STAGES } from "@/lib/types";

export interface PipelineStagePolicy {
  stage: PipelineStage;
  visible: boolean;
  enterable: boolean;
  actionable: boolean;
  blockedReason: string | null;
  nextStep: string | null;
}

export type PipelinePolicyMap = Record<PipelineStageId, PipelineStagePolicy>;

function alignmentNeedsReview(summary: AlignmentStageSummary) {
  return summary.status === "completed" && summary.qcVerdict === "warn";
}

function variantBlockedReason(
  alignmentSummary: AlignmentStageSummary,
  variantCallingSummary: VariantCallingStageSummary
) {
  if (variantCallingSummary.status === "blocked") {
    return variantCallingSummary.blockingReason ?? "Finish alignment first.";
  }
  return variantCallingSummary.blockingReason ?? "Variant calling is visible here, but not yet available.";
}

export function getPipelinePolicy(
  workspace: Workspace,
  alignmentSummary: AlignmentStageSummary,
  variantCallingSummary: VariantCallingStageSummary
): PipelinePolicyMap {
  const latestActionableStage =
    workspace.ingestion.readyForAlignment && alignmentSummary.status !== "blocked"
      ? "alignment"
      : "ingestion";

  const policies = {} as PipelinePolicyMap;

  for (const stage of PIPELINE_STAGES) {
    if (stage.id === "ingestion") {
      const normalReady = workspace.ingestion.lanes.normal.readyForAlignment;
      const tumorReady = workspace.ingestion.lanes.tumor.readyForAlignment;
      let nextStep = "Add the tumor and healthy sample files.";
      if (tumorReady && !normalReady) {
        nextStep = "Add the healthy sample files next.";
      } else if (!tumorReady && normalReady) {
        nextStep = "Add the tumor sample files next.";
      } else if (workspace.ingestion.readyForAlignment) {
        nextStep = "Continue to alignment.";
      }

      policies[stage.id] = {
        stage,
        visible: true,
        enterable: true,
        actionable: true,
        blockedReason: null,
        nextStep,
      };
      continue;
    }

    if (stage.id === "alignment") {
      const blockedReason =
        !workspace.ingestion.readyForAlignment
          ? "Add both the tumor and healthy sample files before alignment can start."
          : alignmentSummary.blockingReason ?? null;

      policies[stage.id] = {
        stage,
        visible: true,
        enterable: true,
        actionable: workspace.ingestion.readyForAlignment,
        blockedReason,
        nextStep:
          alignmentSummary.status === "running"
            ? "Alignment is in progress."
            : alignmentSummary.status === "paused"
              ? "Resume alignment when you're ready."
              : alignmentSummary.status === "failed"
                ? "Fix the alignment issue and run it again."
              : alignmentNeedsReview(alignmentSummary)
                ? "Review the quality warnings or rerun alignment."
                : alignmentSummary.readyForVariantCalling
                  ? "Alignment is finished. Variant calling is the next planned step."
                  : "Choose WGS or WES, then start alignment.",
      };
      continue;
    }

    if (stage.id === "variant-calling") {
      policies[stage.id] = {
        stage,
        visible: true,
        enterable: true,
        actionable: false,
        blockedReason: variantBlockedReason(alignmentSummary, variantCallingSummary),
        nextStep:
          variantCallingSummary.status === "blocked"
            ? latestActionableStage === "alignment"
              ? "Finish alignment cleanly first."
              : "Complete ingestion first."
            : "This read-only preview shows what comes next once Mutect2 is implemented.",
      };
      continue;
    }

    const isResearchStage = stage.group === "later";
    const blockedReason = isResearchStage
      ? "Research-only modules are visible for orientation, but not available yet."
      : "This step is on the roadmap and will unlock in a future release.";

    policies[stage.id] = {
      stage,
      visible: true,
      enterable: false,
      actionable: false,
      blockedReason,
      nextStep:
        latestActionableStage === "alignment"
          ? "Stay on alignment for now."
          : "Finish ingestion first.",
    };
  }

  return policies;
}

export function getLatestActionableStageId(policy: PipelinePolicyMap): PipelineStageId {
  for (let index = PRIMARY_PIPELINE_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = PRIMARY_PIPELINE_STAGES[index];
    if (policy[stage.id].actionable) {
      return stage.id;
    }
  }
  return "ingestion";
}

export function getPreferredWorkspaceStageId(
  activeStage: PipelineStageId,
  policy: PipelinePolicyMap
): PipelineStageId {
  return policy[activeStage]?.actionable
    ? activeStage
    : getLatestActionableStageId(policy);
}

export function getVisiblePrimaryStages(policy: PipelinePolicyMap) {
  return PRIMARY_PIPELINE_STAGES.filter((stage) => policy[stage.id].visible);
}

export function getVisibleResearchStages(policy: PipelinePolicyMap) {
  return LATER_RESEARCH_STAGES.filter((stage) => policy[stage.id].visible);
}

export function describeWorkspaceProgress(
  workspace: Workspace,
  alignmentSummary: AlignmentStageSummary
) {
  if (!workspace.ingestion.lanes.tumor.sourceFileCount) {
    return "Add the tumor sample files to get started.";
  }
  if (!workspace.ingestion.lanes.normal.sourceFileCount) {
    return "Add the healthy sample files next.";
  }
  if (!workspace.ingestion.readyForAlignment) {
    return "We’re still preparing the sequencing files for alignment.";
  }
  if (alignmentSummary.status === "blocked" && !workspace.analysisProfile.assayType) {
    return "Choose whether the sequencing was WGS or WES.";
  }
  if (alignmentSummary.status === "running") {
    return "Alignment is running on your local machine.";
  }
  if (alignmentSummary.status === "paused") {
    return "Alignment is paused and can be resumed later.";
  }
  if (alignmentSummary.status === "failed") {
    return "Alignment needs attention before the next step.";
  }
  if (alignmentSummary.status === "completed" && alignmentSummary.qcVerdict === "warn") {
    return "Alignment finished, but the quality warnings need review.";
  }
  if (alignmentSummary.readyForVariantCalling) {
    return "Alignment is complete. Variant calling is shown as the next planned step.";
  }
  return "Alignment is the next step.";
}
