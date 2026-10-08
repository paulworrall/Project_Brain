// @vitest-environment jsdom
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SowItemDto } from "@/lib/sowReview";

const saveSowItemAction = vi.fn();
const revertSowItemAction = vi.fn();
const acceptSowSuggestionAction = vi.fn();
const dismissSowSuggestionAction = vi.fn();
const addSowItemAction = vi.fn();
const deleteSowItemAction = vi.fn();
const saveSowReviewStepAction = vi.fn(async () => undefined);

vi.mock("@/app/(dashboard)/projects/[projectId]/sow-review-actions", () => ({
  saveSowItemAction,
  revertSowItemAction,
  acceptSowSuggestionAction,
  dismissSowSuggestionAction,
  addSowItemAction,
  deleteSowItemAction,
  saveSowReviewStepAction,
}));

const { SowReviewOverlay } = await import("@/components/features/SowReviewOverlay");

function makeItem(overrides: Partial<SowItemDto> & Pick<SowItemDto, "id" | "text">): SowItemDto {
  return {
    section: "DELIVERABLES",
    agentOriginalText: overrides.text,
    source: "AGENT",
    included: true,
    position: 0,
    isNewSinceLastReview: false,
    pendingAgentSuggestion: null,
    version: 0,
    ...overrides,
  };
}

const ITEMS: SowItemDto[] = [
  makeItem({ id: "d1", text: "Rewards app for iOS and Android", position: 0 }),
  makeItem({ id: "d2", text: "Referral programme", position: 1 }),
  makeItem({ id: "s1", section: "SERVICES", text: "Experience/Creative — app design" }),
  makeItem({ id: "a1", section: "ASSUMPTIONS", text: "UK market only" }),
  makeItem({ id: "o1", section: "OUT_OF_SCOPE", text: "Legacy migration" }),
  // No risks: the Risks step is empty.
];

/** Server stand-in: applies the patch and the AGENT -> PM_EDITED rule, bumps the version. */
function echoSave(items: SowItemDto[]) {
  saveSowItemAction.mockImplementation(
    async (_projectId: string, id: string, patch: { text?: string; included?: boolean }, version: number) => {
      const current = items.find((i) => i.id === id)!;
      const item: SowItemDto = {
        ...current,
        ...patch,
        source: patch.text !== undefined && current.source === "AGENT" ? "PM_EDITED" : current.source,
        version: version + 1,
      };
      return { ok: true, item };
    }
  );
}

function renderOverlay(props: Partial<Parameters<typeof SowReviewOverlay>[0]> = {}) {
  const onClose = vi.fn();
  const onGenerate = vi.fn();
  render(
    <SowReviewOverlay
      projectId="proj_1"
      initialItems={ITEMS}
      initialStep={0}
      onClose={onClose}
      onGenerate={onGenerate}
      {...props}
    />
  );
  return { onClose, onGenerate };
}

const indicator = () => screen.getByTestId("step-indicator");

beforeEach(() => {
  for (const fn of [
    saveSowItemAction,
    revertSowItemAction,
    acceptSowSuggestionAction,
    dismissSowSuggestionAction,
    addSowItemAction,
    deleteSowItemAction,
    saveSowReviewStepAction,
  ]) {
    fn.mockReset();
  }
  saveSowReviewStepAction.mockResolvedValue(undefined);
  echoSave(ITEMS);
});

