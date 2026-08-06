import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const STAGES = [
  { number: 1, name: "Intake" },
  { number: 2, name: "Clarification Email Sent" },
  { number: 3, name: "Get Clarifications" },
  { number: 4, name: "Triage" },
  { number: 5, name: "Review with Specialist Leads" },
  { number: 6, name: "Estimation Kick Off" },
  { number: 7, name: "Estimation Session" },
  { number: 8, name: "Commercials & SOW" },
  { number: 9, name: "Planning & Capability Briefing" },
  { number: 10, name: "Commercial Status Monitoring" },
] as const;

const CLIENT_WORKSTREAMS = {
  Fizzy: "Fizzy Refresh 2026",
  Coffee: "Coffee Loyalty App",
  Tooth: "Tooth Rebrand",
} as const;

async function main() {
  for (const [index, stage] of STAGES.entries()) {
    await prisma.stage.upsert({
      where: { number: stage.number },
      update: { name: stage.name },
      create: {
        number: stage.number,
        name: stage.name,
        type: index === STAGES.length - 1 ? "RECURRING" : "LINEAR",
      },
    });
  }

  const hub = await prisma.hub.upsert({
    where: { name: "Caroline" },
    update: {},
    create: { name: "Caroline" },
  });

  const clients = await Promise.all(
    Object.keys(CLIENT_WORKSTREAMS).map((name) =>
      prisma.client.upsert({
        where: { hubId_name: { hubId: hub.id, name } },
        update: {},
        create: { name, hubId: hub.id },
      })
    )
  );

  const workstreams = await Promise.all(
    clients.map((client) => {
      const workstreamName =
        CLIENT_WORKSTREAMS[client.name as keyof typeof CLIENT_WORKSTREAMS];
      return prisma.workstream.upsert({
        where: { clientId_name: { clientId: client.id, name: workstreamName } },
        update: {},
        create: { name: workstreamName, clientId: client.id },
      });
    })
  );

  const fizzyWorkstream = workstreams.find(
    (w) => w.name === CLIENT_WORKSTREAMS.Fizzy
  )!;

  const demoProject = await prisma.project.upsert({
    where: {
      workstreamId_name: {
        workstreamId: fizzyWorkstream.id,
        name: "Fizzy Summer Launch",
      },
    },
    update: {},
    create: {
      name: "Fizzy Summer Launch",
      workstreamId: fizzyWorkstream.id,
      briefRawText:
        "Fizzy wants a summer campaign refresh across paid social and in-store point-of-sale, launching by end of Q3. Budget and final creative direction are still TBC with the client.",
      briefFileName: "fizzy-summer-brief.txt",
      briefFileType: "text/plain",
      currentStageNumber: 1,
    },
  });

  const intakeStage = await prisma.stage.findUniqueOrThrow({
    where: { number: 1 },
  });

  await prisma.projectStageStatus.upsert({
    where: {
      projectId_stageId: { projectId: demoProject.id, stageId: intakeStage.id },
    },
    update: {},
    create: {
      projectId: demoProject.id,
      stageId: intakeStage.id,
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "am@projectbrain.test" },
    update: {},
    create: {
      name: "Alex Morgan",
      email: "am@projectbrain.test",
      passwordHash,
      role: "CLIENT_ENGAGEMENT",
    },
  });

  await prisma.user.upsert({
    where: { email: "pm@projectbrain.test" },
    update: {},
    create: {
      name: "Priya Mehta",
      email: "pm@projectbrain.test",
      passwordHash,
      role: "DELIVERY",
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
