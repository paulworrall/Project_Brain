import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRateCardTemplate } from "@/services/documents/rate-card-template-xlsx";

// src/proxy.ts's matcher excludes /api/*, so the session check lives here.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const fileBytes = await buildRateCardTemplate();
  return new NextResponse(new Uint8Array(fileBytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Rate_Card_Template.xlsx"',
    },
  });
}
