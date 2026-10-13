import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Downloads the original uploaded workbook for one rate card version. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const { versionId } = await params;
  const version = await prisma.rateCardVersion.findUnique({
    where: { id: versionId },
    select: { fileName: true, fileBytes: true },
  });
  if (!version) {
    return NextResponse.json({ message: "Rate card version not found." }, { status: 404 });
  }

  const safeName = version.fileName.replace(/[^\w.\- ()]/g, "_");
  return new NextResponse(new Uint8Array(version.fileBytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
  });
}
