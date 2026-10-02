// One-off backfill (2026-10-02) for migration 20261002100000_link_sow_versions_to_estimate_versions:
// links existing SOW versions to the estimate version they were built from,
// only where that's unambiguous (see backfillSowEstimateLinks), and logs what
// it linked and what it left unlinked, with the reason. Safe to re-run:
// already-linked versions are never touched.
//
// Dry run by default — runs inside a transaction that's rolled back, so it
// prints exactly what would happen and writes nothing:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-sow-estimate-links.mts
// Apply:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-sow-estimate-links.mts --apply
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { prisma } = await import("@/lib/prisma");
const { backfillSowEstimateLinks } = await import("@/lib/sowEstimateLink");

const apply = process.argv.includes("--apply");

class DryRunRollback extends Error {}

let report: Awaited<ReturnType<typeof backfillSowEstimateLinks>> | undefined;
try {
  await prisma.$transaction(async (tx) => {
    report = await backfillSowEstimateLinks(tx);
    if (!apply) throw new DryRunRollback();
  });
} catch (error) {
  if (!(error instanceof DryRunRollback)) throw error;
}

console.log(apply ? "Applied." : "Dry run — nothing written. Re-run with --apply to write.");
console.log(`Already linked (untouched): ${report!.alreadyLinked}`);
console.log(`Linked: ${report!.linked.length}`);
for (const l of report!.linked) console.log(`  SOW version ${l.sowVersionId} → estimate version ${l.estimateVersionId}`);
console.log(`Left unlinked: ${report!.unlinked.length}`);
for (const u of report!.unlinked) console.log(`  SOW version ${u.sowVersionId}: ${u.reason}`);

await prisma.$disconnect();