describe("SowReviewOverlay — stepping through", () => {
  it("steps Deliverables → Services → Assumptions → Out of Scope → Risks → Review & generate, with 'Step N of 6' each time", async () => {
    const user = userEvent.setup();
    renderOverlay();

    expect(indicator()).toHaveTextContent("Step 1 of 6: Deliverables");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(indicator()).toHaveTextContent("Step 2 of 6: Services");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(indicator()).toHaveTextContent("Step 3 of 6: Assumptions");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(indicator()).toHaveTextContent("Step 4 of 6: Out of Scope");
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(indicator()).toHaveTextContent("Step 5 of 6: Risks");
    // Risks is empty: confirm before continuing.
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(indicator()).toHaveTextContent("Step 6 of 6: Review & generate");
    expect(screen.getByRole("button", { name: "Generate SOW" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^next/i })).not.toBeInTheDocument();
  });

  it("Back is on every step after the first and returns to the previous one; the first step has none to go to", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialStep: 1 });

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(indicator()).toHaveTextContent("Step 1 of 6: Deliverables");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("persists the step as the PM moves, so Save & exit can resume there", async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(saveSowReviewStepAction).toHaveBeenCalledWith("proj_1", 1);
  });

  it("opens at the saved step when resuming", () => {
    renderOverlay({ initialStep: 2 });
    expect(indicator()).toHaveTextContent("Step 3 of 6: Assumptions");
    expect(screen.getByDisplayValue("UK market only")).toBeInTheDocument();
  });

  it("Save & exit records the current step and closes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay({ initialStep: 2 });

    await user.click(screen.getByRole("button", { name: /save & exit/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(saveSowReviewStepAction).toHaveBeenCalledWith("proj_1", 2);
  });
});

describe("SowReviewOverlay — validation", () => {
  it("won't leave Deliverables with no included item", async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 1/i }));
    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least one deliverable/i);
    expect(indicator()).toHaveTextContent("Step 1 of 6: Deliverables");
  });

  it("asks 'No risks listed — continue?' on an empty optional section; 'Stay here' stays, 'Continue' proceeds", async () => {
    const user = userEvent.setup();
    renderOverlay({ initialStep: 4 });

    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(screen.getByRole("alertdialog", { name: "No risks listed — continue?" })).toBeInTheDocument();
    expect(indicator()).toHaveTextContent("Step 5 of 6: Risks");

    await user.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^next/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(indicator()).toHaveTextContent("Step 6 of 6: Review & generate");
  });
});

