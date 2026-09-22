import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EstimateBuildWorkspace } from "@/components/features/EstimateBuildWorkspace";
import { buildEstimateContentDraft } from "@/lib/estimateContentDraft";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; estimateId: string }>;
}) {
  const { projectId, estimateId } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, projectId },
    include: {
      project: {
        include: { workstream: { include: { client: { include: { hub: true } } } } },
      },
      rateCardVersion: { include: { rateCard: true } },
      capabilityInputs: { orderBy: { addedAt: "asc" } },
      roleResolutions: {
        where: { resolvedAt: null },
        include: {
          estimateCapabilityInput: { select: { capability: true, otherLabel: true } },
          suggestedRateCardLine: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!estimate) {
    notFound();
  }

  const { project, rateCardVersion } = estimate;
  const { workstream } = project;
  const { client } = workstream;
  const { hub } = client;

  const rateCardLines = await prisma.rateCardLineItem.findMany({
    where: { rateCardVersionId: rateCardVersion.id },
    orderBy: [{ role: "asc" }, { level: "asc" }],
  });

  // buildEstimateContentDraft returns { message } instead of content
  // whenever there are pending resolutions or nothing resolved yet — both
  // cases where EstimateBuildWorkspace shouldn't show a review card.
  const draft = await buildEstimateContentDraft(estimateId);
  const reviewContent = "content" in draft ? draft.content : null;

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            {hub.name}
          </Link>
          {" / "}
          <Link href={`/clients/${client.id}`} className="hover:underline">
            {client.name}
          </Link>
          {" / "}
          <Link href={`/workstreams/${workstream.id}`} className="hover:underline">
            {workstream.name}
          </Link>
          {" / "}
          <Link href={`/projects/${project.id}`} className="hover:underline">
            {project.name}
          </Link>
          {" / "}
          <span>{estimate.label}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{estimate.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Locked to {rateCardVersion.rateCard.name} (version {rateCardVersion.versionNumber})
        </p>
      </div>

      <EstimateBuildWorkspace
        projectId={project.id}
        estimateId={estimate.id}
        existingInputs={estimate.capabilityInputs.map((input) => ({
          capability: input.capability,
          otherLabel: input.otherLabel,
          rawContent: input.rawContent,
          sourceFileName: input.sourceFileName,
        }))}
        pendingResolutions={estimate.roleResolutions.map((resolution) => ({
          id: resolution.id,
          capability: resolution.estimateCapabilityInput.capability,
          otherLabel: resolution.estimateCapabilityInput.otherLabel,
          rawRoleText: resolution.rawRoleText,
          extractedRole: resolution.extractedRole,
          extractedLevel: resolution.extractedLevel,
          extractedQuantity: Number(resolution.extractedQuantity),
          extractedUnit: resolution.extractedUnit,
          matchType: resolution.matchType,
          confidence: resolution.confidence,
          suggestedLine: resolution.suggestedRateCardLine
            ? {
                id: resolution.suggestedRateCardLine.id,
                role: resolution.suggestedRateCardLine.role,
                level: resolution.suggestedRateCardLine.level,
                rateType: resolution.suggestedRateCardLine.rateType,
                rate: Number(resolution.suggestedRateCardLine.rate),
                currency: resolution.suggestedRateCardLine.currency,
              }
            : null,
        }))}
        rateCardLines={rateCardLines.map((line) => ({
          id: line.id,
          role: line.role,
          level: line.level,
          rateType: line.rateType,
          rate: Number(line.rate),
          currency: line.currency,
        }))}
        reviewContent={reviewContent}
      />
    </div>
  );
}
