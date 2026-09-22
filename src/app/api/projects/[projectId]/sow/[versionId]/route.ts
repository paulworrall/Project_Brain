import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * Serves a generated SOWVersion's .docx bytes — mirrors the estimate
 * version/estimate-brief download routes exactly. Session-gated from the
 * start (src/proxy.ts's matcher excludes /api/* from the app-wide auth
 * redirect, so every download route must check this itself).
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

  const version = await prisma.sOWVersion.findFirst({
    where: { id: versionId, sow: { projectId } },
  });

  if (!version) {
    return NextResponse.json({ message: "SOW version not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(version.fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${version.fileName}"`,
    },
  });
}
