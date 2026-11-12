import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB tests for FB-010 addProjectInformationAction: pasted text and files
// saved as consecutive versions with their type and date, the email redraft
// queued once per batch, file checks, and the guards. Claude is mocked.
// Skipped until the FB-010 migration is applied.

vi.mock("@anthropic-ai/sdk", () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  class MockAnthropic {
    messages = { parse: vi.fn() };
  }
  return { default: Object.assign(MockAnthropic, { RateLimitError, APIError }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const { anthropic } = await import("@/lib/anthropic");
const mockParse = anthropic.messages.parse as ReturnType<typeof vi.fn>;
const { keyAttributeFacts } = await import("./fixtures/keyAttributeFacts");
const { addProjectInformationAction } =
  await import("@/app/(dashboard)/projects/[projectId]/actions");
const { getVersionHistory } = await import("@/lib/updateVersions");
const { getProjectContext } = await import("@/lib/projectContext");
const { afterResponseQueue } = await import("./helpers/afterResponse");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const migrated = (
  await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'KnowledgeItem' AND column_name = 'occurredOn'`
)[0]?.n;
const describeDb = migrated ? describe : describe.skip;
if (!migrated)
  console.warn("[fb-010-information] apply the 20261113100000 migration to run these tests.");

const STAMP = Date.now();
const FIXTURES = path.resolve(import.meta.dirname, "fixtures/brief");
let hubId: string;
let workstreamId: string;
let userId: string;
let n = 0;

async function newProject(): Promise<string> {
  n += 1;
  return (
    await prisma.project.create({
      data: { name: `Info ${n}`, workstreamId, briefRawText: "Brief." },
    })
  ).id;
}

function form(fields: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function txt(name: string, text: string): File {
  return new File([text], name, { type: "text/plain" });
}

beforeAll(async () => {
  if (!migrated) return;
  const hub = await prisma.hub.create({ data: { name: `TestHub_Fb010_${STAMP}` } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "Fb010Client", hubId } });
  workstreamId = (
    await prisma.workstream.create({ data: { name: "Fb010Ws", clientId: client.id } })
  ).id;
  userId = (
    await prisma.user.create({
      data: { name: "Pat", email: `pat-${STAMP}@fb010.test`, passwordHash: "x", role: "DELIVERY" },
    })
  ).id;
});

afterAll(async () => {
  if (migrated) {
    await prisma.hub.delete({ where: { id: hubId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  mockParse.mockReset();
  // Every save reads key details once (no Scope summary or Position Document on these projects).
  mockParse.mockResolvedValue({ parsed_output: keyAttributeFacts() });
  mockAuth.mockResolvedValue({ user: { id: userId, role: "DELIVERY" } });
  afterResponseQueue().length = 0;
});

describeDb("addProjectInformationAction", () => {
  it("saves pasted text as the next version with its type, source and date", async () => {
    const projectId = await newProject();
    mockParse.mockResolvedValueOnce({
      parsed_output: keyAttributeFacts({
        budget: { amount: "£60,000", currency: "GBP", evidence: "£60k" },
      }),
    });
    const result = await addProjectInformationAction(
      projectId,
      form({
        category: "MEETING_NOTES",
        source: "INTERNAL_TEAM",
        occurredOn: "2026-11-03",
        content: "Budget is now £60k.",
      })
    );
    expect(result).toMatchObject({
      ok: true,
      data: { versionNumber: 2, fileName: null, confirmation: "Added as v2 · Updated: budget" },
    });
    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item).toMatchObject({
      category: "MEETING_NOTES",
      source: "INTERNAL_TEAM",
      type: "NOTE",
      content: "Budget is now £60k.",
    });
    expect(item.occurredOn?.toISOString().slice(0, 10)).toBe("2026-11-03");
    // AI summary + email redraft queued.
    expect(afterResponseQueue().length).toBe(2);

    // The history and the agents' context say what it is and when it happened.
    const history = await getVersionHistory(projectId);
    expect(history[1].detail).toBe("Meeting notes · happened 3 Nov 2026");
    expect((await getProjectContext(projectId)).text).toContain(
      "(Meeting notes · happened 3 Nov 2026)"
    );
  });

  it("defaults the date to today", async () => {
    const projectId = await newProject();
    await addProjectInformationAction(projectId, form({ category: "OTHER", content: "Note." }));
    const item = await prisma.knowledgeItem.findFirstOrThrow({ where: { projectId } });
    expect(item.occurredOn?.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it("saves files sent one by one as consecutive versions; the email is redrafted once, after the last", async () => {
    const projectId = await newProject();
    const docx = new File(
      [readFileSync(path.join(FIXTURES, "brief-structured.docx"))],
      "minutes.docx",
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }
    );
    const first = await addProjectInformationAction(
      projectId,
      form({ category: "PRESENTATION_OR_DOCUMENT", file: docx, finalInBatch: "false" })
    );
    expect(first).toMatchObject({ ok: true, data: { versionNumber: 2, fileName: "minutes.docx" } });
    expect(afterResponseQueue().length).toBe(1); // summary only
    expect(first.ok && first.data.notice).not.toMatch(/email draft/);

    const second = await addProjectInformationAction(
      projectId,
      form({
        category: "PRESENTATION_OR_DOCUMENT",
        file: txt("follow-up.txt", "Second file."),
        finalInBatch: "true",
      })
    );
    expect(second).toMatchObject({
      ok: true,
      data: { versionNumber: 3, fileName: "follow-up.txt" },
    });
    expect(afterResponseQueue().length).toBe(3); // + summary + one redraft

    const items = await prisma.knowledgeItem.findMany({
      where: { projectId },
      orderBy: { versionNumber: "asc" },
    });
    expect(items.map((i) => [i.versionNumber, i.type, i.originalFileName])).toEqual([
      [2, "DOCUMENT", "minutes.docx"],
      [3, "DOCUMENT", "follow-up.txt"],
    ]);
  });

  it("rejects unsupported, legacy, empty and too-large files, and nothing is saved", async () => {
    const projectId = await newProject();
    const cases: [File, RegExp][] = [
      [new File(["a,b"], "rates.xlsx", { type: "" }), /isn't supported/],
      [new File(["x"], "old.ppt", { type: "" }), /can't be read/],
      [
        new File([readFileSync(path.join(FIXTURES, "empty.docx"))], "empty.docx", { type: "" }),
        /couldn't read any text/,
      ],
      [
        new File([new Uint8Array(9 * 1024 * 1024)], "huge.txt", { type: "text/plain" }),
        /too large/,
      ],
    ];
    for (const [file, message] of cases) {
      const result = await addProjectInformationAction(
        projectId,
        form({ category: "OTHER", file })
      );
      expect(result).toMatchObject({
        ok: false,
        code: "VALIDATION",
        message: expect.stringMatching(message),
      });
    }
    const zeroByte = await addProjectInformationAction(
      projectId,
      form({ category: "OTHER", file: new File([], "blank.txt", { type: "text/plain" }) })
    );
    expect(zeroByte).toMatchObject({
      ok: false,
      message: expect.stringMatching(/couldn't read any text/),
    });
    expect(await prisma.knowledgeItem.count({ where: { projectId } })).toBe(0);
  });

  it("needs a type, and text or a file but not both", async () => {
    const projectId = await newProject();
    expect(await addProjectInformationAction(projectId, form({ content: "x" }))).toMatchObject({
      ok: false,
      fieldErrors: { category: expect.any(String) },
    });
    expect(await addProjectInformationAction(projectId, form({ category: "OTHER" }))).toMatchObject(
      {
        ok: false,
        message: "Paste some text or add a file.",
      }
    );
    expect(
      await addProjectInformationAction(
        projectId,
        form({ category: "OTHER", content: "x", file: txt("a.txt", "y") })
      )
    ).toMatchObject({ ok: false, message: "Add either pasted text or a file, not both." });
  });

  it("is refused when not signed in, or once the project is complete", async () => {
    const projectId = await newProject();
    mockAuth.mockResolvedValueOnce(null);
    expect(
      await addProjectInformationAction(projectId, form({ category: "OTHER", content: "x" }))
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });

    const sow = await prisma.sOW.create({ data: { projectId } });
    const sv = await prisma.sOWVersion.create({
      data: {
        sowId: sow.id,
        versionNumber: 1,
        fileName: "s.docx",
        fileBytes: Buffer.from("PK"),
        content: {},
      },
    });
    await prisma.commercialApproval.create({
      data: {
        projectId,
        documentType: "SOW",
        sowVersionId: sv.id,
        clientApprovedOn: new Date("2026-11-01"),
        clientApproverName: "Caroline",
        fileSha256: "0".repeat(64),
        recordedByUserId: userId,
      },
    });
    expect(
      await addProjectInformationAction(projectId, form({ category: "OTHER", content: "x" }))
    ).toMatchObject({
      ok: false,
      code: "PROJECT_COMPLETE",
      message: "This project is complete. Changes will need a change request (coming soon).",
    });
  });
});
