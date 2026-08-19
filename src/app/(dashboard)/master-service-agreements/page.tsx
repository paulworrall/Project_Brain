import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement } from "@/lib/permissions";
import { MasterServiceAgreementsPanel } from "@/components/features/MasterServiceAgreementsPanel";

/**
 * The Master Service Agreements library — every Client's MSA (a single,
 * unnamed document per Client), grouped by Client, each with its own full
 * version history. Mirrors the SOW Templates library page's structure; each
 * Client's detail page separately shows a read-only summary
 * (ClientMasterServiceAgreementSummary) linking back here for management.
 */
export default async function MasterServiceAgreementsLibraryPage() {
  const [clients, session] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: {
        masterServiceAgreement: {
          include: {
            versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
          },
        },
      },
    }),
    auth(),
  ]);

  const canManage = isClientEngagement(session);

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            All Projects
          </Link>
          {" / "}
          <span>Master Service Agreements</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Master Service Agreements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Client&apos;s MSA — one document per Client, with a full version history.
        </p>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Clients yet.</p>
      ) : (
        <div className="space-y-6">
          {clients.map((client) => (
            <div key={client.id}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              </h2>
              <div className="mt-2">
                <MasterServiceAgreementsPanel
                  clientId={client.id}
                  versions={
                    client.masterServiceAgreement?.versions.map((v) => ({
                      id: v.id,
                      versionNumber: v.versionNumber,
                      status: v.status,
                      fileName: v.fileName,
                      uploadedByName: v.uploadedBy?.name ?? null,
                      uploadedAt: v.uploadedAt,
                      effectiveFrom: v.effectiveFrom,
                      effectiveTo: v.effectiveTo,
                    })) ?? []
                  }
                  canManage={canManage}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
