// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProcessingOverlay } from "@/components/ui/ProcessingOverlay";
import { INTAKE_PROCESSING_STAGES } from "@/lib/intakeProcessingStages";

const STAGES = [...INTAKE_PROCESSING_STAGES];

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

describe("ProcessingOverlay", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    render(
      <ProcessingOverlay
        isOpen={false}
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="active"
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("appears as a modal dialog the instant isOpen is true, with all stage labels shown as text", () => {
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={1}
        status="active"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Setting up your project")).toBeInTheDocument();
    for (const stage of STAGES) {
      expect(within(dialog).getAllByText(stage).length).toBeGreaterThan(0);
    }
  });

  it("announces the current stage through a polite live region that updates as stageIndex advances", () => {
    const { rerender } = render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="active"
      />
    );

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveTextContent(STAGES[0]);
    expect(liveRegion).toHaveAttribute("aria-live", "polite");

    rerender(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={2}
        status="active"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(STAGES[2]);
  });

  it("shows an elapsed-time reassurance message instead of looping when isFinalHold is true", () => {
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={STAGES.length - 1}
        status="active"
        isFinalHold
        elapsedInFinalHoldMs={9000}
      />
    );

    expect(screen.getByTestId("stage-elapsed-hint")).toHaveTextContent("9s elapsed");
  });

  it("falls back to a static, non-animated indicator when prefers-reduced-motion is set", () => {
    mockMatchMedia(true);
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="active"
      />
    );

    expect(screen.getByTestId("processing-overlay")).toHaveAttribute("data-reduced-motion", "true");
    expect(document.querySelector(".thinking-dot")).not.toBeInTheDocument();
  });

  it("renders animated dots when reduced motion is not requested", () => {
    mockMatchMedia(false);
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="active"
      />
    );

    expect(screen.getByTestId("processing-overlay")).toHaveAttribute("data-reduced-motion", "false");
    expect(document.querySelectorAll(".thinking-dot").length).toBeGreaterThan(0);
  });

  it("shows the failure reason and offers a retry action in the error state", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDismissError = vi.fn();
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={1}
        status="error"
        errorMessage="Claude couldn't classify this brief."
        onRetry={onRetry}
        onDismissError={onDismissError}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText("Claude couldn't classify this brief.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape only in the error state, never while actively processing", async () => {
    const user = userEvent.setup();
    const onDismissError = vi.fn();
    const { rerender } = render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="active"
        onDismissError={onDismissError}
      />
    );

    await user.keyboard("{Escape}");
    expect(onDismissError).not.toHaveBeenCalled();

    rerender(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={0}
        status="error"
        errorMessage="failed"
        onDismissError={onDismissError}
      />
    );

    await user.keyboard("{Escape}");
    expect(onDismissError).toHaveBeenCalledTimes(1);
  });

  it("traps focus inside the dialog and restores it to the previously focused element once closed", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          <ProcessingOverlay
            isOpen={open}
            title="Setting up your project"
            stages={STAGES}
            stageIndex={0}
            status="error"
            errorMessage="failed"
            onDismissError={() => setOpen(false)}
            onRetry={() => {}}
          />
        </div>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open" });
    openButton.focus();
    await user.click(openButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(openButton);
  });

  it("renders a success state for dismissal into results", () => {
    render(
      <ProcessingOverlay
        isOpen
        title="Setting up your project"
        stages={STAGES}
        stageIndex={STAGES.length - 1}
        status="success"
        successMessage="Project created."
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Project created.");
  });
});
