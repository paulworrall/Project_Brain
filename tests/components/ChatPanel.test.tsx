// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatPanel } from "@/components/features/ChatPanel";

describe("ChatPanel", () => {
  it("renders the project name and a disabled input placeholder", () => {
    render(<ChatPanel projectName="Fizzy Summer Launch" />);

    expect(screen.getByText(/Ask anything about Fizzy Summer Launch/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Ask about scope, risks, estimates, documents/)
    ).toBeDisabled();
  });
});
