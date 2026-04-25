import { notFound, redirect } from "next/navigation";

import { api } from "@/lib/api";
import {
  getPipelinePolicy,
  getPreferredWorkspaceStageId,
} from "@/lib/pipeline-policy";

export const dynamic = "force-dynamic";

export default async function WorkspaceIndexPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  try {
    const [
      workspace,
      alignmentSummary,
      variantCallingSummary,
      annotationSummary,
      neoantigenSummary,
      epitopeSummary,
      constructSummary,
      constructOutputSummary,
      aiReviewSummary,
    ] = await Promise.all([
      api.getWorkspace(workspaceId),
      api.getAlignmentStageSummary(workspaceId),
      api.getVariantCallingStageSummary(workspaceId),
      api.getAnnotationStageSummary(workspaceId),
      api.getNeoantigenStageSummary(workspaceId),
      api.getEpitopeStageSummary(workspaceId),
      api.getConstructStageSummary(workspaceId),
      api.getConstructOutputSummary(workspaceId),
      api.getAiReviewSummary(workspaceId),
    ]);
    const policy = getPipelinePolicy(
      workspace,
      alignmentSummary,
      variantCallingSummary,
      annotationSummary,
      neoantigenSummary,
      epitopeSummary,
      constructSummary,
      constructOutputSummary,
      aiReviewSummary
    );
    const nextStage = getPreferredWorkspaceStageId(workspace.activeStage, policy);

    redirect(`/workspaces/${workspace.id}/${nextStage}`);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      notFound();
    }

    throw error;
  }
}
