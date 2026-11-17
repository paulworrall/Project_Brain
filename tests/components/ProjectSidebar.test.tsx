// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  addProjectInformationAction: vi.fn(),
  sendAssistantMessageAction: vi.fn(),
}));

const { ProjectSidebar } = await import("@/components/features/ProjectSidebar");

const versions = [
  {
    id: "brief",
    versionNumber: 1,
    label: "Initial brief",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    source: "CLIENT" as const,
    detail: null,
    summary: null,
    changeSummary: null,
  },
];

describe("ProjectSidebar tabs (FB-012)", () => {
  it("is one panel with two tabs; Ask is the default and its input is visible", () => {
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} />);
    const tablist = screen.getByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Ask", "Add notes or files"]);
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ask" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Add notes or files" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(screen.getByLabelText("Text to add")).not.toBeVisible();
  });

  it("links each tab to its panel with aria-controls and labels", () => {
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} />);
    for (const tab of screen.getAllByRole("tab")) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }
  });

  it("arrow keys, Home and End move between tabs (roving tabindex), and select them", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} />);
    const ask = screen.getByRole("tab", { name: "Ask" });
    const add = screen.getByRole("tab", { name: "Add notes or files" });
    expect(ask).toHaveAttribute("tabindex", "0");
    expect(add).toHaveAttribute("tabindex", "-1");
    ask.focus();
    await user.keyboard("{ArrowRight}");
    expect(add).toHaveFocus();
    expect(add).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Text to add")).toBeVisible();
    await user.keyboard("{ArrowRight}");
    expect(ask).toHaveFocus();
    await user.keyboard("{End}");
    expect(add).toHaveFocus();
    await user.keyboard("{Home}");
    expect(ask).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(add).toHaveFocus();
  });

  it("keeps a draft when you switch tabs and back", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "A half-written question");
    await user.click(screen.getByRole("tab", { name: "Add notes or files" }));
    await user.click(screen.getByRole("tab", { name: "Ask" }));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("A half-written question");
  });

  it("Add to project is disabled until there is text or a file", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} />);
    await user.click(screen.getByRole("tab", { name: "Add notes or files" }));
    const button = screen.getByRole("button", { name: "Add to project" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Text to add"), "Notes");
    expect(button).toBeEnabled();
  });

  it("a complete project has only the Ask tab, and no complete-project message", () => {
    render(<ProjectSidebar projectId="p1" projectName="Fizzy" versions={versions as never} projectComplete />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Add notes or files" })).toBeNull();
    expect(screen.queryByLabelText("Text to add")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeVisible();
    expect(screen.queryByText(/This project is complete/)).toBeNull();
  });
});
