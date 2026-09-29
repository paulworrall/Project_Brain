// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  saveBriefAttributeAction: vi.fn().mockResolvedValue(undefined),
  rereadBriefAttributesAction: vi.fn(),
}));

const actions = await import("@/app/(dashboard)/projects/[projectId]/actions");
const saveBriefAttributeAction = actions.saveBriefAttributeAction as unknown as ReturnType<typeof vi.fn>;
const { BriefChecklist } = await import("@/components/features/BriefChecklist");
const { evaluateBriefCompleteness } = await import("@/lib/briefCompleteness");
const { briefRecord, ALL_REQUIRED_CONFIRMED } = await import("../fixtures/briefCompleteness");
const { REQUIRED_BRIEF_ATTRIBUTES, OPTIONAL_BRIEF_ATTRIBUTES } = await import("@/lib/briefAttributes");

type Records = Parameters<typeof evaluateBriefCompleteness>[0];

function completeness(records: Records = [], updateNumbers = new Map<string, number>()) {
  return evaluateBriefCompleteness(records, { currentStageNumber: 3 }, updateNumbers);
}

function renderChecklist(records: Records = [], updateNumbers?: Map<string, number>) {
  return render(
    <BriefChecklist projectId="proj_1" completeness={completeness(records, updateNumbers)} />
  );
}

function row(attributeId: string): HTMLElement {
  return document.getElementById(`brief-attribute-${attributeId}`)!;
}

