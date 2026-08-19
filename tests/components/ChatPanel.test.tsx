// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const askChatbotAction = vi.fn();

vi.mock("@/app/(dashboard)/projects/[projectId]/actions", () => ({
  askChatbotAction,
}));

const { ChatPanel } = await import("@/components/features/ChatPanel");

describe("ChatPanel", () => {
  it("renders the project name and an empty-state message before any question is asked", () => {
    render(<ChatPanel projectId="proj_1" projectName="Fizzy Summer Launch" />);

    expect(screen.getByText(/Ask anything about Fizzy Summer Launch/)).toBeInTheDocument();
    expect(screen.getByText(/grounded strictly in this project's own/)).toBeInTheDocument();
  });

  it("shows the asked question and the returned answer once the action resolves", async () => {
    askChatbotAction.mockResolvedValueOnce({ answer: "The budget is confirmed at £120k." });
    const user = userEvent.setup();
    render(<ChatPanel projectId="proj_1" projectName="Fizzy Summer Launch" />);

    await user.type(
      screen.getByPlaceholderText(/Ask about scope, risks, estimates, documents/),
      "What's the budget?"
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() =>
      expect(screen.getByText(/You:\s*What's the budget\?/)).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText("The budget is confirmed at £120k.")).toBeInTheDocument()
    );
  });

  it("shows an error message returned by the action", async () => {
    askChatbotAction.mockResolvedValueOnce({ message: "The AI service couldn't answer that." });
    const user = userEvent.setup();
    render(<ChatPanel projectId="proj_1" projectName="Fizzy Summer Launch" />);

    await user.type(
      screen.getByPlaceholderText(/Ask about scope, risks, estimates, documents/),
      "What's the budget?"
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() =>
      expect(screen.getByText(/The AI service couldn't answer that\./)).toBeInTheDocument()
    );
  });
});
