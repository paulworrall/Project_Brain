import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NextRequest } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration test for the SOW version download route — same
// throwaway-Hub convention as estimate-download.test.ts. Only auth is
// mocked (this route checks a session from the start).

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const { GET } = await import("@/app/api/projects/[projectId]/sow/[versionId]/route");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_SowDownloadSpec";

let hubId: string;
let projectId: string;
let otherProjectId: string;
let versionId: string;

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "SowDownloadSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "SowDownloadSpecWorkstream", clientId: client.id },
  });
  const project = await prisma.project.create({
    data: { name: "SOW Download Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;
  const otherProject = await prisma.project.create({
    data: { name: "Other Project", workstreamId: workstream.id },
  });
  otherProjectId = otherProject.id;

  const sow = await prisma.sOW.create({ data: { projectId } });
  const version = await prisma.sOWVersion.create({
    data: {
      sowId: sow.id,
      versionNumber: 1,
      fileName: "SOW - Download Spec Project - v1.docx",
      fileBytes: Buffer.from("PK fake docx bytes for the download test"),
      content: {},
    },
  });
  versionId = version.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [projectId, otherProjectId] } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

function fakeRequest(): NextRequest {
  return {} as NextRequest;
}

describe("GET /api/projects/[projectId]/sow/[versionId]", () => {
  it("streams the saved .docx bytes with the correct filename and content type", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user_1" } });

    const response = await GET(fakeRequest(), { params: Promise.resolve({ projectId, versionId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="SOW - Download Spec Project - v1.docx"'
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 2).toString("utf-8")).toBe("PK");
  });

  it("401s when there is no session", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await GET(fakeRequest(), { params: Promise.resolve({ projectId, versionId }) });

    expect(response.status).toBe(401);
  });

  it("404s when the version doesn't belong to the given project", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user_1" } });

    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId: otherProjectId, versionId }),
    });

    expect(response.status).toBe(404);
  });

  it("404s for a version id that doesn't exist at all", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user_1" } });

    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, versionId: "not_a_real_id" }),
    });

    expect(response.status).toBe(404);
  });
});
