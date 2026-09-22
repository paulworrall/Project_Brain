import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NextRequest } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";
import { GET } from "@/app/api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]/route";

// Real-DB integration test for the estimate version download route — same
// throwaway-Hub convention as the other estimate-build tests. No Anthropic
// call happens on this path at all, so nothing needs mocking here.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_EstimateDownloadSpec";

let hubId: string;
let projectId: string;
let otherProjectId: string;
let estimateId: string;
let versionId: string;

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "EstimateDownloadSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "EstimateDownloadSpecWorkstream", clientId: client.id },
  });
  const project = await prisma.project.create({
    data: { name: "Estimate Download Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;
  const otherProject = await prisma.project.create({
    data: { name: "Other Project", workstreamId: workstream.id },
  });
  otherProjectId = otherProject.id;

  const rateCard = await prisma.rateCard.create({
    data: { clientId: client.id, name: "Download Spec Rates" },
  });
  const rateCardVersion = await prisma.rateCardVersion.create({
    data: {
      rateCardId: rateCard.id,
      versionNumber: 1,
      fileName: "rates.xlsx",
      fileBytes: Buffer.from("dummy"),
      extractedText: "irrelevant",
      effectiveFrom: new Date("2026-01-01"),
    },
  });

  const estimate = await prisma.estimate.create({
    data: { projectId, label: "Download Spec Estimate", rateCardVersionId: rateCardVersion.id },
  });
  estimateId = estimate.id;

  const version = await prisma.estimateVersion.create({
    data: {
      estimateId,
      versionNumber: 1,
      rateCardVersionId: rateCardVersion.id,
      capabilitiesIncluded: ["TECH_AND_DATA"],
      totalValue: 4100,
      currency: "GBP",
      description: "1 capability: TAD",
      fileName: "Estimate - Download Spec Estimate.docx",
      fileBytes: Buffer.from("PK fake docx bytes for the download test"),
      content: {},
    },
  });
  versionId = version.id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { projectId: { in: [projectId, otherProjectId] } } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

function fakeRequest(): NextRequest {
  return {} as NextRequest;
}

describe("GET /api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]", () => {
  it("streams the saved .docx bytes with the correct filename and content type", async () => {
    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, estimateId, versionId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Estimate - Download Spec Estimate.docx"'
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 2).toString("utf-8")).toBe("PK");
  });

  it("404s when the version doesn't belong to the given estimate", async () => {
    const otherEstimate = await prisma.estimate.create({
      data: {
        projectId,
        label: "Unrelated estimate",
        rateCardVersionId: (
          await prisma.estimate.findUniqueOrThrow({ where: { id: estimateId } })
        ).rateCardVersionId,
      },
    });

    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, estimateId: otherEstimate.id, versionId }),
    });

    expect(response.status).toBe(404);
  });

  it("404s when the estimate doesn't belong to the given project", async () => {
    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId: otherProjectId, estimateId, versionId }),
    });

    expect(response.status).toBe(404);
  });

  it("404s for a version id that doesn't exist at all", async () => {
    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, estimateId, versionId: "not_a_real_id" }),
    });

    expect(response.status).toBe(404);
  });
});
