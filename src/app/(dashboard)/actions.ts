"use server";

import { prisma } from "@/lib/prisma";

export interface ProjectSearchResult {
  id: string;
  name: string;
  clientName: string;
  workstreamName: string;
}

/** Global "jump to project" search — lets a PM skip the Hub/Client/Workstream hierarchy entirely. */
export async function searchProjectsAction(query: string): Promise<ProjectSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const projects = await prisma.project.findMany({
    where: { name: { contains: trimmed, mode: "insensitive" } },
    take: 8,
    orderBy: { name: "asc" },
    include: { workstream: { include: { client: true } } },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    clientName: project.workstream.client.name,
    workstreamName: project.workstream.name,
  }));
}
