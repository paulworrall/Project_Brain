// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deriveStepStatuses } from "@/lib/projectSteps";

let segment: string | null = "brief";
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: () => segment,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { ProjectShell } = await import("@/components/features/ProjectShell");

const statuses = deriveStepStatuses({
  scopeConfirmedAt: null,
  hasApprovedEstimate: false,
  hasEstimateWork: true,
  hasApprovedSow: false,
  hasSowVersion: false,
});

function step(id: string, heading: string) {
  return (
    <section>
      <h2 id={`step-heading-${id}`} tabIndex={-1}>
        {heading}
      </h2>
      <textarea aria-label={`${heading} draft`} />
    </section>
  );
}

function shell() {
  return (
    <ProjectShell
      projectId="p1"
      stepStatuses={statuses}
      stepSummaries={{}}
      steps={{
        brief: step("brief", "Brief"),
        estimate: step("estimate", "Estimate"),
        sow: step("sow", "Statement of Work"),
      }}
      sidebar={<textarea aria-label="Assistant message" />}
    >
      {null}
    </ProjectShell>
  );
}

describe("ProjectShell", () => {
  it("renders the stepper where the tab bar was, with the active step marked", () => {
    segment = "estimate";
    render(shell());
    const nav = screen.getByRole("navigation", { name: "Project steps" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Estimate, in progress/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("shows one step at a time and keeps the others mounted (drafts survive a switch)", async () => {
    const user = userEvent.setup();
    segment = "brief";
    const { rerender } = render(shell());
    await user.type(screen.getByLabelText("Brief draft"), "unsaved note");
    await user.type(screen.getByLabelText("Assistant message"), "draft question");

    segment = "estimate";
    rerender(shell());
    const briefDraft = screen.getByLabelText("Brief draft");
    expect(briefDraft).toHaveValue("unsaved note");
    expect(briefDraft.closest("[hidden]")).not.toBeNull();
    expect(screen.getByLabelText("Estimate draft").closest("[hidden]")).toBeNull();
    expect(screen.getByLabelText("Assistant message")).toHaveValue("draft question");

    segment = "brief";
    rerender(shell());
    expect(screen.getByLabelText("Brief draft")).toHaveValue("unsaved note");
  });

  it("moves focus to the step heading and announces the switch", () => {
    segment = "brief";
    const { rerender } = render(shell());
    segment = "sow";
    rerender(shell());
    expect(screen.getByRole("heading", { name: "Statement of Work" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing Statement of Work step, not started"
    );
  });

  it("Project assistant opens the same sidebar in a drawer, and Close dismisses it", async () => {
    const user = userEvent.setup();
    segment = "brief";
    render(shell());
    await user.type(screen.getByLabelText("Assistant message"), "kept");
    await user.click(screen.getByRole("button", { name: "Project assistant" }));
    const dialog = screen.getByRole("dialog", { name: "Project assistant" });
    expect(dialog).toContainElement(screen.getByLabelText("Assistant message"));
    expect(screen.getByLabelText("Assistant message")).toHaveValue("kept");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Next step banner (FB-009 C)", () => {
  const action = (id: "confirm_scope" | "choose_capabilities", title: string) => ({
    id,
    title,
    reason: "Because.",
    step: "brief" as const,
    button: { label: "Do it", href: "/projects/p1/brief#scope-gate" },
  });

  function withAction(nextAction: ReturnType<typeof action>) {
    return (
      <ProjectShell
        projectId="p1"
        stepStatuses={statuses}
        stepSummaries={{}}
        nextAction={nextAction}
        steps={{ brief: <p>b</p>, estimate: <p>e</p>, sow: <p>s</p> }}
        sidebar={null}
      >
        {null}
      </ProjectShell>
    );
  }

  it("sits under the stepper with one title, reason and primary link", () => {
    segment = "brief";
    render(withAction(action("confirm_scope", "Confirm the scope is ready to estimate")));
    const banner = screen.getByRole("region", { name: "Confirm the scope is ready to estimate" });
    expect(banner).toHaveTextContent("Because.");
    expect(screen.getByRole("link", { name: "Do it" })).toHaveAttribute(
      "href",
      "/projects/p1/brief#scope-gate"
    );
    const nav = screen.getByRole("navigation", { name: "Project steps" });
    expect(nav.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("announces a new next action after an action (no reload)", () => {
    segment = "brief";
    const { rerender } = render(
      withAction(action("confirm_scope", "Confirm the scope is ready to estimate"))
    );
    expect(screen.getByRole("status")).toHaveTextContent("");
    rerender(withAction(action("choose_capabilities", "Choose who should estimate this")));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Next step: Choose who should estimate this"
    );
  });
});