describe("BriefChecklist — What We Need to Find Out", () => {
  it("lists the required details first, in config order, and the optional ones in a separate group", () => {
    renderChecklist();

    const required = screen.getByRole("list", { name: "Required details" });
    const headings = within(required)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings).toEqual(REQUIRED_BRIEF_ATTRIBUTES.map((a) => a.label));
    expect(headings).toEqual(["Budget", "Objective", "Timeline and Key Milestones", "Client Contact"]);

    const optional = screen.getByRole("list", { name: "Optional details", hidden: true });
    expect(
      within(optional)
        .getAllByRole("heading", { hidden: true })
        .map((h) => h.textContent)
    ).toEqual(OPTIONAL_BRIEF_ATTRIBUTES.map((a) => a.label));
    expect(screen.getByText(/never block readiness/)).toBeInTheDocument();
  });

  it("trusts captured values by default — no review, confirm or suggestion wording anywhere", () => {
    renderChecklist([
      briefRecord("budget", { amount: "roughly €110,000 (EUR)" }, { kind: "SUGGESTION", source: "BRIEF" }),
    ]);

    expect(row("budget")).toHaveTextContent("Captured");
    expect(row("budget")).toHaveTextContent("From brief");
    expect(screen.getByText("1 of 4 required details captured", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/review and confirm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/suggestion/i)).not.toBeInTheDocument();
  });

  it("tags each value with where it came from: the brief, a numbered update or a PM edit", () => {
    renderChecklist(
      [
        briefRecord("budget", { amount: "£50k" }, { kind: "SUGGESTION", source: "BRIEF" }),
        briefRecord(
          "objective",
          { objective: "Relaunch", successMeasures: "More actives" },
          { kind: "SUGGESTION", source: "UPDATE", knowledgeItemId: "ki_b" }
        ),
        briefRecord("clientContact", { name: "Caroline", email: "c@fizzy.example" }),
      ],
      new Map([
        ["ki_a", 1],
        ["ki_b", 2],
      ])
    );

    expect(within(row("budget")).getByText("From brief")).toBeInTheDocument();
    expect(within(row("objective")).getByText("From update v2")).toBeInTheDocument();
    expect(within(row("clientContact")).getByText("Edited by PM")).toBeInTheDocument();
  });

  it("is summary first: one line per detail, with the full value and source quote under 'Show more'", async () => {
    const user = userEvent.setup();
    renderChecklist([
      briefRecord(
        "objective",
        { objective: "Relaunch the loyalty app", successMeasures: "20% more monthly actives" },
        { kind: "SUGGESTION", source: "BRIEF", evidence: "we want to relaunch the app" }
      ),
    ]);

    const objective = row("objective");
    expect(within(objective).getByText("Relaunch the loyalty app · 20% more monthly actives")).toBeVisible();
    expect(within(objective).getByText(/we want to relaunch the app/)).not.toBeVisible();

    await user.click(within(objective).getByText("Show more"));
    expect(within(objective).getByText(/we want to relaunch the app/)).toBeVisible();
  });

  it("shows each item's status, and exactly which sub-fields a partial item still needs", () => {
    renderChecklist([
      briefRecord("budget", { amount: "£50,000" }),
      briefRecord("clientContact", { name: "Caroline" }),
    ]);

    expect(row("budget")).toHaveTextContent("Captured");
    expect(row("clientContact")).toHaveTextContent("Partial");
    expect(row("clientContact")).toHaveTextContent("Still needed: Email");
    expect(row("objective")).toHaveTextContent("Missing");
    expect(screen.getByText("1 of 4 required details captured", { exact: false })).toBeInTheDocument();
  });

  it("puts Update on each captured detail's row, and Add on each missing one", () => {
    renderChecklist([briefRecord("budget", { amount: "£50,000" })]);

    expect(within(row("budget")).getByRole("button", { name: "Update Budget" })).toHaveTextContent("Update");
    expect(within(row("objective")).getByRole("button", { name: "Add Objective" })).toHaveTextContent("Add");
    expect(screen.queryByText(/Fill in/)).not.toBeInTheDocument();
  });

  it("opens a prefilled free-text field on Update, with Save and Cancel", async () => {
    const user = userEvent.setup();
    renderChecklist([briefRecord("budget", { amount: "roughly €110,000", currency: "EUR" })]);

    await user.click(screen.getByRole("button", { name: "Update Budget" }));

    const field = within(row("budget")).getByRole("textbox", { name: /Budget/ });
    expect(field.tagName).toBe("TEXTAREA");
    // An old amount + currency is combined into the one free-text value.
    expect(field).toHaveValue("roughly €110,000 (EUR)");

    await user.click(within(row("budget")).getByRole("button", { name: "Cancel" }));
    expect(within(row("budget")).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(row("budget")).getByRole("button", { name: "Update Budget" })).toBeInTheDocument();
  });

  it("saves the PM's text and closes the field", async () => {
    const user = userEvent.setup();
    saveBriefAttributeAction.mockClear();
    renderChecklist();

    await user.click(screen.getByRole("button", { name: "Add Budget" }));
    const field = within(row("budget")).getByRole("textbox", { name: /Budget/ });
    expect(field).toHaveValue("");
    await user.type(field, "£75k");
    await user.click(within(row("budget")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveBriefAttributeAction).toHaveBeenCalled());
    const [projectId, attributeId, , submitted] = saveBriefAttributeAction.mock.calls[0];
    expect([projectId, attributeId]).toEqual(["proj_1", "budget"]);
    expect((submitted as FormData).get("amount")).toBe("£75k");
    await waitFor(() => expect(within(row("budget")).queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("optional details never count against readiness", () => {
    renderChecklist([...ALL_REQUIRED_CONFIRMED]);

    expect(screen.getByText("4 of 4 required details captured", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Optional details \(0 of 4 captured\)/)).toBeInTheDocument();
  });

  it("is derived from attribute status alone — a new value shows on the next render, no regeneration", () => {
    const { rerender } = renderChecklist();
    expect(row("budget")).toHaveTextContent("Missing");

    rerender(
      <BriefChecklist
        projectId="proj_1"
        completeness={completeness([briefRecord("budget", { amount: "£50,000" })])}
      />
    );
    expect(row("budget")).toHaveTextContent("Captured");
  });

  describe("Timeline and Key Milestones", () => {
    it("summarises the timeline on one line, with each milestone as name + date under 'Show more'", async () => {
      const user = userEvent.setup();
      renderChecklist([
        briefRecord("timeline", {
          startDate: "2026-10-01",
          endDate: "2026-12-15",
          milestones: [
            { name: "Beta", date: "2026-11-01" },
            { name: "Launch", date: null },
          ],
        }),
      ]);

      const timeline = row("timeline");
      expect(timeline).toHaveTextContent("Start date: 1 Oct 2026 · End date: 15 Dec 2026 · 2 milestones");

      await user.click(within(timeline).getByText("Show more"));
      expect(timeline).toHaveTextContent("Start date1 Oct 2026");
      expect(timeline).toHaveTextContent("End date15 Dec 2026");
      const items = within(timeline)
        .getAllByRole("listitem")
        .map((li) => li.textContent);
      expect(items).toEqual(["Beta — 1 Nov 2026", "Launch — Date not confirmed"]);
    });

    it("says clearly when no milestones or end date are captured yet", () => {
      renderChecklist([briefRecord("timeline", { startDate: "2026-10-01" })]);

      const timeline = row("timeline");
      expect(timeline).toHaveTextContent("Captured");
      expect(timeline).toHaveTextContent("No milestones confirmed yet");
      expect(timeline).toHaveTextContent("End dateNot captured yet");
    });
  });
});
