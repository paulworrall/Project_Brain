import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assembleProjectContext } from "@/services/agents/chatbot";

// Explicit cross-project isolation check (CLAUDE.md: "create two projects
// (same Client), verify a query against one never surfaces the other's
// data"). Uses the real dev database, same convention as tests/schema.test.ts
// — everything created under one throwaway Hub, removed via cascade delete.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_ChatbotIsolationSpec";

let hubId: string;
let projectAId: string;
let projectBId: string;

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;

  const client = await prisma.client.create({
    data: { name: "IsolationSpecClient", hubId },
  });

  const [workstreamA, workstreamB] = await Promise.all([
    prisma.workstream.create({ data: { name: "IsolationSpecWorkstreamA", clientId: client.id } }),
    prisma.workstream.create({ data: { name: "IsolationSpecWorkstreamB", clientId: client.id } }),
  ]);

  const [projectA, projectB] = await Promise.all([
    prisma.project.create({ data: { name: "IsolationSpecProjectA", workstreamId: workstreamA.id } }),
    prisma.project.create({ data: { name: "IsolationSpecProjectB", workstreamId: workstreamB.id } }),
  ]);
  projectAId = projectA.id;
  projectBId = projectB.id;

  await Promise.all([
    prisma.checklistItem.create({
      data: {
        projectId: projectAId,
        label: "UNIQUE_MARKER_ALPHA_CHECKLIST_2841",
      },
    }),
    prisma.checklistItem.create({
      data: {
        projectId: projectBId,
        label: "UNIQUE_MARKER_BETA_CHECKLIST_4409",
      },
    }),
    prisma.knowledgeItem.create({
      data: {
        projectId: projectAId,
        type: "NOTE",
        title: "A note",
        content: "UNIQUE_MARKER_ALPHA_9214",
      },
    }),
    prisma.touchpointNote.create({
      data: {
        projectId: projectAId,
        type: "CLARIFICATION_REPLY",
        content: "UNIQUE_MARKER_ALPHA_TOUCHPOINT_7731",
      },
    }),
    prisma.document.create({
      data: {
        projectId: projectAId,
        type: "POSITION_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 1,
            content: { marker: "UNIQUE_MARKER_ALPHA_DOCUMENT_5502" },
          },
        },
      },
    }),
    prisma.knowledgeItem.create({
      data: {
        projectId: projectBId,
        type: "NOTE",
        title: "B note",
        content: "UNIQUE_MARKER_BETA_3387",
      },
    }),
    prisma.touchpointNote.create({
      data: {
        projectId: projectBId,
        type: "SPECIALIST_REVIEW",
        content: "UNIQUE_MARKER_BETA_TOUCHPOINT_1198",
      },
    }),
    prisma.document.create({
      data: {
        projectId: projectBId,
        type: "DRAFT_SCOPE_DOCUMENT",
        versions: {
          create: {
            versionNumber: 1,
            stageNumber: 4,
            content: { marker: "UNIQUE_MARKER_BETA_DOCUMENT_6640" },
          },
        },
      },
    }),
  ]);
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("assembleProjectContext cross-project isolation", () => {
  it("includes only Project A's own data when assembling Project A's context", async () => {
    const context = await assembleProjectContext(projectAId);

    expect(context).toContain("UNIQUE_MARKER_ALPHA_9214");
    expect(context).toContain("UNIQUE_MARKER_ALPHA_TOUCHPOINT_7731");
    expect(context).toContain("UNIQUE_MARKER_ALPHA_DOCUMENT_5502");
    expect(context).toContain("UNIQUE_MARKER_ALPHA_CHECKLIST_2841");

    expect(context).not.toContain("UNIQUE_MARKER_BETA_3387");
    expect(context).not.toContain("UNIQUE_MARKER_BETA_TOUCHPOINT_1198");
    expect(context).not.toContain("UNIQUE_MARKER_BETA_DOCUMENT_6640");
    expect(context).not.toContain("UNIQUE_MARKER_BETA_CHECKLIST_4409");
  });

  it("includes only Project B's own data when assembling Project B's context", async () => {
    const context = await assembleProjectContext(projectBId);

    expect(context).toContain("UNIQUE_MARKER_BETA_3387");
    expect(context).toContain("UNIQUE_MARKER_BETA_TOUCHPOINT_1198");
    expect(context).toContain("UNIQUE_MARKER_BETA_DOCUMENT_6640");
    expect(context).toContain("UNIQUE_MARKER_BETA_CHECKLIST_4409");

    expect(context).not.toContain("UNIQUE_MARKER_ALPHA_9214");
    expect(context).not.toContain("UNIQUE_MARKER_ALPHA_TOUCHPOINT_7731");
    expect(context).not.toContain("UNIQUE_MARKER_ALPHA_DOCUMENT_5502");
    expect(context).not.toContain("UNIQUE_MARKER_ALPHA_CHECKLIST_2841");
  });
});