describe("SowReviewOverlay — items and provenance", () => {
  it("labels each checkbox with its item, and shows the provenance badges", () => {
    renderOverlay({
      initialItems: [
        makeItem({ id: "d1", text: "Rewards app for iOS and Android", position: 0 }),
        makeItem({ id: "d2", text: "Referral programme", position: 1, source: "PM_EDITED", agentOriginalText: "Referrals" }),
        makeItem({ id: "d3", text: "Training workshop", position: 2, source: "PM_ADDED", agentOriginalText: null }),
        makeItem({ id: "d4", text: "Analytics", position: 3, isNewSinceLastReview: true }),
      ],
    });

    expect(screen.getByRole("checkbox", { name: "Include deliverable 1: Rewards app for iOS and Android" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include deliverable 2: Referral programme" })).toBeInTheDocument();
    const rows = screen.getAllByTestId("sow-item");
    expect(within(rows[0]).getByText("Suggested")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Edited by PM")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Added by PM")).toBeInTheDocument();
    expect(within(rows[3]).getByText("New since last review")).toBeInTheDocument();
    // Edited items offer to revert; only PM-added ones can be deleted.
    expect(within(rows[1]).getByRole("button", { name: "Revert to suggestion" })).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: "Revert to suggestion" })).not.toBeInTheDocument();
    expect(within(rows[2]).getByRole("button", { name: /delete deliverable 3/i })).toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("keeps an excluded item visible but de-emphasised", async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));

    expect(screen.getByDisplayValue("Referral programme")).toBeVisible();
    expect(screen.getAllByTestId("sow-item")[1].className).toMatch(/opacity-60/);
  });

  it("has no per-item Update button — editing saves by itself", () => {
    renderOverlay();
    expect(screen.queryByRole("button", { name: /^update/i })).not.toBeInTheDocument();
  });

  it("accepts or dismisses an agent-suggested change inline", async () => {
    const user = userEvent.setup();
    const pending = makeItem({
      id: "d1",
      text: "PM wording",
      source: "PM_EDITED",
      agentOriginalText: "Original",
      pendingAgentSuggestion: "Agent's revised wording",
    });
    acceptSowSuggestionAction.mockResolvedValue({
      ok: true,
      item: { ...pending, text: "Agent's revised wording", source: "AGENT", pendingAgentSuggestion: null, version: 1 },
    });
    renderOverlay({ initialItems: [pending, ...ITEMS.slice(1)] });

    const box = screen.getByTestId("pending-suggestion");
    expect(box).toHaveTextContent("Agent's revised wording");
    await user.click(within(box).getByRole("button", { name: "Accept" }));

    expect(acceptSowSuggestionAction).toHaveBeenCalledWith("proj_1", "d1", 0);
    await waitFor(() => expect(screen.queryByTestId("pending-suggestion")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Agent's revised wording")).toBeInTheDocument();
  });

  it("dismisses a suggested change", async () => {
    const user = userEvent.setup();
    const pending = makeItem({
      id: "d1",
      text: "PM wording",
      source: "PM_ADDED",
      agentOriginalText: null,
      pendingAgentSuggestion: "Agent take",
    });
    dismissSowSuggestionAction.mockResolvedValue({
      ok: true,
      item: { ...pending, pendingAgentSuggestion: null, version: 1 },
    });
    renderOverlay({ initialItems: [pending, ...ITEMS.slice(1)] });

    await user.click(within(screen.getByTestId("pending-suggestion")).getByRole("button", { name: "Dismiss" }));

    expect(dismissSowSuggestionAction).toHaveBeenCalledWith("proj_1", "d1", 0);
    await waitFor(() => expect(screen.queryByTestId("pending-suggestion")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("PM wording")).toBeInTheDocument();
  });

  it("'Add new' creates a PM-added item and focuses it; it can then be deleted outright", async () => {
    const user = userEvent.setup();
    addSowItemAction.mockResolvedValue(
      makeItem({ id: "new1", text: "", source: "PM_ADDED", agentOriginalText: null, position: 2 })
    );
    deleteSowItemAction.mockResolvedValue({ ok: true });
    renderOverlay();

    await user.click(screen.getByRole("button", { name: /add new deliverable/i }));

    expect(addSowItemAction).toHaveBeenCalledWith("proj_1", "DELIVERABLES");
    const textarea = await screen.findByRole("textbox", { name: "Text of deliverable 3" });
    await waitFor(() => expect(textarea).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /delete deliverable 3/i }));
    expect(deleteSowItemAction).toHaveBeenCalledWith("proj_1", "new1", 0);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Text of deliverable 3" })).not.toBeInTheDocument());
  });

  it("'Revert to suggestion' calls the server and shows the agent's wording again", async () => {
    const user = userEvent.setup();
    const edited = makeItem({ id: "d1", text: "PM wording", source: "PM_EDITED", agentOriginalText: "Agent wording" });
    revertSowItemAction.mockResolvedValue({
      ok: true,
      item: { ...edited, text: "Agent wording", source: "AGENT", version: 1 },
    });
    renderOverlay({ initialItems: [edited, ...ITEMS.slice(1)] });

    await user.click(screen.getByRole("button", { name: "Revert to suggestion" }));

    expect(revertSowItemAction).toHaveBeenCalledWith("proj_1", "d1", 0);
    expect(await screen.findByDisplayValue("Agent wording")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revert to suggestion" })).not.toBeInTheDocument();
  });
});

