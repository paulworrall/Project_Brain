// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const searchProjectsAction = vi.fn();

vi.mock("@/app/(dashboard)/actions", () => ({
  searchProjectsAction,
}));

const { GlobalProjectSearch } = await import("@/components/features/GlobalProjectSearch");

describe("GlobalProjectSearch", () => {
  it("does not search until at least 2 characters are typed", async () => {
    const user = userEvent.setup();
    render(<GlobalProjectSearch />);

    await user.type(screen.getByLabelText("Search projects"), "a");

    expect(searchProjectsAction).not.toHaveBeenCalled();
  });

  it("shows matching results after typing, each linking to its project", async () => {
    searchProjectsAction.mockResolvedValueOnce([
      { id: "proj_1", name: "Loyalty App Relaunch", clientName: "Coffee", workstreamName: "Coffee Loyalty App" },
    ]);
    const user = userEvent.setup();
    render(<GlobalProjectSearch />);

    await user.type(screen.getByLabelText("Search projects"), "Loyalty");

    await waitFor(() => expect(screen.getByText("Loyalty App Relaunch")).toBeInTheDocument());
    expect(screen.getByText("Coffee / Coffee Loyalty App")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Loyalty App Relaunch/ })).toHaveAttribute(
      "href",
      "/projects/proj_1"
    );
  });

  it("shows a no-results message when nothing matches", async () => {
    searchProjectsAction.mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<GlobalProjectSearch />);

    await user.type(screen.getByLabelText("Search projects"), "zzzzz");

    await waitFor(() => expect(screen.getByText("No projects found.")).toBeInTheDocument());
  });
});
