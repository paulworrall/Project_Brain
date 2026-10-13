// One-off cleanup (FB-001): removes the legacy .txt rate card versions, since
// rate cards are now Excel (.xlsx) only. Run it separately for each environment.
//
// DRY RUN by default: lists exactly what it would delete and changes nothing.
//   npx tsx --tsconfig tsconfig.json scripts/cleanup-txt-rate-cards.mts
// Delete (only unreferenced versions; anything a Project, Estimate or estimate
// rate line references is reported as BLOCKED and left alone):
//   npx tsx --tsconfig tsconfig.json scripts/cleanup-txt-rate-cards.mts --apply
// Point at a different environment's database with --env-file (default .env.local):
//   npx tsx --tsconfig tsconfig.json scripts/cleanup-txt-rate-cards.mts --env-file=.env.production.local
import { config } from "dotenv";

const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
const envFile = envFileArg ? envFileArg.slice("--env-file=".length) : ".env.local";
config({ path: envFile, quiet: true });

const apply = process.argv.includes("--apply");
const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "(unknown)";
console.log(`Database host: ${host}  (env file: ${envFile})`);

const { prisma } = await import("@/lib/prisma");
const { cleanupTxtRateCards, formatCleanupReport } = await import("@/lib/txtRateCardCleanup");

const report = apply
  ? await prisma.$transaction((tx) => cleanupTxtRateCards(tx, true))
  : await cleanupTxtRateCards(prisma, false);

console.log(formatCleanupReport(report));
if (!apply) console.log("\nRe-run with --apply to delete the versions marked WOULD_DELETE.");
await prisma.$disconnect();
