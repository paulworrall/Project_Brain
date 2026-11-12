import { afterAll, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * FB-010 replaced uploadKnowledgeItemAction with addProjectInformationAction
 * (which needs a signed-in user and returns an ActionResult). Tests that
 * drive the update flow keep their old call shape through this helper:
 * it sends the same fields (content / file / source) as "Other" information,
 * and, when the test file mocks auth as nobody, signs in a temporary Delivery
 * user for that one call (deleted after the file's tests).
 */

let prisma: PrismaClient | null = null;
let helperUserId: string | null = null;

async function helperUser(): Promise<string> {
  prisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  helperUserId ??= (
    await prisma.user.create({
      data: {
        name: "Update test helper",
        email: `update-helper-${Date.now()}-${Math.random().toString(36).slice(2)}@projectbrain.test`,
        passwordHash: "x",
        role: "DELIVERY",
      },
    })
  ).id;
  return helperUserId;
}

afterAll(async () => {
  if (prisma && helperUserId)
    await prisma.user.delete({ where: { id: helperUserId } }).catch(() => {});
  await prisma?.$disconnect();
});

export async function uploadKnowledgeItemAction(
  projectId: string,
  _prevState: unknown,
  formData: FormData
): Promise<{ message?: string; notice?: string }> {
  const { auth } = await import("@/lib/auth");
  const { addProjectInformationAction } =
    await import("@/app/(dashboard)/projects/[projectId]/actions");
  if (vi.isMockFunction(auth)) {
    const current =
      (await (auth as unknown as () => Promise<{ user?: { id?: string } } | null>)()) ?? null;
    if (!current?.user?.id) {
      const id = await helperUser();
      (auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
        user: { id, role: "DELIVERY" },
      });
    } else {
      (auth as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
        current
      );
    }
  }
  const sent = new FormData();
  sent.set("category", "OTHER");
  for (const key of ["content", "source", "file"]) {
    const value = formData.get(key);
    if (value !== null) sent.set(key, value);
  }
  const result = await addProjectInformationAction(projectId, sent);
  return result.ok ? { notice: result.data.notice } : { message: result.message };
}
