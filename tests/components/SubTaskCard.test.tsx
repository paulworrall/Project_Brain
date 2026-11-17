// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubTaskCard, SubTaskGroup, OpenSubTaskButton } from "@/components/features/SubTaskCard";
import type { SubTask } from "@/lib/project/subTasks";

function task(overrides: Partial<SubTask> = {}): SubTask {
  return {
    id: "brief.key-details",
    step: "brief",
    number: 2,
    title: "Key details",
    status: "not_started",
    summary: null,
    blocked: null,
    current: false,
    ...overrides,
  };
}

describe("SubTaskCard (FB-012)", () => {
  it("the current task opens expanded with a navy left border; the header is a button with aria-expanded and aria-controls", () => {
    render(
      <SubTaskCard task={task({ current: true, status: "in_progress", summary: "3 of 4 captured" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    const header = screen.getByRole("button", { name: /Key details/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    const bodyId = header.getAttribute("aria-controls")!;
    expect(document.getElementById(bodyId)).toBeVisible();
    expect(screen.getByText("Body")).toBeVisible();
    expect(screen.getByRole("group", { name: /Key details/ }).className).toContain("border-l-navy");
    // Number, title, status badge and summary are all in the header.
    expect(header).toHaveTextContent("2");
    expect(header).toHaveTextContent("Key details");
    expect(header).toHaveTextContent("In progress");
    expect(header).toHaveTextContent("3 of 4 captured");
  });

  it("a done task is collapsed to one line, with an Edit action, and expands on click", async () => {
    const user = userEvent.setup();
    render(
      <SubTaskCard task={task({ status: "done", summary: "4 of 4 captured" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    const header = screen.getByRole("button", { name: /Key details/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header).toHaveTextContent("Done");
    expect(header).toHaveTextContent("Edit");
    expect(screen.getByText("Body")).not.toBeVisible();
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Body")).toBeVisible();
    await user.click(header);
    expect(screen.getByText("Body")).not.toBeVisible();
  });

  it("a later task is collapsed and muted, with Open", () => {
    render(
      <SubTaskCard task={task()}>
        <p>Body</p>
      </SubTaskCard>
    );
    expect(screen.getByRole("group").className).toContain("bg-surface-muted");
    expect(screen.getByRole("button", { name: /Key details/ })).toHaveTextContent("Open");
  });

  it("a blocked task shows its reason, cannot be expanded and has no Open action", async () => {
    const user = userEvent.setup();
    render(
      <SubTaskCard task={task({ title: "Estimate brief", blocked: "Choose teams first" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    const header = screen.getByRole("button", { name: /Estimate brief/ });
    expect(header).toHaveTextContent("Choose teams first");
    expect(header).not.toHaveAttribute("aria-expanded");
    expect(header).toHaveAttribute("aria-disabled", "true");
    expect(header).not.toHaveTextContent("Open");
    await user.click(header);
    expect(screen.queryByText("Body")).toBeNull();
  });

  it("a complete project's cards are read-only: the body's controls are disabled but the header still expands to read", async () => {
    const user = userEvent.setup();
    render(
      <SubTaskCard task={task({ status: "locked" })} readOnly>
        <input aria-label="Field" />
      </SubTaskCard>
    );
    const header = screen.getByRole("button", { name: /Key details/ });
    expect(header).toBeEnabled();
    await user.click(header);
    expect(screen.getByLabelText("Field")).toBeDisabled();
  });

  it("a task that becomes current after an action opens by itself", () => {
    const { rerender } = render(
      <SubTaskCard task={task({ status: "not_started" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    expect(screen.getByRole("button", { name: /Key details/ })).toHaveAttribute("aria-expanded", "false");
    rerender(
      <SubTaskCard task={task({ status: "not_started", current: true })}>
        <p>Body</p>
      </SubTaskCard>
    );
    expect(screen.getByRole("button", { name: /Key details/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("announces a change of status politely", () => {
    const { rerender } = render(
      <SubTaskCard task={task({ status: "in_progress" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("");
    rerender(
      <SubTaskCard task={task({ status: "done" })}>
        <p>Body</p>
      </SubTaskCard>
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Key details: Done");
  });

  it("opens when the URL hash points at something inside it", () => {
    window.location.hash = "#scope-gate";
    render(
      <SubTaskCard task={task({ status: "done" })}>
        <div id="scope-gate">Gate</div>
      </SubTaskCard>
    );
    expect(screen.getByRole("button", { name: /Key details/ })).toHaveAttribute("aria-expanded", "true");
    window.location.hash = "";
  });

  it("OpenSubTaskButton opens another card in the same group", async () => {
    const user = userEvent.setup();
    render(
      <SubTaskGroup>
        <SubTaskCard task={task({ id: "estimate.build", title: "Build the estimate", status: "done" })}>
          <p>Estimates</p>
        </SubTaskCard>
        <SubTaskCard task={task({ id: "estimate.approval", title: "Client approval", current: true })}>
          <OpenSubTaskButton targetId="estimate.build">Open the estimates</OpenSubTaskButton>
        </SubTaskCard>
      </SubTaskGroup>
    );
    expect(screen.getByRole("button", { name: /Build the estimate/ })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Open the estimates" }));
    expect(screen.getByRole("button", { name: /Build the estimate/ })).toHaveAttribute("aria-expanded", "true");
  });
});
