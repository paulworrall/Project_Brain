import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import type { NextRequest } from "next/server";
import { PrismaClient } from "@/generated/prisma/client";

// Real-DB integration test for the estimate version xlsx download route —
// same throwaway-Hub convention as estimate-download.test.ts. Only auth is
// mocked (this route, unlike the .docx one, checks a session).

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

const { GET } = await import(
  "@/app/api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]/xlsx/route"
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_HUB_NAME = "TestHub_EstimateXlsxDownloadSpec";

let hubId: string;
let projectId: string;
let estimateId: string;
let versionId: string;

const documentContent = {
  overview: {
    clientName: "Coffee",
    projectName: "Loyalty App Relaunch",
    projectCode: null,
    generatedDate: "22 Sept 2026",
    rateCardName: "Download Spec Rates",
    rateCardVersionNumber: 1,
  },
  capabilitySections: [
    {
      capability: "TECH_AND_DATA" as const,
      lineItems: [
        {
          role: "Developer",
          level: "Senior",
          rateType: "DAILY" as const,
          rate: 700,
          quantity: 3,
          unit: "days",
          feeSubtotal: 2100,
          roleResolutionId: "role_1",
          rateCardLineItemId: "line_1",
        },
      ],
      subtotal: 2100,
    },
  ],
  currency: "GBP",
  totalValue: 2100,
};

beforeAll(async () => {
  const hub = await prisma.hub.create({ data: { name: TEST_HUB_NAME } });
  hubId = hub.id;
  const client = await prisma.client.create({ data: { name: "EstimateXlsxDownloadSpecClient", hubId } });
  const workstream = await prisma.workstream.create({
    data: { name: "EstimateXlsxDownloadSpecWorkstream", clientId: client.id },
  });
  const project = await prisma.project.create({
    data: { name: "Estimate Xlsx Download Spec Project", workstreamId: workstream.id },
  });
  projectId = project.id;

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
    data: { projectId, label: "Xlsx Download Spec Estimate", rateCardVersionId: rateCardVersion.id },
  });
  estimateId = estimate.id;

  const version = await prisma.estimateVersion.create({
    data: {
      estimateId,
      versionNumber: 1,
      rateCardVersionId: rateCardVersion.id,
      capabilitiesIncluded: ["TECH_AND_DATA"],
      totalValue: 2100,
      currency: "GBP",
      description: "1 capability: TAD",
      fileName: "Estimate - Xlsx Download Spec Estimate.docx",
      fileBytes: Buffer.from("PK fake docx bytes"),
      content: documentContent,
    },
  });
  versionId = version.id;
});

afterAll(async () => {
  await prisma.estimate.deleteMany({ where: { projectId } });
  await prisma.hub.delete({ where: { id: hubId } });
  await prisma.$disconnect();
});

function fakeRequest(): NextRequest {
  return {} as NextRequest;
}

describe("GET /api/projects/[projectId]/estimates/[estimateId]/versions/[versionId]/xlsx", () => {
  it("renders and streams a real .xlsx from the version's stored content, with the correct filename and content type", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user_1" } });

    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, estimateId, versionId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Estimate - Xlsx Download Spec Estimate.xlsx"'
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 2).toString("utf-8")).toBe("PK");
  });

  it("401s when there is no session", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await GET(fakeRequest(), {
      params: Promise.resolve({ projectId, estimateId, versionId }),
    });

    expect(response.status).toBe(401);
  });

  it("404s when the version doesn't belong to the given estimate", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "user_1" } });
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
});