describe("SowReviewOverlay — autosave", () => {
  it("editing text then pressing Next flushes the save first, and the item shows as edited", async () => {
    const user = userEvent.setup();
    renderOverlay();

    const field = screen.getByRole("textbox", { name: "Text of deliverable 1" });
    await user.clear(field);
    await user.type(field, "Rewards app (iOS only)");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(saveSowItemAction).toHaveBeenCalledWith("proj_1", "d1", { text: "Rewards app (iOS only)" }, 0);
    expect(indicator()).toHaveTextContent("Step 2 of 6: Services");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getAllByTestId("sow-item")[0]).toHaveAttribute("data-source", "PM_EDITED");
    expect(screen.getAllByTestId("sow-item")[0]).toHaveTextContent("Edited by PM");
  });

  it("flushes a pending change on Back and on Save & exit too", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay({ initialStep: 1 });

    await user.click(screen.getByRole("checkbox", { name: /include service 1/i }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(saveSowItemAction).toHaveBeenCalledWith("proj_1", "s1", { included: false }, 0);

    saveSowItemAction.mockClear();
    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("button", { name: /save & exit/i }));
    expect(saveSowItemAction).toHaveBeenCalledWith("proj_1", "d2", { included: false }, 0);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("flushes on the close (X) button too", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("button", { name: "Save and close" }));

    expect(saveSowItemAction).toHaveBeenCalledWith("proj_1", "d2", { included: false }, 0);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows Saving… then Saved on the item", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    saveSowItemAction.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("textbox", { name: "Text of deliverable 1" })); // blur -> debounce
    // Force the save now rather than waiting for the debounce.
    const nextClick = user.click(screen.getByRole("button", { name: /^next/i }));
    const row = screen.getAllByTestId("sow-item")[1];
    expect(await within(row).findByText("Saving…")).toBeInTheDocument();
    expect(screen.getByTestId("sow-review-save-live")).toHaveTextContent("Saving…");
    release({ ok: true, item: { ...ITEMS[1], included: false, version: 1 } });
    await nextClick;
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await within(screen.getAllByTestId("sow-item")[1]).findByText("Saved")).toBeInTheDocument();
  });

  it("a save failure is shown on the item and blocks navigation until it is retried successfully", async () => {
    const user = userEvent.setup();
    // Every navigation attempt retries the pending save; keep failing for the first two.
    saveSowItemAction.mockResolvedValueOnce({ ok: false, code: "invalid", message: "Couldn't save this item." });
    saveSowItemAction.mockResolvedValueOnce({ ok: false, code: "invalid", message: "Couldn't save this item." });
    const { onClose } = renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    // Still on step 1, with the failure on the affected item.
    expect(indicator()).toHaveTextContent("Step 1 of 6: Deliverables");
    expect(within(screen.getAllByTestId("sow-item")[1]).getByTestId("item-save-error")).toHaveTextContent(
      "Couldn't save this item."
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be saved/i);
    // Close is blocked too.
    await user.click(screen.getByRole("button", { name: /save & exit/i }));
    expect(onClose).not.toHaveBeenCalled();
    expect(indicator()).toHaveTextContent("Step 1 of 6: Deliverables");

    // Retry succeeds -> navigation works again.
    saveSowItemAction.mockResolvedValueOnce({ ok: true, item: { ...ITEMS[1], included: false, version: 1 } });
    await user.click(within(screen.getAllByTestId("sow-item")[1]).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByTestId("item-save-error")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^next/i }));
    expect(indicator()).toHaveTextContent("Step 2 of 6: Services");
  });

  it("offers 'Keep my edit' / 'Use their version' when someone else changed the item", async () => {
    const user = userEvent.setup();
    const theirs = { ...ITEMS[1], text: "Their wording", version: 3 };
    saveSowItemAction.mockResolvedValueOnce({
      ok: false,
      code: "conflict",
      message: "Someone else changed this item while you were editing it.",
      item: theirs,
    });
    renderOverlay();

    const field = screen.getByRole("textbox", { name: "Text of deliverable 2" });
    await user.clear(field);
    await user.type(field, "My wording");
    await user.click(screen.getByRole("button", { name: /^next/i }));

    expect(screen.getByTestId("item-save-error")).toHaveTextContent(/someone else changed/i);
    await user.click(screen.getByRole("button", { name: "Use their version" }));
    expect(screen.getByDisplayValue("Their wording")).toBeInTheDocument();
    expect(screen.queryByTestId("item-save-error")).not.toBeInTheDocument();
  });
});

