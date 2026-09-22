import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { EstimateDocumentContentSchema } from "@/types/estimates";
import { renderEstimateDocumentXlsx } from "@/services/documents/estimate-document-xlsx";

/**
 * Renders an EstimateVersion's .xlsx on demand from its already-stored
 * `content: Json` — unlike the .docx route, there's no second stored
 * fileBytes column for this format, so it's regenerated per request rather
 * than doubling storage/rendering work at save time. Mirrors the .docx
 * route's scoping query, but adds a session check: auditing this area
 * found the existing .docx and estimate-brief download routes have none
 * (src/proxy.ts's matcher excludes /api/* from the session gate) — a
 * pre-existing gap outside this route's scope, flagged separately rather
 * than copied into new code.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; estimateId: string; versionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const { projectId, estimateId, versionId } = await params;

  const version = await prisma.estimateVersion.findFirst({
    where: { id: versionId, estimateId, estimate: { projectId } },
  });

  if (!version) {
    return NextResponse.json({ message: "Estimate version not found." }, { status: 404 });
  }

  const parsedContent = EstimateDocumentContentSchema.safeParse(version.content);
  if (!parsedContent.success) {
    return NextResponse.json({ message: "This version's content couldn't be read." }, { status: 500 });
  }

  const fileBytes = await renderEstimateDocumentXlsx(parsedContent.data);
  const fileName = version.fileName.replace(/\.docx$/i, ".xlsx");

  return new NextResponse(new Uint8Array(fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
