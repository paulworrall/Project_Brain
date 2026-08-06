import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Exercises real constraints/relations against the dev database (unique
// constraints, FK enforcement, and cascade deletes are enforced by
// Postgres, not the ORM, so these need a live connection rather than a
// pure mock). Everything is created under one throwaway Hub and removed
// via cascade delete in afterAll, so it never touches seeded data.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SchemaSpec";

let hubId: string;

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
});

afterAll(async () => {
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

describe("taxonomy uniqueness constraints", () => {
  it("rejects two Clients with the same name under the same Hub", async () => {
    await prisma.client.create({ data: { name: "DupClient", hubId } });

    await expect(
      prisma.client.create({ data: { name: "DupClient", hubId } })
    ).rejects.toThrow();
  });

  it("allows the same Client name under a different Hub", async () => {
    const otherHub = await prisma.hub.create({
      data: { name: `${TEST_HUB_NAME}_other` },
    });

    await expect(
      prisma.client.create({ data: { name: "DupClient", hubId: otherHub.id } })
    ).resolves.toBeTruthy();

    await prisma.hub.delete({ where: { id: otherHub.id } });
  });
});

describe("cascade deletes", () => {
  it("deleting a Hub cascades through Client -> Workstream -> Project", async () => {
    const client = await prisma.client.create({
      data: { name: "CascadeClient", hubId },
    });
    const workstream = await prisma.workstream.create({
      data: { name: "CascadeWorkstream", clientId: client.id },
    });
    const project = await prisma.project.create({
      data: { name: "CascadeProject", workstreamId: workstream.id },
    });

    await prisma.client.delete({ where: { id: client.id } });

    expect(
      await prisma.workstream.findUnique({ where: { id: workstream.id } })
    ).toBeNull();
    expect(
      await prisma.project.findUnique({ where: { id: project.id } })
    ).toBeNull();
  });

  it("deleting a Project cascades to its Documents and DocumentVersions", async () => {
    const client = await prisma.client.create({
      data: { name: "DocCascadeClient", hubId },
    });
    const workstream = await prisma.workstream.create({
      data: { name: "DocCascadeWorkstream", clientId: client.id },
    });
    const project = await prisma.project.create({
      data: { name: "DocCascadeProject", workstreamId: workstream.id },
    });
    const document = await prisma.document.create({
      data: { projectId: project.id, type: "POSITION_DOCUMENT" },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        content: { whatWeKnow: [], whatWeNeedToFindOut: [], clientFlaggedOpenItems: [] },
        stageNumber: 1,
      },
    });

    await prisma.project.delete({ where: { id: project.id } });

    expect(await prisma.document.findUnique({ where: { id: document.id } })).toBeNull();
    expect(
      await prisma.documentVersion.findUnique({ where: { id: version.id } })
    ).toBeNull();
  });
});

describe("foreign key enforcement", () => {
  it("rejects a Project referencing a non-existent Workstream", async () => {
    await expect(
      prisma.project.create({
        data: { name: "OrphanProject", workstreamId: "nonexistent-id" },
      })
    ).rejects.toThrow();
  });
});

describe("per-document-type and per-version uniqueness", () => {
  it("rejects two Documents of the same type on one Project", async () => {
    const client = await prisma.client.create({
      data: { name: "DocTypeClient", hubId },
    });
    const workstream = await prisma.workstream.create({
      data: { name: "DocTypeWorkstream", clientId: client.id },
    });
    const project = await prisma.project.create({
      data: { name: "DocTypeProject", workstreamId: workstream.id },
    });

    await prisma.document.create({
      data: { projectId: project.id, type: "CLARIFICATION_EMAIL" },
    });

    await expect(
      prisma.document.create({
        data: { projectId: project.id, type: "CLARIFICATION_EMAIL" },
      })
    ).rejects.toThrow();
  });

  it("rejects two DocumentVersions with the same version number on one Document", async () => {
    const client = await prisma.client.create({
      data: { name: "VersionClient", hubId },
    });
    const workstream = await prisma.workstream.create({
      data: { name: "VersionWorkstream", clientId: client.id },
    });
    const project = await prisma.project.create({
      data: { name: "VersionProject", workstreamId: workstream.id },
    });
    const document = await prisma.document.create({
      data: { projectId: project.id, type: "DRAFT_SCOPE_DOCUMENT" },
    });

    await prisma.documentVersion.create({
      data: { documentId: document.id, versionNumber: 1, content: {}, stageNumber: 4 },
    });

    await expect(
      prisma.documentVersion.create({
        data: { documentId: document.id, versionNumber: 1, content: {}, stageNumber: 4 },
      })
    ).rejects.toThrow();
  });
});

describe("ProjectStageStatus uniqueness", () => {
  it("rejects a duplicate stage status for the same Project + Stage pair", async () => {
    const client = await prisma.client.create({
      data: { name: "StageStatusClient", hubId },
    });
    const workstream = await prisma.workstream.create({
      data: { name: "StageStatusWorkstream", clientId: client.id },
    });
    const project = await prisma.project.create({
      data: { name: "StageStatusProject", workstreamId: workstream.id },
    });
    const stage = await prisma.stage.findUniqueOrThrow({ where: { number: 1 } });

    await prisma.projectStageStatus.create({
      data: { projectId: project.id, stageId: stage.id },
    });

    await expect(
      prisma.projectStageStatus.create({
        data: { projectId: project.id, stageId: stage.id },
      })
    ).rejects.toThrow();
  });
});

describe("User email uniqueness", () => {
  it("rejects two Users with the same email", async () => {
    await prisma.user.create({
      data: {
        name: "Test User One",
        email: "schema-spec-user@projectbrain.test",
        passwordHash: "hash",
        role: "DELIVERY",
      },
    });

    await expect(
      prisma.user.create({
        data: {
          name: "Test User Two",
          email: "schema-spec-user@projectbrain.test",
          passwordHash: "hash",
          role: "CLIENT_ENGAGEMENT",
        },
      })
    ).rejects.toThrow();

    await prisma.user.delete({
      where: { email: "schema-spec-user@projectbrain.test" },
    });
  });
});
