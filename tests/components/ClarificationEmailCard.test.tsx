// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarificationEmailCard } from "@/components/features/ClarificationEmailCard";

describe("ClarificationEmailCard", () => {
  it("shows a 'not yet generated' placeholder, no download button, and no view-full link when there's no email", () => {
    render(<ClarificationEmailCard projectId="proj_1" email={null} />);

    expect(screen.getByText("Not yet generated.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View full email/ })).not.toBeInTheDocument();
  });

  it("shows a compact summary — subject, word count, download button, and a link to the full email — once it exists", () => {
    render(
      <ClarificationEmailCard
        projectId="proj_1"
        email={{ subject: "Quick questions", bodyText: "Hi Jamie, following up on one item." }}
      />
    );

    expect(screen.getByText("Quick questions")).toBeInTheDocument();
    expect(screen.getByText(/7 words/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    // The full body text no longer renders inline on this page.
    expect(screen.queryByText(/Hi Jamie, following up/)).not.toBeInTheDocument();

    const link = screen.getByRole("link", { name: /View full email/ });
    expect(link).toHaveAttribute("href", "/projects/proj_1/outputs/CLARIFICATION_EMAIL");
  });

  describe("download button", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:mock-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("builds a downloadable text blob from the email when clicked", async () => {
      const user = userEvent.setup();
      render(
        <ClarificationEmailCard
          projectId="proj_1"
          email={{ subject: "Quick questions", bodyText: "Hi Jamie, following up..." }}
        />
      );

      await user.click(screen.getByRole("button", { name: "Download" }));

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
      expect(blob.type).toBe("text/plain");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });
});
