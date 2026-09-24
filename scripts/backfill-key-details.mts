// One-off backfill (2026-09-24) for projects created before key-detail
// extraction worked (it had always failed with a 400 "compiled grammar is
// too large") and before key details were kept out of the Position
// Document. For every project:
//   1. Read the brief + every Additional Input and save key-detail
//      SUGGESTIONS (never confirmed — a PM still confirms them).
//   2. If an old Position Document named a client contact and no Client
//      Contact key detail exists, carry it over as a suggestion (source BRIEF)
//      so it isn't lost when the Position Document stops holding it.
//   3. Append a new Position Document version (older versions untouched)
//      without the items the key details already cover and without the old
//      contact fields.
//
// Dry run by default — prints what would change, writes nothing:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-key-details.mts
// Apply:
//   npx tsx --tsconfig tsconfig.json scripts/backfill-key-details.mts --apply
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");

const { prisma } = await import("@/lib/prisma");
const { getBriefCompleteness } = await import("@/lib/briefCompleteness");
const { suggestKeyAttributesFromProjectSources } = await import("@/lib/keyAttributeSources");
const { extractKeyAttributes } = await import("@/services/agents/key-attribute-extraction");
const { removeItemsCoveredByKeyDetails } =
  await import("@/services/agents/position-key-detail-filter");
const { describeKnownKeyDetails } = await import("@/lib/keyDetailsContext");
const { CLIENT_CONTACT_FIELDS } = await import("@/lib/briefAttributes");
const { PositionDocumentFieldsSchema } = await import("@/types/intake");

type Extraction = Awaited<ReturnType<typeof extractKeyAttributes>>;

/** Dry run only: what extraction would find across the brief + inputs, merged (later sources win per attribute). */
async function previewExtraction(projectId: string): Promise<Extraction> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      briefRawText: true,
      knowledgeItems: { orderBy: { uploadedAt: "asc" }, select: { content: true } },
    },
  });
  const texts = [
    ...(project.briefRawText ? [{ text: project.briefRawText, kind: "brief" as const }] : []),
    ...project.knowledgeItems.map((k) => ({ text: k.content, kind: "update" as const })),
  ];
  const merged: Extraction = {};
  for (const extraction of await Promise.all(
    texts.map((t) => extractKeyAttributes(t.text, t.kind))
  )) {
    Object.assign(merged, extraction);
  }
  return merged;
}

const projects = await prisma.project.findMany({
  select: { id: true, name: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${projects.length} projects\n`);

for (const { id: projectId, name } of projects) {
  console.log(`=== ${name} (${projectId})`);

  // 1. Key-detail suggestions from the brief + inputs.
  let preview: Extraction | null = null;
  if (APPLY) {
    const { saved, error } = await suggestKeyAttributesFromProjectSources(projectId);
    console.log(
      error ? `  key details: FAILED — ${error}` : `  key details: ${saved} suggestion(s) saved`
    );
  } else {
    preview = await previewExtraction(projectId);
    const found = Object.entries(preview).map(
      ([id, e]) =>
        `${id} (${Object.entries(e.values)
          .filter(([, v]) => v && (!Array.isArray(v) || v.length))
          .map(([k]) => k)
          .join(", ")})`
    );
    console.log(`  key details found: ${found.length ? found.join("; ") : "none"}`);
  }

  // 2. Carry an old Position Document contact over, if nothing else holds it.
  const positionDoc = await prisma.document.findUnique({
    where: { projectId_type: { projectId, type: "POSITION_DOCUMENT" } },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const latest = positionDoc?.versions[0];
  const parsed = latest ? PositionDocumentFieldsSchema.safeParse(latest.content) : null;
  const fields = parsed?.success ? parsed.data : null;

  const completeness = await getBriefCompleteness(projectId);
  const contact = completeness.attributes.find((a) => a.id === CLIENT_CONTACT_FIELDS.attributeId);
  const contactKnown =
    !!contact?.confirmed?.values[CLIENT_CONTACT_FIELDS.name] ||
    !!contact?.suggestion?.values[CLIENT_CONTACT_FIELDS.name] ||
    !!preview?.[CLIENT_CONTACT_FIELDS.attributeId]?.values[CLIENT_CONTACT_FIELDS.name];
  if (fields?.primaryContactName && !contactKnown) {
    console.log(
      `  contact: carrying over "${fields.primaryContactName}" from the old Position Document as a suggestion`
    );
    if (APPLY) {
      await prisma.briefAttributeValue.create({
        data: {
          projectId,
          attributeId: CLIENT_CONTACT_FIELDS.attributeId,
          kind: "SUGGESTION",
          source: "BRIEF",
          values: {
            [CLIENT_CONTACT_FIELDS.name]: fields.primaryContactName,
            [CLIENT_CONTACT_FIELDS.email]: fields.primaryContactEmail ?? null,
          },
          evidence: "Carried over from the Position Document",
        },
      });
    }
  }

  // 3. New Position Document version without what the key details cover.
  if (!positionDoc || !latest || !fields) {
    console.log("  position document: none — skipped\n");
    continue;
  }
  const known = describeKnownKeyDetails(
    APPLY ? await getBriefCompleteness(projectId) : completeness,
    preview
  );
  const kept = await removeItemsCoveredByKeyDetails(fields.whatWeKnow, known);
  const removed = fields.whatWeKnow.filter((item) => !kept.includes(item));
  const hadContactFields = "primaryContactName" in fields || "primaryContactEmail" in fields;

  if (removed.length === 0 && !hadContactFields) {
    console.log("  position document: nothing to change\n");
    continue;
  }
  for (const item of removed)
    console.log(`  remove from Other details: ${item.topic}: ${item.detail.slice(0, 90)}`);
  if (hadContactFields) console.log("  drop old contact fields from the Position Document");
  console.log(
    `  -> new Position Document v${latest.versionNumber + 1} (${kept.length} of ${fields.whatWeKnow.length} details kept)\n`
  );

  if (APPLY) {
    await prisma.documentVersion.create({
      data: {
        documentId: positionDoc.id,
        versionNumber: latest.versionNumber + 1,
        stageNumber: latest.stageNumber,
        content: {
          whatWeKnow: kept,
          whatWeNeedToFindOut: fields.whatWeNeedToFindOut,
          clientFlaggedOpenItems: fields.clientFlaggedOpenItems,
        },
      },
    });
  }
}

await prisma.$disconnect();
