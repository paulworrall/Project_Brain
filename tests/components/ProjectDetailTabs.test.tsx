// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDetailTabs } from "@/components/features/ProjectDetailTabs";

describe("ProjectDetailTabs", () => {
  it("shows the Stage Tracker tab as active by default", () => {
    render(<ProjectDetailTabs />);

    expect(screen.getByRole("tab", { name: "Stage Tracker" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByText(/Stage Tracker — coming in task 7.1/)).toBeInTheDocument();
  });

  it("switches panels when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(<ProjectDetailTabs />);

    await user.click(screen.getByRole("tab", { name: "Chatbot" }));

    expect(screen.getByRole("tab", { name: "Chatbot" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Stage Tracker" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    expect(
      screen.getByText(/Project Brain Chatbot — coming in task 8.3-8.4/)
    ).toBeInTheDocument();
  });

  it("renders all four tabs", () => {
    render(<ProjectDetailTabs />);

    expect(screen.getByRole("tab", { name: "Stage Tracker" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Outputs Library" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chatbot" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Knowledge Upload" })).toBeInTheDocument();
  });
});
