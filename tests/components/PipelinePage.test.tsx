// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const loadPipeline = vi.fn();
vi.mock("@/lib/pipeline", () => ({ loadPipeline: (...args: unknown[]) => loadPipeline(...args) }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u_me", role: "DELIVERY" } })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { client: { findMany: vi.fn(async () => [{ id: "c1", name: "Coffee" }]) } },
}));

const { default: PipelinePage } = await import("@/app/(dashboard)/page");

const card = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Project ${id}`,
  clientName: "Coffee",
  pmName: "Pat",
  nextAction: "Build the estimate",
  estimateTotal: null,
  daysInStep: 2,
  needsReview: false,
  ...extra,
});

async function renderPage(params: Record<string, string> = {}) {
  render(await PipelinePage({ searchParams: Promise.resolve(params) }));
}

describe("Pipeline home page", () => {
  it("shows a column per step with counts, and each card's details", async () => {
    loadPipeline.mockResolvedValueOnce({
      columns: {
        brief: [card("a")],
        estimate: [
          card("b", { needsReview: true, estimateTotal: { amount: 45675, currency: "USD" } }),
          card("c"),
        ],
        sow: [],
        complete: [],
      },
    });
    await renderPage();
    const estimate = screen.getByRole("region", { name: /Estimate/ });
    expect(within(estimate).getByRole("heading")).toHaveTextContent("Estimate2 projects");
    expect(within(estimate).getByText("Needs review")).toBeInTheDocument();
    expect(within(estimate).getByText("45,675.00 USD")).toBeInTheDocument();
    expect(within(estimate).getAllByText("Build the estimate")).toHaveLength(2);
    expect(screen.getByRole("region", { name: /SOW/ })).toHaveTextContent("None");
    expect(screen.getByRole("link", { name: "Project a" })).toHaveAttribute("href", "/projects/a");
  });

  it("defaults to My projects, and All / client filters reach the loader", async () => {
    loadPipeline.mockResolvedValue({ columns: { brief: [], estimate: [], sow: [], complete: [] } });
    await renderPage();
    expect(loadPipeline).toHaveBeenLastCalledWith({ projectManagerId: "u_me", clientId: null });
    expect(screen.getByRole("link", { name: "My projects" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByText(/aren't PM on any projects yet/)).toBeInTheDocument();

    await renderPage({ view: "all", client: "c1" });
    expect(loadPipeline).toHaveBeenLastCalledWith({ projectManagerId: null, clientId: "c1" });
  });
});
