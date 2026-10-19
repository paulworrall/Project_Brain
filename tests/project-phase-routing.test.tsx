// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { deriveProjectPhaseStatuses } from "@/lib/projectPhases";

class Redirected extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  notFound: () => {
    throw new NotFound();
  },
}));

const loadProjectPageData = vi.fn();
vi.mock("@/lib/projectPageData", () => ({ loadProjectPageData: (id: string) => loadProjectPageData(id) }));

const { default: IndexPage } = await import("@/app/(dashboard)/projects/[projectId]/(shell)/page");
const { default: PhasePage } = await import("@/app/(dashboard)/projects/[projectId]/(shell)/[phase]/page");

describe("/projects/[id]", () => {
  beforeEach(() => loadProjectPageData.mockReset());

  it("redirects to the current phase (Discover while its SOW isn't approved)", async () => {
    loadProjectPageData.mockResolvedValue({ phaseStatuses: deriveProjectPhaseStatuses({ hasClientApprovedSow: false }) });
    await expect(IndexPage({ params: Promise.resolve({ projectId: "p1" }) })).rejects.toMatchObject({
      to: "/projects/p1/discover",
    });
  });

  it("redirects to Define once Discover is complete", async () => {
    loadProjectPageData.mockResolvedValue({ phaseStatuses: deriveProjectPhaseStatuses({ hasClientApprovedSow: true }) });
    await expect(IndexPage({ params: Promise.resolve({ projectId: "p1" }) })).rejects.toMatchObject({
      to: "/projects/p1/define",
    });
  });

  it("404s for an unknown project", async () => {
    loadProjectPageData.mockResolvedValue(null);
    await expect(IndexPage({ params: Promise.resolve({ projectId: "nope" }) })).rejects.toBeInstanceOf(NotFound);
  });
});

describe("/projects/[id]/[phase]", () => {
  it("Discover renders nothing itself (the layout keeps its content mounted)", async () => {
    expect(await PhasePage({ params: Promise.resolve({ phase: "discover" }) })).toBeNull();
  });

  it.each(["define", "develop", "deliver", "dialogue"])("%s renders its coming-soon panel", async (slug) => {
    render(await PhasePage({ params: Promise.resolve({ phase: slug }) }));
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument();
  });

  it("404s for an unknown slug", async () => {
    await expect(PhasePage({ params: Promise.resolve({ phase: "bogus" }) })).rejects.toBeInstanceOf(NotFound);
  });
});

describe("revalidation", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith(".ts") ? [full] : [];
    });
  }

  it("every revalidatePath on the project route refreshes the layout (header, sidebar, Discover)", () => {
    const root = path.resolve(import.meta.dirname, "../src/app/(dashboard)/projects/[projectId]");
    const offenders: string[] = [];
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/revalidatePath\(\s*`\/projects\/\$\{[^}]+\}`(\s*,\s*"layout")?\s*\)/g)) {
        if (!match[1]) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
