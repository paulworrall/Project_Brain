import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Serves a generated EstimateVersion's .docx bytes — mirrors the
 * estimate-brief download route exactly, one level deeper since a project
 * can have several Estimate tracks (each with its own version history), not
 * just one. Session-gated — src/proxy.ts's matcher excludes /api/* from the
 * app-wide auth redirect, so every download route must check this itself.
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

  return new NextResponse(new Uint8Array(version.fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${version.fileName}"`,
    },
  });
}
