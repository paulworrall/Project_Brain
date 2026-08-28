import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement } from "@/lib/permissions";
import { RateCardsPanel } from "@/components/features/RateCardsPanel";

/**
 * The Rate Cards library — every Client's named Rate Cards, grouped by
 * Client, each with its own full version history. Mirrors the SOW
 * Templates library page's structure. Creating a brand-new named Rate Card
 * (via the shared CreateRateCardForm, rendered inside RateCardsPanel) is
 * available here directly, for every Client, in addition to the Client
 * detail page's quick-add (ClientRateCardsSummary) — not an either/or.
 */
export default async function RateCardsLibraryPage() {
  const [clients, session] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: {
        rateCards: {
          orderBy: { name: "asc" },
          include: {
            versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
            _count: { select: { projects: true } },
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
          <span>Rate Cards</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Rate Cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Client&apos;s Rate Cards, each with a full version history.
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
                <RateCardsPanel
                  clientId={client.id}
                  rateCards={client.rateCards.map((rc) => ({
                    id: rc.id,
                    name: rc.name,
                    currency: rc.currency,
                    archivedAt: rc.archivedAt,
                    liveProjectCount: rc._count.projects,
                    versions: rc.versions.map((v) => ({
                      id: v.id,
                      versionNumber: v.versionNumber,
                      status: v.status,
                      fileName: v.fileName,
                      uploadedByName: v.uploadedBy?.name ?? null,
                      uploadedAt: v.uploadedAt,
                      effectiveFrom: v.effectiveFrom,
                      effectiveTo: v.effectiveTo,
                    })),
                  }))}
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
