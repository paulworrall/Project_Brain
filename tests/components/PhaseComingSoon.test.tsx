// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseComingSoon } from "@/components/features/PhaseComingSoon";
import { PROJECT_PHASES, getPhase } from "@/lib/projectPhases";

describe("PhaseComingSoon", () => {
  it.each(PROJECT_PHASES.filter((p) => !p.available))("renders $label's config content", (phase) => {
    render(<PhaseComingSoon phase={phase} />);
    expect(
      screen.getByRole("heading", { level: 2, name: `${phase.label} — ${phase.verbs[0]} · ${phase.verbs[1]}` })
    ).toBeInTheDocument();
    expect(screen.getByText(phase.purpose)).toBeInTheDocument();
    for (const activity of phase.activities) expect(screen.getByText(activity)).toBeInTheDocument();
    expect(screen.getByText(phase.deliverable)).toBeInTheDocument();
    expect(screen.getByText(phase.exitGate)).toBeInTheDocument();
    expect(screen.getByText("Coming soon — this phase is being designed")).toBeInTheDocument();
  });

  it("contains no interactive controls", () => {
    render(<PhaseComingSoon phase={getPhase("define")} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
