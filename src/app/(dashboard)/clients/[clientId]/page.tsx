import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { auth } from "@/lib/auth";
import { isClientEngagement } from "@/lib/permissions";
import { ClientMasterServiceAgreementSummary } from "@/components/features/ClientMasterServiceAgreementSummary";
import { ClientRateCardsSummary } from "@/components/features/ClientRateCardsSummary";
import { ClientSowTemplatesSection } from "@/components/features/ClientSowTemplatesSection";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [client, baselineTemplate, session] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      include: {
        hub: true,
        workstreams: {
          orderBy: { name: "asc" },
          include: { _count: { select: { projects: true } } },
        },
        masterServiceAgreement: {
          include: {
            versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
          },
        },
        rateCards: {
          orderBy: { name: "asc" },
          include: {
            versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
          },
        },
        sowTemplates: {
          orderBy: { name: "asc" },
          include: {
            versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
          },
        },
      },
    }),
    prisma.sOWTemplate.findFirst({
      where: { isBaseline: true },
      include: { versions: { where: { status: "ENABLED" }, take: 1 } },
    }),
    auth(),
  ]);

  if (!client) {
    notFound();
  }

  const { hub, workstreams, masterServiceAgreement, rateCards, sowTemplates } = client;
  const canManageCommercialDocuments = isClientEngagement(session);

  const currentMsaVersion = masterServiceAgreement?.versions.find((v) => v.status === "ENABLED");

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            {hub.name}
          </Link>
          {" / "}
          <span>{client.name}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{client.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workstreams.length} workstream{workstreams.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workstreams.map((workstream) => (
          <Link key={workstream.id} href={`/workstreams/${workstream.id}`} className="block">
            <Card className="p-4 transition-colors hover:border-primary">
              <h3 className="font-semibold text-foreground">{workstream.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {workstream._count.projects} project
                {workstream._count.projects === 1 ? "" : "s"}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {workstreams.length === 0 && (
        <p className="text-sm text-muted-foreground">No Workstreams yet under this Client.</p>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contracts & Rates
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ClientMasterServiceAgreementSummary
            current={
              currentMsaVersion ? { id: currentMsaVersion.id, fileName: currentMsaVersion.fileName } : null
            }
          />
          <ClientRateCardsSummary
            clientId={client.id}
            rateCards={rateCards.map((rc) => ({
              id: rc.id,
              name: rc.name,
              currency: rc.currency,
              currentVersionFileName: rc.versions.find((v) => v.status === "ENABLED")?.fileName ?? null,
            }))}
            canManage={canManageCommercialDocuments}
          />
        </div>
      </div>

      <ClientSowTemplatesSection
        clientId={client.id}
        clientName={client.name}
        baseline={
          baselineTemplate
            ? {
                id: baselineTemplate.id,
                name: baselineTemplate.name,
                isBaseline: true,
                currentVersionFileName: baselineTemplate.versions[0]?.fileName ?? null,
              }
            : null
        }
        variants={sowTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          isBaseline: t.isBaseline,
          currentVersionFileName: t.versions.find((v) => v.status === "ENABLED")?.fileName ?? null,
        }))}
        canManage={canManageCommercialDocuments}
      />
    </div>
  );
}
