import { notFound, redirect } from "next/navigation";

import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function WorkspaceIndexPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  try {
    const workspace = await api.getWorkspace(workspaceId);
    const alignmentSummary = await api.getAlignmentStageSummary(workspaceId);

    let nextStage = workspace.activeStage;
    if (nextStage === "alignment" && !workspace.ingestion.readyForAlignment) {
      nextStage = "ingestion";
    }
    if (
      nextStage !== "ingestion" &&
      nextStage !== "alignment" &&
      !alignmentSummary.readyForVariantCalling
    ) {
      nextStage = workspace.ingestion.readyForAlignment ? "alignment" : "ingestion";
    }

    redirect(`/workspaces/${workspace.id}/${nextStage}`);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      notFound();
    }

    throw error;
  }
}
