// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClarificationEmailCard } from "@/components/features/ClarificationEmailCard";

describe("ClarificationEmailCard", () => {
  it("shows a 'not yet generated' placeholder and no download button when there's no email", () => {
    render(<ClarificationEmailCard email={null} />);

    expect(screen.getByText("Not yet generated.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("shows the email content and a download button once it exists", () => {
    render(
      <ClarificationEmailCard
        email={{ subject: "Quick questions", bodyText: "Hi Jamie, following up..." }}
      />
    );

    expect(screen.getByText("Quick questions")).toBeInTheDocument();
    expect(screen.getByText(/Hi Jamie, following up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
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
