// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
vi.mock("@/lib/projectPageData", () => ({
  loadProjectPageData: (id: string) => loadProjectPageData(id),
}));

const { default: IndexPage } = await import("@/app/(dashboard)/projects/[projectId]/(shell)/page");
const { default: StepPage } =
  await import("@/app/(dashboard)/projects/[projectId]/(shell)/[phase]/page");

const params = (phase: string) => ({ params: Promise.resolve({ projectId: "p1", phase }) });

describe("/projects/[id]", () => {
  beforeEach(() => loadProjectPageData.mockReset());

  it.each(["brief", "estimate", "sow"])("redirects to the current step (%s)", async (current) => {
    loadProjectPageData.mockResolvedValue({ currentStepId: current });
    await expect(IndexPage({ params: Promise.resolve({ projectId: "p1" }) })).rejects.toMatchObject(
      {
        to: `/projects/p1/${current}`,
      }
    );
  });

  it("404s for an unknown project", async () => {
    loadProjectPageData.mockResolvedValue(null);
    await expect(
      IndexPage({ params: Promise.resolve({ projectId: "nope" }) })
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe("/projects/[id]/[step]", () => {
  beforeEach(() => loadProjectPageData.mockReset());

  it.each(["brief", "estimate", "sow"])(
    "%s renders nothing itself (the layout keeps every step mounted)",
    async (slug) => {
      expect(await StepPage(params(slug))).toBeNull();
    }
  );

  it.each(["discover", "define", "develop", "deliver", "dialogue"])(
    "the old %s phase URL redirects to the current step",
    async (slug) => {
      loadProjectPageData.mockResolvedValue({ currentStepId: "estimate" });
      await expect(StepPage(params(slug))).rejects.toMatchObject({ to: "/projects/p1/estimate" });
    }
  );

  it("404s for an unknown slug", async () => {
    await expect(StepPage(params("bogus"))).rejects.toBeInstanceOf(NotFound);
  });
});

function sourceFiles(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full, ext) : ext.test(full) ? [full] : [];
  });
}

describe("revalidation", () => {
  it("every revalidatePath on the project route refreshes the layout (header, stepper, sidebar, steps)", () => {
    const root = path.resolve(import.meta.dirname, "../src/app/(dashboard)/projects/[projectId]");
    const offenders: string[] = [];
    for (const file of sourceFiles(root, /\.ts$/)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(
        /revalidatePath\(\s*`\/projects\/\$\{[^}]+\}`(\s*,\s*"layout")?\s*\)/g
      )) {
        if (!match[1]) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("removed panels", () => {
  it("nothing links to a 5D phase URL or imports a removed component", () => {
    const src = path.resolve(import.meta.dirname, "../src");
    const offenders: string[] = [];
    const removed =
      /\/(discover|define|develop|deliver|dialogue)[#"`]|PhaseTabs|PhaseComingSoon|StageTracker|ApprovedDocumentsPanel|ChatPanel|KnowledgeUpload|SpecialistFeedbackForm|projectPhases/;
    for (const file of sourceFiles(src, /\.tsx?$/)) {
      if (file.includes(`${path.sep}generated${path.sep}`)) continue;
      const text = readFileSync(file, "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      if (removed.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
