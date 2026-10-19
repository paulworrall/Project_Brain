// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { deriveProjectPhaseStatuses } from "@/lib/projectPhases";

let segment: string | null = "discover";
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: () => segment,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { ProjectShell } = await import("@/components/features/ProjectShell");

const statuses = deriveProjectPhaseStatuses({ hasClientApprovedSow: false });

function Sidebar() {
  return <textarea aria-label="Ask me anything" />;
}
function DiscoverCard() {
  return <textarea aria-label="Client update draft" />;
}

function shell(children: ReactNode = null) {
  return (
    <ProjectShell projectId="p1" phaseStatuses={statuses} discover={<DiscoverCard />} sidebar={<Sidebar />}>
      {children}
    </ProjectShell>
  );
}

describe("ProjectShell", () => {
  it("keeps the sidebar and Discover mounted across a tab switch (drafts survive)", async () => {
    const user = userEvent.setup();
    segment = "discover";
    const { rerender } = render(shell());
    // The sidebar aside is display:hidden below lg until opened, so query by hidden:true.
    await user.type(screen.getByLabelText("Ask me anything"), "draft question");
    await user.type(screen.getByLabelText("Client update draft"), "unsaved note");

    segment = "define";
    rerender(shell(<p>define panel</p>));

    expect(screen.getByLabelText("Ask me anything")).toHaveValue("draft question");
    // Discover is hidden, not unmounted.
    const discoverDraft = screen.getByLabelText("Client update draft");
    expect(discoverDraft).toHaveValue("unsaved note");
    expect(discoverDraft.closest("[hidden]")).not.toBeNull();

    segment = "discover";
    rerender(shell());
    expect(screen.getByLabelText("Client update draft")).toHaveValue("unsaved note");
  });

  it("shows a non-blocking note on a phase whose predecessor isn't complete", () => {
    segment = "define";
    render(shell(<p>define panel</p>));
    expect(screen.getByText(/Discover isn.t complete yet/)).toBeInTheDocument();
  });

  it("shows no note on Discover", () => {
    segment = "discover";
    render(shell());
    expect(screen.queryByText(/isn.t complete yet/)).toBeNull();
  });

  it("moves focus to the phase heading and announces after a switch", () => {
    segment = "discover";
    const { rerender } = render(shell());
    segment = "define";
    rerender(shell(<h2 id="phase-heading" tabIndex={-1}>Define</h2>));
    expect(screen.getByRole("heading", { name: "Define" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Showing Define phase");
  });

  it("Project tools opens the same sidebar in a dialog, and Close dismisses it", async () => {
    const user = userEvent.setup();
    segment = "discover";
    render(shell());
    await user.type(screen.getByLabelText("Ask me anything"), "kept");
    await user.click(screen.getByRole("button", { name: "Project tools" }));
    const dialog = screen.getByRole("dialog", { name: "Project tools" });
    expect(dialog).toContainElement(screen.getByLabelText("Ask me anything"));
    expect(screen.getByLabelText("Ask me anything")).toHaveValue("kept");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
