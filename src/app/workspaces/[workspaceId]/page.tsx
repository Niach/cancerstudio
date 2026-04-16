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
    const [workspace, alignmentSummary, variantCallingSummary] = await Promise.all([
      api.getWorkspace(workspaceId),
      api.getAlignmentStageSummary(workspaceId),
      api.getVariantCallingStageSummary(workspaceId),
    ]);
    const policy = getPipelinePolicy(
      workspace,
      alignmentSummary,
      variantCallingSummary
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
