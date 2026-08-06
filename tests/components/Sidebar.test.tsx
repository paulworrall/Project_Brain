// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/layout/Sidebar";

describe("Sidebar", () => {
  it("renders primary navigation with a link to the taxonomy browser", () => {
    render(<Sidebar />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "All Projects" });
    expect(link).toHaveAttribute("href", "/");
  });
});
