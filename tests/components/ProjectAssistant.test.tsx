// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendAssistantMessageAction = vi.fn();
vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({ sendAssistantMessageAction }));

const { ProjectAssistant } = await import("@/components/features/ProjectAssistant");

function sentFields(call: number) {
  const formData = sendAssistantMessageAction.mock.calls[call][1] as FormData;
  return {
    message: formData.get("message"),
    mode: formData.get("mode"),
  };
}

beforeEach(() => sendAssistantMessageAction.mockReset());

describe("ProjectAssistant", () => {
  it("is one panel with one input and the brief's placeholder", () => {
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    expect(screen.getByRole("heading", { name: "Project assistant" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Ask a question, or tell me something new about this project"
    );
    expect(screen.queryByText("Ask me anything")).toBeNull();
    expect(screen.queryByText("Keep This Project Up to Date")).toBeNull();
  });

  it("sends the message for classification and shows the answer in the live log", async () => {
    const user = userEvent.setup();
    sendAssistantMessageAction.mockResolvedValue({
      ok: true,
      data: { kind: "answer", answer: "£50k." },
    });
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "What's the budget?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(sentFields(0)).toEqual({
      message: "What's the budget?",
      mode: "auto",
    });
    const log = screen.getByRole("log", { name: "Project assistant conversation" });
    expect(await within(log).findByText("£50k.")).toBeInTheDocument();
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("confirms what a typed update changed", async () => {
    const user = userEvent.setup();
    sendAssistantMessageAction.mockResolvedValue({
      ok: true,
      data: { kind: "updated", confirmation: "Updated: timeline, budget constraint", notice: "Saved as v3." },
    });
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Launch moves to March{Enter}");
    expect(await screen.findByText("Updated: timeline, budget constraint")).toBeInTheDocument();
  });

  it("has no file input, source choice or history any more (FB-010: they moved to Add project information)", () => {
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    expect(screen.queryByLabelText(/attach a file/i)).toBeNull();
    expect(screen.queryByRole("radio", { name: "Internal team" })).toBeNull();
    expect(screen.queryByText(/View history/)).toBeNull();
    expect(screen.getByText(/use Add project information above/)).toBeInTheDocument();
  });

  it("asks which was meant with two keyboard-operable buttons, then resends with the choice", async () => {
    const user = userEvent.setup();
    sendAssistantMessageAction
      .mockResolvedValueOnce({ ok: true, data: { kind: "choose" } })
      .mockResolvedValueOnce({
        ok: true,
        data: { kind: "updated", confirmation: "Updated: budget" },
      });
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "budget 60k{Enter}");

    expect(
      await screen.findByText("Is that a question, or an update to record on the project?")
    ).toBeInTheDocument();
    const question = screen.getByRole("button", { name: "A question" });
    expect(question).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "An update" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(sentFields(1)).toEqual({ message: "budget 60k", mode: "update" });
    expect(await screen.findByText("Updated: budget")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A question" })).toBeNull();
  });

  it("shows a declined update on a complete project alongside the answer", async () => {
    const user = userEvent.setup();
    sendAssistantMessageAction.mockResolvedValue({
      ok: true,
      data: {
        kind: "answer_and_declined",
        answer: "22 October.",
        declined: "This project is complete. Changes will need a change request (coming soon).",
      },
    });
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "x{Enter}");
    expect(await screen.findByText(/This project is complete/)).toBeInTheDocument();
    expect(screen.getByText("22 October.")).toBeInTheDocument();
  });

  it("announces errors", async () => {
    const user = userEvent.setup();
    sendAssistantMessageAction.mockResolvedValue({
      ok: false,
      code: "VALIDATION",
      message: "Rate limited.",
    });
    render(<ProjectAssistant projectId="p1" projectName="Fizzy" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limited.");
  });
});
