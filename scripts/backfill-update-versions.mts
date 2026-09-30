// One-off backfill (2026-09-30) for migration 20260930150000_version_project_updates:
// numbers every project's existing updates v2, v3, … by when they were added
// (the brief is v1). Their source already defaulted to Client in the
// migration. Safe to re-run: only unnumbered updates are touched.
//
// Dry run by default — prints what would change, writes nothing:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-update-versions.mts
// Apply:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-update-versions.mts --apply
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { prisma } = await import("@/lib/prisma");
const { assignMissingUpdateVersions } = await import("@/lib/updateVersions");

const apply = process.argv.includes("--apply");

const unnumbered = await prisma.knowledgeItem.groupBy({
  by: ["projectId"],
  where: { versionNumber: null },
  _count: { _all: true },
});
console.log(
  `${unnumbered.reduce((n, g) => n + g._count._all, 0)} unnumbered update(s) across ${unnumbered.length} project(s).`
);

if (apply) {
  const numbered = await assignMissingUpdateVersions(prisma);
  console.log(`Numbered ${numbered} update(s).`);
} else {
  console.log("Dry run — re-run with --apply to number them.");
}

await prisma.$disconnect();
