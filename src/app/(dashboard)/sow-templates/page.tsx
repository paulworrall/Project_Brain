import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isClientEngagement } from "@/lib/permissions";
import type { VersionHistoryItem } from "@/components/features/VersionHistory";
import { SOWTemplateVersionHistory } from "@/components/features/SOWTemplateVersionHistory";

interface VersionRow {
  id: string;
  versionNumber: number;
  status: "ENABLED" | "DISABLED";
  fileName: string;
  uploadedAt: Date;
  uploadedBy: { name: string } | null;
}

function toVersionItems(versions: VersionRow[]): VersionHistoryItem[] {
  return versions.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    status: v.status,
    fileName: v.fileName,
    uploadedByName: v.uploadedBy?.name ?? null,
    uploadedAt: v.uploadedAt,
  }));
}

/**
 * The SOW Templates library — the baseline GLOBAL template plus a grouped
 * view of every client-specific variant. Not nested under one Client's
 * detail page since the baseline applies to every Client; each Client's
 * detail page separately shows a read-only view scoped to just that Client
 * (baseline + its own variants) with a quick "Add variant" action — full
 * upload/revert management for every template lives here, the one place
 * that logic exists (reusing the shared VersionHistory component).
 */
export default async function SowTemplatesLibraryPage() {
  const [baseline, variants, session] = await Promise.all([
    prisma.sOWTemplate.findFirst({
      where: { isBaseline: true },
      include: { versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } } },
    }),
    prisma.sOWTemplate.findMany({
      where: { scope: "CLIENT_SPECIFIC" },
      include: {
        client: true,
        versions: { include: { uploadedBy: true }, orderBy: { versionNumber: "desc" } },
      },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    }),
    auth(),
  ]);

  const canManage = isClientEngagement(session);

  const variantsByClient = new Map<
    string,
    { clientName: string; templates: typeof variants }
  >();
  for (const variant of variants) {
    if (!variant.client) {
      continue;
    }
    const existing = variantsByClient.get(variant.client.id);
    if (existing) {
      existing.templates.push(variant);
    } else {
      variantsByClient.set(variant.client.id, {
        clientName: variant.client.name,
        templates: [variant],
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            All Projects
          </Link>
          {" / "}
          <span>SOW Templates</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold text-foreground">SOW Templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The baseline template every Client can use for SOW development, plus client-specific
          variants.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Baseline
        </h2>
        <div className="mt-3">
          {baseline ? (
            <SOWTemplateVersionHistory
              sowTemplateId={baseline.id}
              title={baseline.name}
              versions={toVersionItems(baseline.versions)}
              canManage={canManage}
              emptyMessage="No baseline version uploaded yet."
            />
          ) : (
            <p className="text-sm text-muted-foreground">No baseline template found.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Client-specific variants
        </h2>
        {variantsByClient.size === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No client-specific variants yet — add one from a Client&apos;s detail page.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {Array.from(variantsByClient.entries()).map(([clientId, { clientName, templates }]) => (
              <div key={clientId}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {clientName}
                </h3>
                <div className="mt-2 space-y-3">
                  {templates.map((template) => (
                    <SOWTemplateVersionHistory
                      key={template.id}
                      sowTemplateId={template.id}
                      title={template.name}
                      versions={toVersionItems(template.versions)}
                      canManage={canManage}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
