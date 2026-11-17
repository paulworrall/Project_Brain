// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextStepBanner, bannerTone } from "@/components/features/NextStepBanner";
import type { NextAction, NextActionId } from "@/lib/nextAction";

// FB-012: one primary button; tone (neutral / amber / success) is presentation
// only — the rules and wording come from deriveNextAction.

function action(id: NextActionId, overrides: Partial<NextAction> = {}): NextAction {
  return {
    id,
    title: "Build the estimate",
    reason: "Add each team's roles and price them against the rate card.",
    step: "estimate",
    button: { label: "Build the estimate", href: "/projects/p1/estimate#estimates" },
    ...overrides,
  };
}

describe("NextStepBanner (FB-012)", () => {
  it("shows the label, the title, the reason and exactly one primary action", () => {
    render(<NextStepBanner action={action("build_estimate")} />);
    expect(screen.getByText("Next step")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build the estimate" })).toBeInTheDocument();
    expect(screen.getByText(/Add each team's roles/)).toBeInTheDocument();
    const buttons = screen.getAllByRole("link");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("href", "/projects/p1/estimate#estimates");
    expect(buttons[0].className).toContain("bg-primary");
  });

  it("title is 20px (the banner size)", () => {
    render(<NextStepBanner action={action("build_estimate")} />);
    expect(screen.getByRole("heading").className).toContain("text-banner");
  });

  it.each<[NextActionId, string]>([
    ["build_estimate", "neutral"],
    ["generate_sow", "neutral"],
    ["confirm_scope", "neutral"],
    ["wait_specialists", "amber"],
    ["review_estimate", "amber"],
    ["confirm_latest_scope", "amber"],
    ["add_msa_rate_card", "amber"],
    ["resolve_questions", "amber"],
    ["complete", "success"],
  ])("%s has the %s tone", (id, tone) => {
    expect(bannerTone(id)).toBe(tone);
    const { container } = render(<NextStepBanner action={action(id)} />);
    expect(container.querySelector("section")).toHaveAttribute("data-tone", tone);
  });

  it("the Copy questions action is a single primary button, not a link", () => {
    render(
      <NextStepBanner
        action={action("resolve_questions", {
          title: "Resolve open questions with the client",
          button: { label: "Copy questions", href: "/p", action: "copy_questions" },
        })}
        openQuestionsText={"1. A?\n2. B?"}
      />
    );
    expect(screen.queryByRole("link")).toBeNull();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Copy questions");
    expect(buttons[0].className).toContain("bg-primary");
  });

  it("the complete state is marked Done", () => {
    render(
      <NextStepBanner
        action={action("complete", {
          title: "Project complete: SOW approved",
          button: { label: "Download the approved SOW", href: "/api/x" },
        })}
      />
    );
    expect(screen.getByText(/Done/)).toBeInTheDocument();
  });

  it("a complete project replaces the banner with one green success block: facts, primary and secondary downloads, one lock line", () => {
    const { container } = render(
      <NextStepBanner
        action={action("complete", {
          title: "Project complete: SOW approved",
          button: { label: "Download the approved SOW", href: "/api/x" },
        })}
        completion={{
          approvedOn: "2026-10-19",
          versionNumber: 2,
          sowHref: "/api/projects/p1/sow/s2",
          estimateHref: "/api/projects/p1/estimates/e1/versions/v3",
        }}
      />
    );
    expect(container.querySelector("section")).toHaveAttribute("data-tone", "success");
    expect(screen.getByRole("heading")).toHaveTextContent("SOW approved · 19 Oct 2026 · v2");
    const sow = screen.getByRole("link", { name: "Download SOW" });
    expect(sow).toHaveAttribute("href", "/api/projects/p1/sow/s2");
    expect(sow.className).toContain("bg-primary");
    const estimate = screen.getByRole("link", { name: "Download estimate" });
    expect(estimate.className).not.toContain("bg-primary ");
    expect(estimate.className).toContain("border-primary");
    expect(screen.getAllByText("Locked. Changes will need a change request (coming soon).")).toHaveLength(1);
  });

  it("offers no estimate download when there is none", () => {
    render(
      <NextStepBanner
        action={action("complete")}
        completion={{ approvedOn: "2026-10-19", versionNumber: 1, sowHref: "/x", estimateHref: null }}
      />
    );
    expect(screen.queryByRole("link", { name: "Download estimate" })).toBeNull();
  });
});