describe("SowReviewOverlay — review & generate", () => {
  it("shows per-section counts and jump links, and Generate hands over to the parent", async () => {
    const user = userEvent.setup();
    const items = [
      ...ITEMS.slice(0, 1),
      makeItem({ id: "d2", text: "Referral programme", position: 1, included: false }),
      makeItem({ id: "d3", text: "Workshop", position: 2, source: "PM_ADDED", agentOriginalText: null }),
      makeItem({ id: "d4", text: "Edited one", position: 3, source: "PM_EDITED", agentOriginalText: "Orig" }),
      ...ITEMS.slice(2),
    ];
    const { onGenerate } = renderOverlay({ initialItems: items, initialStep: 5 });

    expect(indicator()).toHaveTextContent("Step 6 of 6: Review & generate");
    const row = screen.getByTestId("summary-DELIVERABLES");
    // included, excluded, added, edited
    expect(within(row).getAllByRole("cell").map((c) => c.textContent?.trim())).toEqual(["3", "1", "1", "1", "Edit"]);

    await user.click(screen.getByRole("button", { name: "Generate SOW" }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));

    await user.click(within(screen.getByTestId("summary-SERVICES")).getByRole("button", { name: /go to step 2: services/i }));
    expect(indicator()).toHaveTextContent("Step 2 of 6: Services");
  });

  it("won't generate with no included deliverable", async () => {
    const user = userEvent.setup();
    const { onGenerate } = renderOverlay({
      initialItems: ITEMS.map((i) => (i.section === "DELIVERABLES" ? { ...i, included: false } : i)),
      initialStep: 5,
    });

    await user.click(screen.getByRole("button", { name: "Generate SOW" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least one deliverable/i);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("flags suggested changes still waiting, and disables controls while generating", () => {
    renderOverlay({
      initialItems: [{ ...ITEMS[0], pendingAgentSuggestion: "Something else" }, ...ITEMS.slice(1)],
      initialStep: 5,
      generating: true,
    });

    expect(screen.getByText(/1 suggested change is still waiting/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate SOW" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});

describe("SowReviewOverlay — accessibility", () => {
  it("is a modal dialog labelled by its heading, focused on the heading when it opens", () => {
    renderOverlay();
    const dialog = screen.getByRole("dialog", { name: /review the deliverables/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: /review the deliverables/i })).toHaveFocus();
  });

  it("traps Tab inside the overlay", async () => {
    const user = userEvent.setup();
    renderOverlay();
    const dialog = screen.getByRole("dialog");

    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 5; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("restores focus to the triggering button when it closes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open review
          </button>
          {open && (
            <SowReviewOverlay
              projectId="proj_1"
              initialItems={ITEMS}
              initialStep={0}
              onClose={() => setOpen(false)}
              onGenerate={() => {}}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open review" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save & exit/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("announces step changes in a polite live region", async () => {
    const user = userEvent.setup();
    renderOverlay();
    const live = screen.getByTestId("sow-review-live");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: /^next/i }));

    await waitFor(() => expect(live).toHaveTextContent("Step 2 of 6: Services"));
  });

  it("announces save progress and failures", async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.click(screen.getByRole("button", { name: /^next/i }));
    await waitFor(() => expect(screen.getByTestId("sow-review-save-live")).toHaveTextContent("All changes saved."));
    expect(screen.getByTestId("sow-review-save-live")).toHaveAttribute("aria-live", "polite");

    saveSowItemAction.mockResolvedValueOnce({ ok: false, code: "invalid", message: "Nope" });
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("checkbox", { name: /include deliverable 1/i }));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    await waitFor(() =>
      expect(screen.getByTestId("sow-review-save-live")).toHaveTextContent("1 item couldn't be saved.")
    );
    expect(screen.getByTestId("sow-review-live")).toHaveTextContent(/couldn't be saved/i);
  });

  it("closes (saving first) on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay();

    await user.click(screen.getByRole("checkbox", { name: /include deliverable 2/i }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(saveSowItemAction).toHaveBeenCalledWith("proj_1", "d2", { included: false }, 0);
  });

  it("is fully operable by keyboard: tab to a checkbox, toggle with Space, advance with Enter on Next", async () => {
    const user = userEvent.setup();
    renderOverlay();

    const checkbox = screen.getByRole("checkbox", { name: /include deliverable 1/i });
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).not.toBeChecked();

    const next = screen.getByRole("button", { name: /^next/i });
    next.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(indicator()).toHaveTextContent("Step 2 of 6: Services"));
  });
});
