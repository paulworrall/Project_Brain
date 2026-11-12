import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { NewProjectForm } from "./NewProjectForm";

export default async function NewProjectPage() {
  const [clients, pms, session] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { role: "DELIVERY" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    auth(),
  ]);
  // FB-009 E: the PM defaults to the current user when they can be one.
  const defaultPmId = session?.user?.role === "DELIVERY" ? session.user.id : "";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl leading-tight font-light text-foreground sm:text-4xl">New Project</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose the client and paste or upload the brief. The Intake Agent drafts the Scope summary
        and the clarification email, and sets up the readiness checklist.
      </p>

      <Card className="mt-6 p-6">
        <NewProjectForm clientOptions={clients} pmOptions={pms} defaultPmId={defaultPmId} />
      </Card>
    </div>
  );
}
