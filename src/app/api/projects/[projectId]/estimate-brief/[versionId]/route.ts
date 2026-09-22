import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Serves a generated EstimateBriefVersion's .docx bytes. No existing
 * commercial-document version (MSA/Rate Card/SOW Template) has a download
 * route at all today despite storing fileBytes — this is the first one, so
 * there's no precedent to mirror beyond the storage shape itself.
 * Session-gated — src/proxy.ts's matcher excludes /api/* from the app-wide
 * auth redirect, so every download route must check this itself.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const { projectId, versionId } = await params;

  const version = await prisma.estimateBriefVersion.findFirst({
    where: { id: versionId, estimateBrief: { projectId } },
  });

  if (!version) {
    return NextResponse.json({ message: "Estimate brief version not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(version.fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${version.fileName}"`,
    },
  });
}
